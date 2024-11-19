import type { Express } from "express";
import passport from "passport";
import { db, pool } from "../db/index.js";
import { users, journals, quests } from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { analyzeEntry, generateQuests, calculateQuestCompletion } from "./openai.js";
import { ensureAuthenticated } from "./auth.js";
import type { User, Journal, Quest } from "../db/schema.js";
import { PoolClient } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

// Enhanced character progress update with validation and error handling
async function updateCharacterProgress(userId: number, analysis: any, client?: PoolClient) {
  const queryRunner = client ? drizzle(client, { schema: { users, journals, quests } }) : db;
  
  try {
    const user = await queryRunner.select().from(users).where(eq(users.id, userId)).limit(1).execute().then(rows => rows[0]);

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const character = user.character as any;
    const stats = character.stats || {
      wellness: 1,
      social: 1,
      growth: 1,
      achievement: 1
    };

    // Validate and update stats with bounds checking
    Object.entries(analysis.statChanges || {}).forEach(([stat, change]) => {
      if (stats[stat] !== undefined) {
        const numericChange = Number(change);
        if (!isNaN(numericChange)) {
          const boundedChange = Math.max(-1, Math.min(1, numericChange));
          stats[stat] = Math.max(1, Math.min(10, stats[stat] + boundedChange));
        }
      }
    });

    // Calculate XP gain with weighted bonuses
    const baseXP = 50;
    const growthBonus = (analysis.growthAreas?.length || 0) * 10;
    const insightBonus = (analysis.characterProgression?.insights?.length || 0) * 5;
    const skillBonus = (analysis.characterProgression?.skillsImproved?.length || 0) * 8;
    
    const xpGain = baseXP + growthBonus + insightBonus + skillBonus;
    const newXp = (character.xp || 0) + xpGain;
    const newLevel = Math.floor(newXp / 1000) + 1;

    // Update character with new stats and progression
    const updatedCharacter = {
      ...character,
      level: newLevel,
      xp: newXp,
      stats,
      achievements: [
        ...(character.achievements || []),
        ...(analysis.characterProgression?.insights || []).map((insight: string) => ({
          title: "New Insight",
          description: insight,
          timestamp: new Date().toISOString()
        }))
      ]
    };

    await queryRunner.update(users)
      .set({ character: updatedCharacter })
      .where(eq(users.id, userId))
      .execute();

    return updatedCharacter;
  } catch (error) {
    console.error('Error updating character progress:', error);
    throw error;
  }
}

// Enhanced quest generation with retry logic
async function generateQuestsWithRetry(analysis: any, maxRetries = 3): Promise<Quest[]> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await generateQuests(analysis);
    } catch (error: any) {
      console.error(`Quest generation attempt ${attempt + 1} failed:`, error);
      lastError = error;
      
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  
  console.warn('Quest generation failed after all retries');
  throw lastError || new Error('Failed to generate quests after all retries');
}

export function registerRoutes(app: Express) {
  // Auth routes
  app.post("/api/auth/login", passport.authenticate("local"), (req, res) => {
    console.log(`Login successful for user: ${(req.user as User).username}`);
    res.json(req.user);
  });

  app.get("/api/auth/me", ensureAuthenticated, (req, res) => {
    res.json(req.user);
  });

  app.post("/api/auth/logout", (req, res) => {
    const username = (req.user as User)?.username;
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ message: "Error logging out" });
      }
      console.log(`User logged out successfully: ${username}`);
      res.sendStatus(200);
    });
  });

  // Character routes
  app.put("/api/character", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as User).id;
    try {
      await db
        .update(users)
        .set({ character: req.body })
        .where(eq(users.id, userId));
      console.log(`Character updated for user: ${userId}`);
      res.sendStatus(200);
    } catch (error) {
      console.error('Character update error:', error);
      res.status(500).json({ message: "Error updating character" });
    }
  });

  // Enhanced journal routes with improved error handling and fallbacks
  app.post("/api/journals", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as User).id;
    const { content } = req.body;
    
    // Get a client from the pool for transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN'); // Start transaction
      
      let analysis = null;
      let aiError = null;
      
      // Try to analyze the entry using OpenAI with fallback values
      try {
        analysis = await analyzeEntry(content);
      } catch (error) {
        console.error('AI analysis failed:', error);
        aiError = error;
        // Provide fallback analysis
        analysis = {
          mood: "neutral",
          tags: [],
          growthAreas: [],
          statChanges: { wellness: 0, social: 0, growth: 0, achievement: 0 },
          characterProgression: {
            insights: [],
            skillsImproved: [],
            relationships: []
          }
        };
      }
      
      // Save the journal entry with analysis results
      const [newJournal] = await db.insert(journals).values({
        userId,
        content,
        mood: analysis.mood,
        tags: analysis.tags,
        analysis: analysis,
        characterProgression: analysis.characterProgression,
      }).returning();

      let updatedCharacter = null;
      let quests = [];
      
      // Try to update character progression and generate quests
      try {
        updatedCharacter = await updateCharacterProgress(userId, analysis, client);
        
        if (!aiError) { // Only try to generate quests if AI analysis succeeded
          quests = await generateQuestsWithRetry(analysis);
          if (quests && quests.length > 0) {
            await db.insert(quests).values(
              quests.map(quest => ({
                userId,
                ...quest,
                status: 'active'
              }))
            );
            console.log(`Generated ${quests.length} quests for user: ${userId}`);
          }
        }
      } catch (error) {
        console.error('Error in character progression or quest generation:', error);
        // Don't rethrow - we still want to save the journal entry
      }

      await client.query('COMMIT');

      const response: any = { journal: newJournal };
      if (updatedCharacter) response.character = updatedCharacter;
      if (quests.length > 0) response.quests = quests;
      if (aiError) response.warning = "AI analysis partially failed - some features may be limited";

      res.status(201).json(response);
    } catch (error) {
      await client.query('ROLLBACK');
      
      console.error('Error creating journal entry:', {
        error,
        userId,
        timestamp: new Date().toISOString()
      });
      
      res.status(500).json({ 
        message: "Error saving journal entry",
        code: error instanceof Error ? error.name : 'UNKNOWN_ERROR'
      });
    } finally {
      client.release();
    }
  });

  // Enhanced quest routes with improved error handling
  app.get("/api/quests", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as User).id;
    try {
      const userQuests = await db.query.quests.findMany({
        where: eq(quests.userId, userId),
        orderBy: [desc(quests.createdAt)],
      });
      res.json(userQuests);
    } catch (error) {
      console.error('Error fetching quests:', error);
      res.status(500).json({ message: "Error fetching quests" });
    }
  });

  // Enhanced quest completion with improved error handling
  app.post("/api/quests/:id/complete", ensureAuthenticated, async (req, res) => {
    const questId = parseInt(req.params.id);
    const userId = (req.user as User).id;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        throw new Error("User not found");
      }

      const character = user.character as any;
      
      // Calculate rewards using OpenAI with retry
      let rewards;
      try {
        rewards = await calculateQuestCompletion(questId, character.stats);
      } catch (error) {
        console.error('Error calculating rewards:', error);
        // Provide fallback rewards
        rewards = {
          xpGained: 50,
          statUpdates: {},
          achievements: []
        };
      }

      // Update quest status
      await db
        .update(quests)
        .set({ 
          status: "completed",
          completedAt: new Date()
        })
        .where(and(
          eq(quests.id, questId),
          eq(quests.userId, userId)
        ));

      // Update character with rewards
      const updatedCharacter = {
        ...character,
        xp: (character.xp || 0) + rewards.xpGained,
        level: Math.floor(((character.xp || 0) + rewards.xpGained) / 1000) + 1,
        stats: {
          ...character.stats,
          ...Object.fromEntries(
            Object.entries(rewards.statUpdates).map(([stat, change]) => [
              stat,
              Math.max(1, Math.min(10, (character.stats[stat] || 1) + change))
            ])
          )
        },
        achievements: [
          ...(character.achievements || []),
          ...rewards.achievements.map(achievement => ({
            title: achievement,
            timestamp: new Date().toISOString()
          }))
        ]
      };

      await db
        .update(users)
        .set({ character: updatedCharacter })
        .where(eq(users.id, userId));
      
      await client.query('COMMIT');

      res.json({ 
        message: "Quest completed successfully",
        rewards,
        character: updatedCharacter
      });
    } catch (error) {
      await client.query('ROLLBACK');
      
      console.error('Error completing quest:', {
        error,
        questId,
        userId,
        timestamp: new Date().toISOString()
      });
      
      res.status(500).json({ 
        message: "Error completing quest",
        code: error instanceof Error ? error.name : 'UNKNOWN_ERROR'
      });
    } finally {
      client.release();
    }
  });
}
