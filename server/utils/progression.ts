import type { StatWeights, Character, CharacterProgression } from '../types/character';
import type { JournalAnalysis as Analysis } from "../openai.js";
import { users, journals } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { PoolClient } from "@neondatabase/serverless";
import { getDb } from "../db/index.js";

// XP scaling configuration
export const XP_CONFIG = {
  BASE_XP: 50,
  LEVEL_SCALING: 0.1,
  DIFFICULTY_SCALING: 0.2,
  STAT_BONUS_SCALING: 0.05,
  MAX_STAT_VALUE: 20,
  MIN_STAT_VALUE: 1
};

// AI analysis categories to RPG stats mapping
export const STAT_KEYWORDS = {
  strength: ['exercise', 'physical', 'strength', 'power', 'lifting', 'sports'],
  dexterity: ['agility', 'balance', 'coordination', 'reflex', 'speed', 'craft'],
  constitution: ['health', 'endurance', 'stamina', 'wellness', 'resilience'],
  intelligence: ['study', 'learn', 'research', 'analysis', 'problem-solving'],
  wisdom: ['reflection', 'meditation', 'insight', 'awareness', 'mindfulness'],
  charisma: ['social', 'leadership', 'communication', 'persuasion', 'empathy']
};

export function calculateStatWeights(analysis: Analysis, level: number): StatWeights {
  // ... existing calculateStatWeights implementation ...
}

export function calculateConsistencyBonus(character: Character): number {
  // ... existing calculateConsistencyBonus implementation ...
}

export async function updateCharacterProgress(
  userId: number, 
  analysis: Analysis, 
  client?: PoolClient
): Promise<Character> {
  // ... existing updateCharacterProgress implementation ...
}
