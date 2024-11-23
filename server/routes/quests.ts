import type { Express } from "express";
import { ensureAuthenticated } from "../auth.js";
import { getDb, pool } from "../../db/index.js";
import { quests } from "../../db/schema.js";
import { eq, desc, and, gt, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { generateQuests, calculateQuestCompletion } from "../openai.js";
import type { User, Quest } from "../../db/schema.js";

// Quest chain types for storyline progression
interface QuestChain {
  id: string;
  title: string;
  description: string;
  quests: Quest[];
  requirements: {
    previousQuests?: number[];
interface QuestChain {
  id: string;
  title: string;
  description: string;
  quests: Quest[];
  requirements: {
    minLevel: number;
    stats: Record<string, number>;
  };
}

// Update character progress after completing a quest
async function updateCharacterProgress(
  userId: number,
  progress: {
    xpGained: number;
    statUpdates: Record<string, number>;
    achievements: string[];
  }
): Promise<Character> {
  const db = await getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  if (!user) throw new Error('User not found');

  const character = user.character as Character;
  
  // Update stats
  Object.entries(progress.statUpdates).forEach(([stat, value]) => {
    if (stat in character.stats) {
      character.stats[stat as keyof typeof character.stats] += value;
    }
  });

  // Add XP and calculate new level
  character.xp += progress.xpGained;
  character.level = Math.floor(Math.pow(character.xp / 1000, 0.8)) + 1;

  // Add achievements
  character.achievements.push(
    ...progress.achievements.map(achievement => ({
      title: achievement,
      timestamp: new Date().toISOString()
    }))
  );

  // Update character in database
  await db.update(users)
    .set({ character })
    .where(eq(users.id, userId));

  return character;
}
    minLevel?: number;
    stats?: Record<string, number>;
  };
}

// Calculate storyline progress for a completed quest
async function calculateStorylineProgress(quest: Quest): Promise<number> {
  if (!quest.storylineId) return 0;
  
  const db = await getDb();
  const storylineQuests = await db
    .select()
    .from(quests)
    .where(eq(quests.storylineId, quest.storylineId))
    .execute();
    
  const totalQuests = storylineQuests.length;
  if (totalQuests === 0) return 0;
  
  const completedQuests = storylineQuests.filter(q => q.status === 'completed').length;
  return (completedQuests / totalQuests) * 100;
}
interface QuestProgress {
  questId: string;
  status: 'active' | 'completed';
  completedAt?: Date;
  metrics?: {
    timeSpent?: number;
    attempts?: number;
    difficultyRating?: number;
  };
}

export function registerQuestRoutes(app: Express) {
  // Get available quests for user with storyline progression
  app.get("/api/quests", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as { id: number })?.id;
    
    try {
      const db = await getDb();
      const userQuests = await db
        .select({
          id: quests.id,
          userId: quests.userId,
          title: quests.title,
          description: quests.description,
          category: quests.category,
          difficulty: quests.difficulty,
          status: quests.status,
          createdAt: quests.createdAt,
          completedAt: quests.completedAt,
          statRequirements: quests.statRequirements,
          statRewards: quests.statRewards
        })
        .from(quests)
        .where(eq(quests.userId, userId))
        .orderBy(desc(quests.createdAt));

      // Organize quests into storylines/chains
      const questChains = organizeQuestChains(userQuests);
      
      res.json({
        quests: userQuests,
        questChains
      });
    } catch (error) {
      console.error("Error fetching quests:", error);
      res.status(500).json({ error: "Failed to fetch quests" });
    }
  });

  // Complete a quest and progress storyline
  app.post("/api/quests/:questId/complete", ensureAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.id;
    const questId = parseInt(req.params.questId);
    let client;

    try {
      client = await pool.connect();
      const db = drizzle(client);
      
      // Update quest status
      const [updatedQuest] = await db.update(quests)
        .set({ 
          status: 'completed',
          completedAt: new Date()
        })
        .where(and(
          eq(quests.id, questId),
          eq(quests.userId, userId)
        ))
        .returning();

      if (!updatedQuest) {
        return res.status(404).json({ error: "Quest not found" });
      }

      // Calculate rewards and progress
      const progress = await calculateQuestCompletion(questId, updatedQuest.statRequirements || {});

      // Get storyline progress
      const storylineProgress = await calculateStorylineProgress(updatedQuest);

      // Update character progress with quest completion
      const updatedCharacter = await updateCharacterProgress(userId, progress);

      res.json({
        quest: updatedQuest,
        progress,
        character: updatedCharacter,
        storylineProgress,
        nextQuests: await getNextQuestsInChain(questId, userId)
      });
    } catch (error) {
      console.error("Error completing quest:", error);
      res.status(500).json({ error: "Failed to complete quest" });
    } finally {
      if (client) client.release();
    }
  });
}

// Helper function to organize quests into storyline chains
function organizeQuestChains(quests: Quest[]): QuestChain[] {
  const chains: QuestChain[] = [];
  const questsByCategory = groupBy(quests, 'category');

  Object.entries(questsByCategory).forEach(([category, categoryQuests]) => {
    // Sort by difficulty and requirements to create natural progression
    const sortedQuests = categoryQuests.sort((a, b) => {
      const diffA = a.difficulty || 0;
      const diffB = b.difficulty || 0;
      return diffA - diffB;
    });

    // Create chain with progressive requirements
    const chain: QuestChain = {
      id: `chain-${category.toLowerCase()}`,
      title: `${category} Journey`,
      description: `Progress through ${category} related challenges`,
      quests: sortedQuests,
      requirements: {
        minLevel: Math.max(...sortedQuests.map(q => q.difficulty || 0)) - 2,
        stats: calculateChainStatRequirements(sortedQuests)
      }
    };

    chains.push(chain);
  });

  return chains;
}

// Helper function for grouping quests
function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((result, item) => {
    const group = String(item[key]);
    result[group] = result[group] || [];
    result[group].push(item);
    return result;
  }, {} as Record<string, T[]>);
}

// Calculate aggregate stat requirements for a quest chain
function calculateChainStatRequirements(quests: Quest[]): Record<string, number> {
  const requirements: Record<string, number> = {};
  
  quests.forEach(quest => {
    if (quest.statRequirements) {
      Object.entries(quest.statRequirements).forEach(([stat, value]) => {
        requirements[stat] = Math.max(requirements[stat] || 0, value || 0);
      });
    }
  });

  return requirements;
}

// Get next available quests in storyline
async function getNextQuestsInChain(completedQuestId: number, userId: number): Promise<Quest[]> {
  const db = await getDb();
  const [completedQuest] = await db
    .select()
    .from(quests)
    .where(eq(quests.id, completedQuestId))
    .limit(1)
    .execute();

  if (!completedQuest) return [];

  // Find quests in same category with higher difficulty
  return db
    .select()
    .from(quests)
    .where(and(
      eq(quests.userId, userId),
      eq(quests.category, completedQuest.category),
      eq(quests.status, 'active'),
      gt(quests.difficulty, completedQuest.difficulty || 0)
    ))
    .orderBy(asc(quests.difficulty))
    .limit(3)
    .execute();
}
