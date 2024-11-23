import { drizzle } from "drizzle-orm/neon-serverless";
import type { PoolClient } from "@neondatabase/serverless";
import { users, journals } from "../../db/schema.js";
import * as schema from "../../db/schema.js";
import { analyzeEntry } from "../openai.js";
import type { User } from "../../db/schema.js";
import type { Character } from "../types/character.js";
import type { Quest } from "../types/quest.js";
import type { JournalAnalysis } from "../openai.js";
import { updateCharacterProgress } from "./progression.js";
import { generateQuestsWithRetry } from "./quest.js";

export async function processJournalEntry(userId: number, content: string, client: PoolClient) {
  let analysis: JournalAnalysis;
  let aiError = null;
  const db = drizzle(client, { schema });
  
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
        relationships: [],
        achievements: [],
        questSuggestions: []
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
      await db.insert(schema.quests).values(
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
