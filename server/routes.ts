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
  statRequirements?: {
    strength?: number;
    dexterity?: number;
    constitution?: number;
    intelligence?: number;
    wisdom?: number;
    charisma?: number;
  };
  statRewards?: {
    strength?: number;
    dexterity?: number;
    constitution?: number;
    intelligence?: number;
    wisdom?: number;
    charisma?: number;
  };
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

  // Enhanced content analysis with context awareness
  const sentiment = analysis.mood || 'neutral';
  const content = analysis.content?.toLowerCase() || '';
  const tags = analysis.tags || [];
  const insights = analysis.characterProgression?.insights || [];
  const skillsImproved = analysis.characterProgression?.skillsImproved || [];

  // Advanced keyword matching with contextual relevance
  Object.entries(STAT_KEYWORDS).forEach(([stat, keywords]) => {
    // Count direct keyword matches
    const directMatches = keywords.filter(keyword => 
      content.includes(keyword)
    ).length;
    
    // Count tag-based matches with higher weight
    const tagMatches = keywords.filter(keyword =>
      tags.some(tag => tag.toLowerCase().includes(keyword))
    ).length * 1.5;
    
    // Calculate contextual relevance score
    const contextScore = (directMatches + tagMatches) / keywords.length;
    
    if (contextScore > 0) {
      // Apply progressive scaling based on match quality
      baseWeights[stat as keyof StatWeights] *= (1 + (contextScore * 0.15));
    }
  });

  // Enhanced emotional intelligence system
  const emotionalImpact = {
    'very positive': { charisma: 0.15, wisdom: 0.12, constitution: 0.08 },
    'positive': { charisma: 0.1, wisdom: 0.08, constitution: 0.05 },
    'neutral': { wisdom: 0.05, intelligence: 0.05 },
    'negative': { constitution: 0.12, wisdom: 0.1, strength: 0.08 },
    'very negative': { constitution: 0.15, wisdom: 0.12, strength: 0.1 }
  };

  // Apply emotional impacts with more granular control
  const moodEffects = emotionalImpact[sentiment as keyof typeof emotionalImpact] || emotionalImpact.neutral;
  Object.entries(moodEffects).forEach(([stat, bonus]) => {
    baseWeights[stat as keyof StatWeights] *= (1 + bonus);
  });

  // Enhanced progression system based on character insights
  insights.forEach(insight => {
    // Increase intelligence and wisdom based on meaningful insights
    baseWeights.intelligence *= 1.08;
    baseWeights.wisdom *= 1.06;
  });

  // Skill improvement tracking
  skillsImproved.forEach(skill => {
    // Reward consistent skill development
    const relatedStats = Object.entries(STAT_KEYWORDS)
      .filter(([_, keywords]) => keywords.some(k => skill.toLowerCase().includes(k)))
      .map(([stat]) => stat);
    
    relatedStats.forEach(stat => {
      baseWeights[stat as keyof StatWeights] *= 1.05;
    });
  });

  // Progressive level scaling with diminishing returns
  const levelScaling = 1 + (Math.log(level + 1) * 0.05);
  Object.keys(baseWeights).forEach(key => {
    baseWeights[key] *= levelScaling;
  });

  // Normalize weights to prevent extreme values
  const maxWeight = Math.max(...Object.values(baseWeights));
  if (maxWeight > 2) {
    Object.keys(baseWeights).forEach(key => {
      baseWeights[key] = baseWeights[key] / maxWeight * 2;
    });
  }

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

function filterQuestsByStats(quests: Quest[], characterStats: StatWeights): Quest[] {
  const GROWTH_THRESHOLD = 5; // Threshold for considering a stat as needing growth
  const CHALLENGE_THRESHOLD = 2; // Max stat difference for reasonable challenge
  
  return quests
    .map(quest => {
      let suitabilityScore = 1;
      let growthScore = 0;
      let achievabilityScore = 1;
      let balanceScore = 1;
      
      if (quest.statRequirements) {
        const statDifferences: Record<string, number> = {};
        let totalRequirements = 0;
        let meetableRequirements = 0;
        
        // Calculate stat differences and initial scores
        Object.entries(quest.statRequirements).forEach(([stat, requirement]) => {
          const characterStat = characterStats[stat as keyof StatWeights] || 0;
          const statDifference = characterStat - (requirement || 0);
          statDifferences[stat] = statDifference;
          totalRequirements++;
          
          // Achievability scoring
          if (statDifference >= 0) {
            meetableRequirements++;
            achievabilityScore *= 1.2; // Bonus for meeting requirements
          } else if (statDifference >= -CHALLENGE_THRESHOLD) {
            meetableRequirements += 0.5;
            achievabilityScore *= 0.8; // Challenging but doable
          } else {
            achievabilityScore *= 0.4; // Very challenging
          }
          
          // Growth opportunity scoring
          if (characterStat < GROWTH_THRESHOLD) {
            const growthPotential = Math.min(CHALLENGE_THRESHOLD, Math.abs(statDifference));
            growthScore += (growthPotential / CHALLENGE_THRESHOLD) * 0.3;
          }
        });
        
        // Calculate balance score based on requirement distribution
        if (totalRequirements > 0) {
          balanceScore = meetableRequirements / totalRequirements;
        }
        
        // Analyze stat rewards for additional growth scoring
        if (quest.statRewards) {
          Object.entries(quest.statRewards).forEach(([stat, reward]) => {
            const characterStat = characterStats[stat as keyof StatWeights] || 0;
            if (characterStat < GROWTH_THRESHOLD) {
              // Higher reward for stats that need improvement
              growthScore += ((GROWTH_THRESHOLD - characterStat) / GROWTH_THRESHOLD) * 0.2;
            }
          });
        }
      }
      
      // Calculate final score with weighted components
      const finalScore = (
        (suitabilityScore * 0.3) + 
        (growthScore * 0.3) + 
        (achievabilityScore * 0.2) +
        (balanceScore * 0.2)
      );
      
      // Enhanced metadata for better quest presentation
      return { 
        quest, 
        score: finalScore,
        metadata: {
          achievability: achievabilityScore,
          growthPotential: growthScore,
          balance: balanceScore,
          recommended: finalScore > 0.6
        }
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ quest, metadata }) => ({
      ...quest,
      metadata // Include metadata in the returned quest object
    }));
}
    // Enhanced quest generation with retry logic and stat-based filtering
async function generateQuestsWithRetry(analysis: Analysis, characterStats: StatWeights, maxRetries = 3): Promise<Quest[]> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Generate quests using OpenAI
      const generatedQuests = await generateQuests(analysis);
      
      // Apply stat-based filtering and scoring
      const filteredQuests = filterQuestsByStats(generatedQuests, characterStats);
      
      // Take top 3-5 most suitable quests
      return filteredQuests.slice(0, Math.min(5, filteredQuests.length));
    } catch (error) {
      console.error(`Quest generation attempt ${attempt + 1} failed:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries - 1) {
        // Exponential backoff for retries
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
  // Character update endpoint with enhanced stat progression
  app.put("/api/journal", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as User).id;
    let client;

    try {
      client = await pool.connect();
      const result = await processJournalEntry(userId, req.body.content, client);
      res.json(result);
    } catch (error) {
      console.error('Error processing journal entry:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  });

  // Enhanced journal entry processing with proper date handling
  async function processJournalEntry(userId: number, content: string, client: PoolClient): Promise<{
    journal: any;
    character: Character;
    quests: Quest[];
  }> {
    try {
      const db = drizzle(client, { schema: { users, journals, quests } });
      
      // Get user data first to ensure it exists
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId)
      });

      if (!user) {
        throw new Error('User not found');
      }

      let analysis = null;
      let aiError = null;
      
      try {
        analysis = await analyzeEntry(content);
      } catch (error) {
        console.error('AI analysis failed:', error);
        aiError = error;
        analysis = {
          mood: "neutral",
          tags: [],
          growthAreas: [],
          statChanges: {
            wellness: 0,
            social: 0,
            growth: 0,
            achievement: 0
          },
          characterProgression: {
            insights: [],
            skillsImproved: [],
            relationships: []
          }
        };
      }

      // Save the journal entry
      const [newJournal] = await db.insert(journals).values({
        userId,
        content,
        createdAt: new Date(),
        mood: analysis.mood || 'neutral',
        tags: Array.isArray(analysis.tags) ? analysis.tags : [],
        analysis,
        characterProgression: analysis.characterProgression || {}
      }).returning();

      // Update character progress with enhanced content-based progression
      const character = await updateCharacterProgress(userId, analysis, client);
      
      // Generate quests with improved stat-based filtering
      const quests = await generateQuestsWithRetry(analysis, character.stats);
      
      // Save generated quests with enhanced metadata
      if (quests.length > 0) {
        await db.insert(quests).values(
          quests.map(quest => ({
            userId,
            ...quest,
            status: 'active',
            createdAt: new Date(),
            metadata: {
              ...quest.metadata,
              contentAnalysis: {
                matchedTags: analysis.tags || [],
                growthAreas: analysis.growthAreas || [],
                sentimentImpact: analysis.mood || 'neutral'
              }
            }
          }))
        ).execute();
      }

      return {
        journal: newJournal,
        character,
        quests
      };
      
      // Generate quests with improved stat-based filtering
      let quests: Quest[] = [];
      try {
        quests = await generateQuestsWithRetry(analysis, character.stats);
        
        // Save generated quests
        if (quests.length > 0) {
          await db.insert(quests).values(
            quests.map(quest => ({
              userId,
              ...quest,
              status: 'active',
              createdAt: new Date()
            }))
          ).execute();
        }
      } catch (questError) {
        console.error('Error generating quests:', questError);
        // Continue with empty quests array if quest generation fails
      }

      return {
        journal: newJournal,
        character,
        quests
      };
    } catch (error) {
      console.error('Error processing journal entry:', error);
      throw error;
    }
  }
    }

    let analysis = null;
    let aiError = null;
    
    try {
      analysis = await analyzeEntry(content);
    } catch (error) {
      console.error('AI analysis failed:', error);
      aiError = error;
      analysis = {
        mood: "neutral",
        tags: [],
        growthAreas: [],
        statChanges: {
          strength: 0,
          dexterity: 0,
          constitution: 0,
          intelligence: 0,
          wisdom: 0,
          charisma: 0
        },
        characterProgression: {
          insights: [],
          skillsImproved: [],
          relationships: []
        }
      };
    }

    // Save the journal entry
    const [newJournal] = await db.insert(journals).values({
      userId,
      content,
      createdAt: new Date(),
      mood: analysis.mood || 'neutral',
      tags: Array.isArray(analysis.tags) ? analysis.tags : [],
      analysis,
      characterProgression: analysis.characterProgression || {}
    }).returning();

    // Update character progress
    const character = await updateCharacterProgress(userId, analysis, client);
    
    // Generate quests
    let quests: Quest[] = [];
    try {
      quests = await generateQuestsWithRetry(analysis, character.stats);
      
      // Insert new quests
      if (quests.length > 0) {
        await db.insert(quests).values(
          quests.map(quest => ({
            userId,
            title: quest.title,
            description: quest.description,
            category: quest.category,
            difficulty: quest.difficulty,
            xpReward: quest.xpReward || 50,
            statRewards: quest.statRewards || {},
            timeframe: quest.timeframe,
            status: 'active',
            createdAt: new Date()
          }))
        );
      }
    } catch (error) {
      console.error('Quest generation failed:', error);
    }

    return {
      journal: newJournal,
      character,
      quests,
      aiError
    };
  }

  // Quest completion endpoint with enhanced stat updates
  app.post("/api/quest/:questId/complete", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as User).id;
    const questId = parseInt(req.params.questId);
    let client;

    try {
      client = await pool.connect();
      const db = drizzle(client, { schema: { users, journals, quests } });
      
      // Get user's current stats
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId)
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Calculate completion rewards based on current stats
      const rewards = await calculateQuestCompletion(questId, user.character.stats);

      // Update character stats and XP
      const character = user.character as Character;
      character.xp += rewards.xpGained;

      // Apply stat updates with progressive scaling
      Object.entries(rewards.statUpdates).forEach(([stat, change]) => {
        if (stat in character.stats) {
          const currentValue = character.stats[stat as keyof StatWeights];
          const scaledChange = change * (1 + Math.log(character.level) * 0.1);
          character.stats[stat as keyof StatWeights] = Math.min(
            XP_CONFIG.MAX_STAT_VALUE,
            currentValue + scaledChange
          );
        }
      });

      // Add achievements
      character.achievements.push(
        ...rewards.achievements.map(achievement => ({
          title: achievement,
          timestamp: new Date().toISOString()
        }))
      );

      // Update character in database
      await db.update(users)
        .set({ character })
        .where(eq(users.id, userId))
        .execute();

      // Mark quest as completed
      await db.update(quests)
        .set({ 
          status: 'completed',
          completedAt: new Date()
        })
        .where(eq(quests.id, questId))
        .execute();

      res.json({
        rewards,
        character
      });
    } catch (error) {
      console.error('Error completing quest:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  });

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
    let client;

    try {
      client = await pool.connect();
      const result = await processJournalEntry(userId, req.body.content, client);
      
      const emotionalIntensity = getEmotionalIntensity(result.journal.mood || 'neutral');
      result.character.stats = Object.fromEntries(
        Object.entries(result.character.stats).map(([stat, value]) => [
          stat,
          Math.min(XP_CONFIG.MAX_STAT_VALUE, 
            value + (result.character.statChanges?.[stat] || 0) * emotionalIntensity
          )
        ])
      );
      
      res.json(result);
    } catch (error) {
      console.error('Error processing character update:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  });
      const result = await processJournalEntry(userId, req.body.content, client);
      res.json(result);
    } catch (error) {
      console.error('Error processing character update:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  });
      }
      console.error('Error updating character:', error);
      res.status(500).json({ 
        message: 'Failed to update character',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  });

  // Journal routes with proper date handling
  app.post("/api/journals", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as User).id;
    const { content } = req.body;
    
    if (!content?.trim()) {
      return res.status(400).json({ message: "Content is required" });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      
      const result = await processJournalEntry(userId, content, client);
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }
      console.error('Error processing journal entry:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to process journal entry',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  });

  // Quest routes
  app.post("/api/quests/:questId/complete", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as User).id;
    const questId = parseInt(req.params.questId);
    
    if (isNaN(questId)) {
      return res.status(400).json({ message: "Invalid quest ID" });
    }
    
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      
      const db = drizzle(client, { schema: { users, quests } });
      
      // Get the quest and verify ownership
      const quest = await db.query.quests.findFirst({
        where: and(
          eq(quests.id, questId),
          eq(quests.userId, userId)
        )
      });
      
      if (!quest) {
        return res.status(404).json({ message: "Quest not found" });
      }
      
      if (quest.status === 'completed') {
        return res.status(400).json({ message: "Quest already completed" });
      }
      
      // Get current character stats
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId)
      });
      
      if (!user?.character?.stats) {
        return res.status(400).json({ message: "Character stats not found" });
      }
      
      // Calculate rewards
      const rewards = await calculateQuestCompletion(questId, user.character.stats);
      
      // Apply level scaling and difficulty multipliers
      const levelScaling = Math.pow(1 + XP_CONFIG.LEVEL_SCALING, user.character.level - 1);
      const difficultyMultiplier = 1 + ((quest.difficulty || 1) - 1) * XP_CONFIG.DIFFICULTY_SCALING;
      
      // Scale XP reward
      rewards.xpGained = Math.round(rewards.xpGained * levelScaling * difficultyMultiplier);
      
      // Scale stat updates based on character level and quest difficulty with caps
      Object.entries(rewards.statUpdates).forEach(([stat, value]) => {
        const statBonus = value * (1 + (user.character.level * XP_CONFIG.STAT_BONUS_SCALING));
        const boundedValue = Math.max(-1, Math.min(1, statBonus * difficultyMultiplier));
        (rewards.statUpdates as Record<string, number>)[stat] = boundedValue;
      });
      
      // Update quest status and character
      await db.update(quests)
        .set({
          status: 'completed',
          completedAt: new Date()
        })
        .where(eq(quests.id, questId));
      
      const character = user.character;
      character.xp += rewards.xpGained;
      character.level = Math.floor(character.xp / 1000) + 1;
      
      // Apply stat updates
      Object.entries(rewards.statUpdates).forEach(([stat, value]) => {
        if (character.stats[stat] !== undefined) {
          character.stats[stat] = Math.max(
            XP_CONFIG.MIN_STAT_VALUE,
            Math.min(XP_CONFIG.MAX_STAT_VALUE, character.stats[stat] + value)
          );
        }
      });
      
      // Add achievements
      if (rewards.achievements?.length) {
        character.achievements = [
          ...(character.achievements || []),
          ...rewards.achievements.map(achievement => ({
            title: achievement,
            timestamp: new Date().toISOString()
          }))
        ];
      }
      
      await db.update(users)
        .set({ character })
        .where(eq(users.id, userId));
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        rewards,
        character
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }
      console.error('Error completing quest:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to complete quest',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  });
}
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      
      const db = drizzle(client, { schema: { users } });
      const [updatedUser] = await db.update(users)
        .set({ character: req.body })
        .where(eq(users.id, userId))
        .returning();
      
      await client.query('COMMIT');
      res.json(updatedUser);
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
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid journal content' 
      });
    }

    // Get a client from the pool for transaction
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN'); // Start transaction
      
      const result = await processJournalEntry(userId, content, client);
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        ...result
      });
      
      // Get user data first to ensure it exists
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId)
      });

      if (!user) {
        throw new Error('User not found');
      }

      let analysis = null;
      let aiError = null;
      
      // Try to analyze the entry using OpenAI with fallback values
      try {
        analysis = await analyzeEntry(content);
      } catch (error) {
        console.error('AI analysis failed:', error);
        aiError = error;
        // Provide fallback analysis with proper stat structure
        analysis = {
          mood: "neutral",
          tags: [],
          growthAreas: [],
          statChanges: {
            strength: 0,
            dexterity: 0,
            constitution: 0,
            intelligence: 0,
            wisdom: 0,
            charisma: 0
          },
          characterProgression: {
            insights: [],
            skillsImproved: [],
            relationships: []
          }
        };
      }

      const currentDate = new Date().toISOString();
      
      // Save the journal entry with analysis results and proper date handling
      const [newJournal] = await db.insert(journals).values({
        userId,
        content,
        createdAt: new Date(),
        mood: analysis.mood || 'neutral',
        tags: Array.isArray(analysis.tags) ? analysis.tags : [],
        analysis: analysis,
        characterProgression: analysis.characterProgression || {}
      }).returning();
      
      // Update character progress within the same transaction
      const updatedCharacter = await updateCharacterProgress(userId, analysis, client);
      
      // Generate quests based on the analysis and character stats
      let generatedQuests: Quest[] = [];
      try {
        generatedQuests = await generateQuestsWithRetry(analysis, updatedCharacter.stats);
        
        // Insert new quests
        await db.insert(quests).values(
          generatedQuests.map(quest => ({
            userId,
            title: quest.title,
            description: quest.description,
            category: quest.category,
            difficulty: quest.difficulty,
            xpReward: quest.xpReward || 50,
            statRewards: quest.statRewards || {},
            timeframe: quest.timeframe,
            status: 'active',
            createdAt: new Date()
          }))
        );
      } catch (error) {
        console.error('Quest generation failed:', error);
        // Continue without quests if generation fails
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        journal: newJournal,
        character: updatedCharacter,
        quests: generatedQuests,
        aiError: aiError ? aiError.message : null
      });
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }
      console.error('Error processing journal entry:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to process journal entry',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
      
      // Save the journal entry with analysis results
      const [newJournal] = await db.insert(journals).values({
        userId,
        content,
        createdAt: new Date(),
        mood: analysis.mood || 'neutral',
        tags: Array.isArray(analysis.tags) ? analysis.tags : [],
        analysis: analysis,
        characterProgression: analysis.characterProgression || {}
      }).returning();

      // Update character progress within the same transaction
      const character = await updateCharacterProgress(userId, analysis, client);
      
      // Generate quests based on the analysis and character stats
      let quests: Quest[] = [];
      try {
        quests = await generateQuestsWithRetry(analysis, character.stats);
        
        // Insert new quests
        await db.insert(quests).values(
          quests.map(quest => ({
            userId,
            title: quest.title,
            description: quest.description,
            category: quest.category,
            difficulty: quest.difficulty,
            xpReward: quest.xpReward || 50,
            statRewards: quest.statRewards || {},
            timeframe: quest.timeframe,
            status: 'active',
            createdAt: new Date()
          }))
        );
      } catch (error) {
        console.error('Quest generation failed:', error);
        // Continue without quests if generation fails
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        journal: newJournal,
        character: character,
        quests: quests,
        aiError: aiError ? aiError.message : null
      });
        characterProgression: analysis.characterProgression || {}
      }).returning();
      
      // Update character progress within the same transaction
      const updatedCharacter = await updateCharacterProgress(userId, analysis, client);
      
      // Generate quests based on the analysis and character stats
      let generatedQuests: Quest[] = [];
      try {
        generatedQuests = await generateQuestsWithRetry(analysis, updatedCharacter.stats);
        if (generatedQuests.length > 0) {
          await db.insert(quests).values(
            generatedQuests.map(quest => ({
              ...quest,
              userId,
              createdAt: currentDate,
              status: 'active'
            }))
          );
        }
      } catch (error) {
        console.error('Quest generation failed:', error);
        // Continue without quests if generation fails
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        journal: newJournal,
        character: updatedCharacter,
        quests: generatedQuests,
        aiError: aiError ? String(aiError) : null
      });
        mood: analysis.mood || 'neutral',
        tags: Array.isArray(analysis.tags) ? analysis.tags : [],
        analysis: analysis,
        characterProgression: analysis.characterProgression || {}
      }).returning();
      
      // Update character progress within the same transaction
      const updatedCharacter = await updateCharacterProgress(userId, analysis, client);
      
      // Generate quests based on the analysis and character stats
      let generatedQuests: Quest[] = [];
      try {
        generatedQuests = await generateQuestsWithRetry(analysis, updatedCharacter.stats);
        if (generatedQuests.length > 0) {
          await db.insert(quests).values(
            generatedQuests.map(quest => ({
              ...quest,
              userId,
              createdAt: currentDate,
              status: 'active'
            }))
          );
        }
      } catch (error) {
        console.error('Quest generation failed:', error);
        // Continue without quests if generation fails
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        journal: newJournal,
        character: updatedCharacter,
        quests: generatedQuests,
        aiError: aiError ? String(aiError) : null
      });
        mood: analysis.mood || 'neutral',
        tags: Array.isArray(analysis.tags) ? analysis.tags : [],
        analysis: analysis,
        characterProgression: analysis.characterProgression || {}
      }).returning();

      let updatedCharacter = null;
      let quests: Quest[] = [];

      // Try to update character progression and generate quests
      try {
        // Update character progression
        updatedCharacter = await updateCharacterProgress(userId, analysis, client);
        
        if (!aiError && updatedCharacter) {
          // Generate quests based on updated character stats
          quests = await generateQuestsWithRetry(analysis, updatedCharacter.stats);
          
          if (quests && quests.length > 0) {
            // Format quests with proper dates and metadata
            const questsToInsert = quests.map(quest => ({
              userId,
              title: quest.title,
              description: quest.description,
              category: quest.category,
              difficulty: quest.difficulty || 1,
              xpReward: quest.xpReward || 50,
              statRewards: quest.statRewards || {},
              status: 'active' as const,
              createdAt: currentDate,
              completedAt: null
            }));

            // Insert quests with proper error handling
            await db.insert(quests).values(questsToInsert).execute();
            console.log(`Generated ${quests.length} quests for user: ${userId}`);
          }
        }

        // Commit transaction
        await client.query('COMMIT');

        // Return success response with all updated data
        res.json({
          success: true,
          journal: newJournal,
          character: updatedCharacter,
          quests: quests
        });

      } catch (error) {
        // Rollback transaction on error
        await client.query('ROLLBACK');
        console.error('Error in character progression or quest generation:', error);
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Failed to process journal entry'
        });
      } finally {
        // Release the client back to the pool
        client.release();
      }
        tags: Array.isArray(analysis.tags) ? analysis.tags : [],
        analysis: analysis,
        characterProgression: analysis.characterProgression || {},
      }).returning();

      let updatedCharacter = null;
      let quests: Quest[] = [];
      
      // Try to update character progression and generate quests
      try {
        updatedCharacter = await updateCharacterProgress(userId, analysis, client);
        
        if (!aiError && updatedCharacter) {
          // Only generate quests if we have valid character stats
          quests = await generateQuestsWithRetry(analysis, updatedCharacter.stats);
          
          if (quests && quests.length > 0) {
            // Format quests with proper dates and metadata
            const questsToInsert = quests.map(quest => ({
              userId,
              title: quest.title,
              description: quest.description,
              category: quest.category,
              difficulty: quest.difficulty || 1,
              xpReward: quest.xpReward || 50,
              statRewards: quest.statRewards || {},
              status: 'active',
              createdAt: currentDate,
              completedAt: null
            }));

            // Insert quests with proper error handling
            await db.insert(quests).values(questsToInsert).execute();
          }
        }
          if (quests && quests.length > 0) {
            // Prepare quests with proper metadata and dates
            const questsToInsert = quests.map(quest => ({
              ...quest,
              userId,
              createdAt: new Date().toISOString(),
              completedAt: null,
              status: 'active'
            }));
            
            await db.insert(quests).values(questsToInsert).execute();
            console.log(`Generated ${quests.length} quests for user: ${userId}`);
          }
          
          // Commit transaction
          await client.query('COMMIT');
          
          return res.status(200).json({
            journal: newJournal,
            character: updatedCharacter,
            quests: quests
          });
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
        const statUpdates = rewards.statUpdates as Record<string, number>;
        Object.entries(statUpdates).forEach(([stat, value]) => {
          const statBonus = value * (1 + (character.level * XP_CONFIG.STAT_BONUS_SCALING));
          const boundedValue = Math.max(-1, Math.min(1, statBonus * difficultyMultiplier));
          statUpdates[stat] = boundedValue;
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
          eq(users.id, userId)
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