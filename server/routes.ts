import type { Express } from "express";
import passport from "passport";
import { getDb, pool, getPoolStatus } from "../db/index.js";
import { users, journals, quests } from "../db/schema.js";
import { eq, desc, and, sql } from "drizzle-orm";
import { analyzeEntry, generateQuests, calculateQuestCompletion } from "./openai.js";
import { ensureAuthenticated } from "./auth.js";
import type { User, Journal } from "../db/schema.js";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { PoolClient } from "@neondatabase/serverless";

// Enhanced character progress update with validation and error handling
// Helper functions for advanced RPG progression

interface StatWeights {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  [key: string]: number; // Allow indexing with strings
}

// XP scaling configuration
const XP_CONFIG = {
  BASE_XP: 50,
  LEVEL_SCALING: 0.1, // 10% increase per level
  DIFFICULTY_SCALING: 0.2, // 20% increase per difficulty level
  STAT_BONUS_SCALING: 0.05, // 5% stat bonus per level
  MAX_STAT_VALUE: 20,
  MIN_STAT_VALUE: 1
};

// AI analysis categories to RPG stats mapping
const STAT_KEYWORDS = {
  strength: ['exercise', 'physical', 'strength', 'power', 'lifting', 'sports'],
  dexterity: ['agility', 'balance', 'coordination', 'reflex', 'speed', 'craft'],
  constitution: ['health', 'endurance', 'stamina', 'wellness', 'resilience'],
  intelligence: ['study', 'learn', 'research', 'analysis', 'problem-solving'],
  wisdom: ['reflection', 'meditation', 'insight', 'awareness', 'mindfulness'],
  charisma: ['social', 'leadership', 'communication', 'persuasion', 'empathy']
};

interface QuestRewards {
  xpGained: number;
  statUpdates: Record<string, number>;
  achievements: string[];
}

interface Analysis {
  mood?: string;
  tags?: string[];
  content?: string;
  growthAreas?: string[];
  characterProgression?: {
    insights?: string[];
    skillsImproved?: string[];
  };
  statChanges?: Record<string, number>;
}

interface Character {
  name: string;
  class: string;
  level: number;
  xp: number;
  stats: StatWeights;
  achievements: Array<{
    title: string;
    description?: string;
    timestamp: string;
  }>;
}

interface Quest {
  id: number;
  title: string;
  description: string;
  difficulty: number;
  category: string;
  status: 'active' | 'completed';
  userId: number;
  createdAt?: Date;
  completedAt?: Date | null;
}

// Already defined above, removing duplicate interface

function calculateStatWeights(analysis: Analysis, level: number): StatWeights {
  const baseWeights: StatWeights = {
    strength: 1,
    dexterity: 1,
    constitution: 1,
    intelligence: 1,
    wisdom: 1,
    charisma: 1
  };

  // Analyze content sentiment and context
  const sentiment = analysis.mood || 'neutral';
  const content = analysis.content?.toLowerCase() || '';
  const tags = analysis.tags || [];

  // Calculate stat weights based on content analysis
  Object.entries(STAT_KEYWORDS).forEach(([stat, keywords]) => {
    const statMatches = keywords.filter(keyword => 
      content.includes(keyword) || 
      tags.some(tag => tag.toLowerCase().includes(keyword))
    ).length;
    
    if (statMatches > 0) {
      baseWeights[stat as keyof StatWeights] *= (1 + (statMatches * 0.1));
    }
  });

  // Adjust weights based on sentiment and character progression
  if (sentiment === 'positive') {
    baseWeights.charisma *= 1.1;
    baseWeights.wisdom *= 1.1;
  } else if (sentiment === 'negative') {
    baseWeights.constitution *= 1.1;
    baseWeights.wisdom *= 1.05;
  }

  // AI-driven insight bonuses
  if (analysis.characterProgression?.insights?.length) {
    baseWeights.intelligence *= 1.1;
    baseWeights.wisdom *= 1.1;
  }

  // Scale weights with level for more significant growth at higher levels
  Object.keys(baseWeights).forEach(key => {
    baseWeights[key] *= (1 + (level * 0.02));
  });

  return baseWeights;
}

function calculateConsistencyBonus(character: Character): number {
  const now = new Date();
  const recentAchievements = (character.achievements || [])
    .filter(achievement => {
      const achievementDate = new Date(achievement.timestamp);
      const daysDiff = (now.getTime() - achievementDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= 7; // Consider achievements within the last week
    });

  // Bonus scales with number of recent achievements
  return recentAchievements.length * 5;
}

async function updateCharacterProgress(
  userId: number, 
  analysis: Analysis, 
  client?: PoolClient
): Promise<Character> {
  const db = client ? drizzle(client, { schema: { users, journals, quests } }) : await getDb();
  
  try {
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1).execute().then(rows => rows[0]);

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const character = user.character as any;
    const stats = character.stats || {
      strength: XP_CONFIG.MIN_STAT_VALUE,
      dexterity: XP_CONFIG.MIN_STAT_VALUE,
      constitution: XP_CONFIG.MIN_STAT_VALUE,
      intelligence: XP_CONFIG.MIN_STAT_VALUE,
      wisdom: XP_CONFIG.MIN_STAT_VALUE,
      charisma: XP_CONFIG.MIN_STAT_VALUE
    };

    // Dynamic XP scaling based on character level and progression
    const level = character.level || 1;
    const levelScaling = Math.pow(1 + XP_CONFIG.LEVEL_SCALING, level - 1); // Exponential scaling
    const baseXP = Math.round(XP_CONFIG.BASE_XP * levelScaling);

    // AI-driven stat growth with dynamic weights
    const statWeights = calculateStatWeights(analysis, level);
    Object.entries(analysis.statChanges || {}).forEach(([stat, change]) => {
      if (stats[stat] !== undefined) {
        const numericChange = Number(change);
        if (!isNaN(numericChange)) {
          // Apply weighted stat changes based on analysis and level
          const weightedChange = numericChange * statWeights[stat];
          // Bound the change between -1 and 1, scaled by level
          const boundedChange = Math.max(-1, Math.min(1, weightedChange)) * (1 + (level * 0.05));
          stats[stat] = Math.max(1, Math.min(10, stats[stat] + boundedChange));
        }
      }
    });

    // Enhanced XP calculation with dynamic bonuses
    const growthBonus = (analysis.growthAreas?.length || 0) * (10 * levelScaling);
    const insightBonus = (analysis.characterProgression?.insights?.length || 0) * (5 * levelScaling);
    const skillBonus = (analysis.characterProgression?.skillsImproved?.length || 0) * (8 * levelScaling);
    const consistencyBonus = calculateConsistencyBonus(character);
    
    const xpGain = Math.round(baseXP + growthBonus + insightBonus + skillBonus + consistencyBonus);
    const newXp = (character.xp || 0) + xpGain;
    // Dynamic level scaling: requires more XP per level as you progress
    const newLevel = Math.floor(Math.pow(newXp / 1000, 0.8)) + 1;

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

    await db.update(users)
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
  // Add connection status endpoint at the top
  app.get("/api/db/status", async (req, res) => {
    try {
      const poolStats = await getPoolStatus();
      const db = await getDb(); // This will trigger lazy loading
      await db.select({ value: sql`1` }).then(result => result[0]); // Verify connection
      
      res.json({
        status: 'connected',
        poolStats,
        message: 'Database connection verified'
      });
    } catch (error) {
      console.error('Database status check failed:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        poolStats: await getPoolStatus()
      });
    }
  });

  // Auth routes
  app.post("/api/auth/login", passport.authenticate("local"), (req, res) => {
    console.log(`Login successful for user: ${(req.user as User).username}`);
    res.json(req.user);
  });

  app.get("/api/auth/me", ensureAuthenticated, async (req, res) => {
    const db = await getDb();
    const user = await db.query.users.findFirst({
      where: eq(users.id, (req.user as User).id),
    });
    res.json(user);
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
      const db = await getDb();
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
    const db = drizzle(client, { schema: { users, journals, quests } });
    
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
      let quests: Quest[] = [];
      
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
      const db = await getDb();
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
    const db = drizzle(client, { schema: { users, journals, quests } });
    
    try {
      await client.query('BEGIN');

      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        throw new Error("User not found");
      }

      const character = user.character as any;
      
      // Calculate rewards using OpenAI with retry and dynamic scaling
      let rewards;
      try {
        // Fetch quest details first
        const quest = await db.query.quests.findFirst({
          where: and(
            eq(quests.id, questId),
            eq(quests.userId, userId)
          ),
        });

        if (!quest) {
          throw new Error("Quest not found");
        }

        const questDifficulty = quest.difficulty || 1;
        const levelScaling = 1 + (character.level * XP_CONFIG.LEVEL_SCALING);
        rewards = await calculateQuestCompletion(questId, character.stats);
        
        // Apply dynamic scaling to rewards with bounded multipliers
        const difficultyMultiplier = Math.max(1, Math.min(3, questDifficulty * XP_CONFIG.DIFFICULTY_SCALING));
        rewards.xpGained = Math.round(rewards.xpGained * levelScaling * difficultyMultiplier);
        
        // Scale stat updates based on character level and quest difficulty with caps
        Object.entries(rewards.statUpdates).forEach(([stat, value]) => {
          const statBonus = value * (1 + (character.level * XP_CONFIG.STAT_BONUS_SCALING));
          const boundedValue = Math.max(-1, Math.min(1, statBonus * difficultyMultiplier));
          rewards.statUpdates[stat] = boundedValue;
        });
        
      } catch (error) {
        console.error('Error calculating rewards:', error);
        // Provide scaled fallback rewards
        const baseXP = 50 * (1 + (character.level * 0.1));
        rewards = {
          xpGained: Math.round(baseXP),
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