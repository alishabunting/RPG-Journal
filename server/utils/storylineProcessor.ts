import type { Quest } from "../../db/schema.js";

interface QuestMetadata {
  difficulty: number;
  statRequirements: Record<string, number>;
  storylineProgress: number;
  isAvailable: boolean;
  achievability?: number;
  growthPotential?: number;
  balance?: number;
  recommended?: boolean;
  animationState?: {
    isCompleting?: boolean;
    showReward?: boolean;
  };
}

interface StorylineNode {
  questId: number;
  nextQuests: number[];
  requirements: {
    level: number;
    stats: Record<string, number>;
    previousQuests: number[];
  };
  metadata: QuestMetadata;
}

interface QuestRequirement {
  stat: string;
  value: number;
  description: string;
}

interface QuestReward {
  stat: string;
  value: number;
  description: string;
}

interface QuestMetadata {
  difficulty: number;
  requirements: QuestRequirement[];
  rewards: QuestReward[];
  storylineProgress: number;
  isAvailable: boolean;
}

interface Storyline {
  id: string;
  title: string;
  description: string;
  category: string;
  nodes: StorylineNode[];
  currentNode?: number;
}

// Process quests into storyline chains
export function processStorylines(quests: Quest[]): Storyline[] {
  const storylines: Record<string, Storyline> = {};

  // Group quests by category
  quests.forEach(quest => {
    const category = quest.category;
    
    if (!storylines[category]) {
      storylines[category] = {
        id: `storyline-${category.toLowerCase()}`,
        title: `${category} Storyline`,
        description: `Journey through ${category} challenges`,
        category,
        nodes: []
      };
    }

    // Create node for current quest
    const questMetadata = quest.metadata || {};
    const node: StorylineNode = {
      questId: quest.id,
      nextQuests: [],
      requirements: {
        level: quest.difficulty || 1,
        stats: quest.statRequirements || {},
        previousQuests: []
      },
      metadata: {
        difficulty: quest.difficulty || 1,
        statRequirements: {},
        storylineProgress: questMetadata.storylineProgress || 0,
        isAvailable: true,
        achievability: questMetadata.achievability,
        growthPotential: questMetadata.growthPotential,
        balance: questMetadata.balance,
        recommended: questMetadata.recommended,
        animationState: questMetadata.animationState || {
          isCompleting: false,
          showReward: false
        }
      }
    };

    storylines[category].nodes.push(node);
  });

  // Process quest connections within each storyline
  Object.values(storylines).forEach(storyline => {
    storyline.nodes.sort((a, b) => 
      (a.requirements.level || 0) - (b.requirements.level || 0)
    );

    // Connect nodes based on difficulty progression
    storyline.nodes.forEach((node, index) => {
      if (index > 0) {
        // Add previous quest as requirement
        node.requirements.previousQuests = [storyline.nodes[index - 1].questId];
      }
      if (index < storyline.nodes.length - 1) {
        // Connect to next possible quests
        node.nextQuests = [storyline.nodes[index + 1].questId];
      }
    });

    // Set initial node
    if (storyline.nodes.length > 0) {
      storyline.currentNode = storyline.nodes[0].questId;
    }
  });

  return Object.values(storylines);
}

// Check if a quest is available based on storyline progression
export function isQuestAvailable(
  quest: Quest & { metadata?: { statRequirements?: Record<string, number> } },
  completedQuests: number[],
  characterStats: Record<string, number>,
  characterLevel: number
): boolean {
  // Check basic requirements
  if (quest.difficulty && quest.difficulty > characterLevel) {
    return false;
  }

  // Check stat requirements
  if (quest.statRequirements) {
    for (const [stat, required] of Object.entries(quest.statRequirements)) {
      if ((characterStats[stat] || 0) < (required as number || 0)) {
        return false;
      }
    }
  }

  // Check storyline progression
  const storylineQuests = processStorylines([quest]);
  if (storylineQuests.length > 0) {
    const storyline = storylineQuests[0];
    const node = storyline.nodes.find(n => n.questId === quest.id);
    
    if (node?.requirements.previousQuests) {
      if (!node.requirements.previousQuests.every(q => completedQuests.includes(q))) {
        return false;
      }
    }
  }

  return true;
}

// Calculate storyline progress percentage
export function calculateStorylineProgress(
  storyline: Storyline,
  completedQuests: string[]
): number {
  const totalNodes = storyline.nodes.length;
  if (totalNodes === 0) return 0;

  const completedNodes = storyline.nodes.filter(
    node => completedQuests.includes(String(node.questId))
  ).length;

  return (completedNodes / totalNodes) * 100;
}

// Get next available quests in storyline
export function getNextAvailableQuests(
  storyline: Storyline,
  completedQuests: number[],
  characterStats: Record<string, number>,
  characterLevel: number
): number[] {
  const availableQuests: number[] = [];
  const currentNode = storyline.nodes.find(
    node => node.questId === Number(storyline.currentNode)
  );

  if (!currentNode) return [];

  // Check next quests in current storyline branch
  currentNode.nextQuests.forEach(questId => {
    const nextNode = storyline.nodes.find(node => node.questId === questId);
    if (nextNode && isNodeAvailable(nextNode, completedQuests, characterStats, characterLevel)) {
      availableQuests.push(questId);
    }
  });

  return availableQuests;
}

// Helper function to check if a storyline node is available
function isNodeAvailable(
  node: StorylineNode,
  completedQuests: number[],
  characterStats: Record<string, number>,
  characterLevel: number
): boolean {
  // Check level requirement
  if (node.requirements.level && node.requirements.level > characterLevel) {
    return false;
  }

  // Check stat requirements
  if (node.requirements.stats) {
    for (const [stat, required] of Object.entries(node.requirements.stats)) {
      if ((characterStats[stat] || 0) < required) {
        return false;
      }
    }
  }

  // Check prerequisites
  if (node.requirements.previousQuests) {
    if (!node.requirements.previousQuests.every(q => completedQuests.includes(q))) {
      return false;
    }
  }

  return true;
}
