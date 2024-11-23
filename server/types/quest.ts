import type { StatWeights } from './character';

export interface QuestRequirement {
  stat: string;
  value: number;
  description: string;
}

export interface QuestReward {
  stat: string;
  value: number;
  description: string;
}

export interface QuestMetadata {
  difficulty: number;
  requirements: QuestRequirement[];
  rewards: QuestReward[];
  storylineProgress: number;
  isAvailable: boolean;
  achievability?: number;
  growthPotential?: number;
  balance?: number;
  recommended?: boolean;
}

export interface QuestProgress {
  questId: string;
  status: 'active' | 'completed';
  completedAt?: Date;
  metrics?: {
    timeSpent?: number;
    attempts?: number;
    difficultyRating?: number;
  };
}

export interface Quest {
  id: number;
  title: string;
  description: string;
  difficulty: number;
  category: string;
  status: 'active' | 'completed';
  userId: number;
  createdAt?: Date;
  completedAt?: Date | null;
  statRequirements?: Partial<StatWeights>;
  statRewards?: Partial<StatWeights>;
  storylineId?: string;
  previousQuestId?: number;
  nextQuestId?: number;
  metadata?: QuestMetadata;
}

export interface QuestRewards {
  xpGained: number;
  statUpdates: Record<string, number>;
  achievements: string[];
}

export interface QuestChain {
  id: string;
  title: string;
  description: string;
  quests: Quest[];
  requirements: {
    minLevel: number;
    stats: Record<string, number>;
  };
}
