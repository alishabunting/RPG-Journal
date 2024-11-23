import type { Quest } from '../types/quest';
import type { StatWeights } from '../types/character';
import type { JournalAnalysis as Analysis } from "../openai.js";
import { generateQuests } from "../openai.js";

export function filterQuestsByStats(quests: Quest[], characterStats: StatWeights): Quest[] {
  // ... existing filterQuestsByStats implementation ...
}

export async function generateQuestsWithRetry(analysis: Analysis, characterStats: StatWeights, maxRetries = 3): Promise<Quest[]> {
  // ... existing generateQuestsWithRetry implementation ...
}
