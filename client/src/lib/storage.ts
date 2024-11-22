// Local storage keys
const STORAGE_KEYS = {
  USER: 'rpg-journal:user',
  JOURNALS: 'rpg-journal:journals',
  QUESTS: 'rpg-journal:quests',
  CHARACTER: 'rpg-journal:character'
} as const;

// Default character stats
const DEFAULT_CHARACTER = {
  name: 'Adventurer',
  class: 'Warrior',
  avatar: '/avatars/warrior.svg',
  level: 1,
  xp: 0,
  stats: {
    strength: 1,
    dexterity: 1,
    constitution: 1,
    intelligence: 1,
    wisdom: 1,
    charisma: 1
  },
  achievements: []
};

// Quest categories and templates with stat requirements and rewards
const QUEST_TEMPLATES = {
  wellness: [
    { 
      title: "Morning Exercise",
      description: "Complete a morning workout routine",
      difficulty: 2,
      statRequirements: { constitution: 2 },
      statRewards: { strength: 0.2, constitution: 0.3 }
    },
    { 
      title: "Healthy Meal",
      description: "Prepare a balanced, nutritious meal",
      difficulty: 1,
      statRequirements: { wisdom: 1 },
      statRewards: { constitution: 0.2, wisdom: 0.1 }
    },
    { 
      title: "Meditation",
      description: "Practice mindfulness for 10 minutes",
      difficulty: 1,
      statRequirements: { wisdom: 2 },
      statRewards: { wisdom: 0.3, charisma: 0.1 }
    }
  ],
  social: [
    { 
      title: "Social Connection",
      description: "Reach out to a friend or family member",
      difficulty: 1,
      statRequirements: { charisma: 1 },
      statRewards: { charisma: 0.2, wisdom: 0.1 }
    },
    { 
      title: "Group Activity",
      description: "Participate in a group activity or event",
      difficulty: 2,
      statRequirements: { charisma: 2, constitution: 1 },
      statRewards: { charisma: 0.3, strength: 0.1 }
    },
    { 
      title: "Kind Gesture",
      description: "Perform a random act of kindness",
      difficulty: 1,
      statRequirements: { wisdom: 1, charisma: 1 },
      statRewards: { charisma: 0.2, wisdom: 0.2 }
    }
  ],
  growth: [
    { 
      title: "Skill Development",
      description: "Learn something new or practice a skill",
      difficulty: 2,
      statRequirements: { intelligence: 2 },
      statRewards: { intelligence: 0.3, wisdom: 0.1 }
    },
    { 
      title: "Reading Quest",
      description: "Read a book or article for personal growth",
      difficulty: 1,
      statRequirements: { intelligence: 1 },
      statRewards: { intelligence: 0.2, wisdom: 0.2 }
    },
    { 
      title: "Creative Expression",
      description: "Express yourself through art, writing, or music",
      difficulty: 2,
      statRequirements: { intelligence: 1, charisma: 1 },
      statRewards: { charisma: 0.2, intelligence: 0.2 }
    }
  ],
  achievement: [
    { 
      title: "Goal Setting",
      description: "Set and achieve a personal or professional goal",
      difficulty: 2,
      statRequirements: { wisdom: 2, intelligence: 1 },
      statRewards: { wisdom: 0.2, intelligence: 0.2 }
    },
    { 
      title: "Task Completion",
      description: "Complete an important task or project",
      difficulty: 2,
      statRequirements: { intelligence: 2 },
      statRewards: { intelligence: 0.3, wisdom: 0.1 }
    },
    { 
      title: "Skill Mastery",
      description: "Master a specific skill or technique",
      difficulty: 3,
      statRequirements: { intelligence: 3, wisdom: 2 },
      statRewards: { intelligence: 0.4, wisdom: 0.2 }
    }
  ]
};

// Type definitions
export type User = {
  id: string;
  username: string;
  character: Character;
};

export type Character = {
  name: string;
  class: string;
  avatar: string;
  level: number;
  xp: number;
  stats: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  achievements: Array<{
    title: string;
    description?: string;
    timestamp: string;
  }>;
};

export type Journal = {
  id: string;
  content: string;
  createdAt: string;
  tags: string[];
  mood?: string;
  analysis?: {
    mood: string;
    tags: string[];
    growthAreas: string[];
    statChanges: Record<string, number>;
    characterProgression?: {
      insights: string[];
      skillsImproved: string[];
      relationships: any[];
    };
  };
};

export type Quest = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'active' | 'completed';
  difficulty?: number;
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
  metadata?: {
    achievability: number;
    growthPotential: number;
    balance: number;
    recommended: boolean;
  };
};

// Helper functions
const generateId = () => Math.random().toString(36).substring(2, 15);
// Helper functions for quest recommendation scoring
function calculateAchievabilityScore(requirements: Record<string, number>, stats: Record<string, number>): number {
  if (Object.keys(requirements).length === 0) return 1;
  
  const scores = Object.entries(requirements).map(([stat, required]) => {
    const current = stats[stat] || 0;
    if (current >= required) return 1;
    return Math.max(0, current / required);
  });
  
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function calculateGrowthScore(rewards: Record<string, number>, growthPotential: Record<string, number>): number {
  if (Object.keys(rewards).length === 0) return 0.5;
  
  const scores = Object.entries(rewards).map(([stat, reward]) => {
    const potential = growthPotential[stat] || 0;
    return reward * potential;
  });
  
  return Math.min(1, scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function calculateBalanceScore(requirements: Record<string, number>, stats: Record<string, number>): number {
  if (Object.keys(requirements).length === 0) return 1;
  
  const differences = Object.entries(requirements).map(([stat, required]) => {
    const current = stats[stat] || 0;
    return Math.abs(current - required);
  });
  
  const avgDifference = differences.reduce((sum, diff) => sum + diff, 0) / differences.length;
  return Math.max(0, 1 - (avgDifference / 5)); // Scale difference to 0-1 range
}

// Storage service
export const storage = {
  // User methods
  getUser: (): User | null => {
    const data = localStorage.getItem(STORAGE_KEYS.USER);
    return data ? JSON.parse(data) : null;
  },

  setUser: (username: string): User => {
    const user: User = {
      id: generateId(),
      username,
      character: DEFAULT_CHARACTER
    };
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    return user;
  },

  updateCharacter: (character: Character): void => {
    const user = storage.getUser();
    if (user) {
      user.character = character;
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    }
  },

  clearUser: () => {
    localStorage.removeItem(STORAGE_KEYS.USER);
  },

  // Journal methods
  getJournals: (): Journal[] => {
    const data = localStorage.getItem(STORAGE_KEYS.JOURNALS);
    return data ? JSON.parse(data) : [];
  },

  addJournal: (content: string): { journal: Journal; quests: Quest[] } => {
    const journals = storage.getJournals();
    const analysis = analyzeContent(content);
    
    const newJournal: Journal = {
      id: generateId(),
      content,
      createdAt: new Date().toISOString(),
      tags: analysis.tags,
      analysis: analysis
    };
    
    // Update character stats based on analysis
    const user = storage.getUser();
    if (user) {
      const character = user.character;
      Object.entries(analysis.statChanges).forEach(([stat, change]) => {
        if (character.stats[stat] !== undefined) {
          character.stats[stat] = Math.min(10, character.stats[stat] + change);
        }
      });
      
      // Update XP and level
      character.xp += 50; // Base XP for journal entry
      character.level = Math.floor(character.xp / 1000) + 1;
      
      storage.updateCharacter(character);
    }
    
    // Generate and save quests
    const newQuests = generateQuestsFromAnalysis(analysis);
    const quests = storage.getQuests();
    quests.push(...newQuests);
    
    journals.unshift(newJournal);
    localStorage.setItem(STORAGE_KEYS.JOURNALS, JSON.stringify(journals));
    localStorage.setItem(STORAGE_KEYS.QUESTS, JSON.stringify(quests));
    
    return { journal: newJournal, quests: newQuests };
  },

  // Quest methods
  getQuests: (): Quest[] => {
    const data = localStorage.getItem(STORAGE_KEYS.QUESTS);
    return data ? JSON.parse(data) : [];
  },

  addQuest: (quest: Omit<Quest, 'id' | 'status'>): Quest => {
    const quests = storage.getQuests();
    const newQuest: Quest = {
      id: generateId(),
      ...quest,
      status: 'active'
    };
    quests.push(newQuest);
    localStorage.setItem(STORAGE_KEYS.QUESTS, JSON.stringify(quests));
    return newQuest;
  },

  completeQuest: (questId: string): void => {
    const quests = storage.getQuests();
    const updatedQuests = quests.map(quest =>
      quest.id === questId ? { ...quest, status: 'completed' as const } : quest
    );
    localStorage.setItem(STORAGE_KEYS.QUESTS, JSON.stringify(updatedQuests));
  }
};

// Helper functions for local processing
function generateTags(content: string): string[] {
  const commonTerms = ['goal', 'achievement', 'challenge', 'progress', 'milestone', 
    'wellness', 'health', 'social', 'growth', 'learning', 'success'];
  return commonTerms.filter(term => content.toLowerCase().includes(term));
}

function analyzeContent(content: string): {
  mood: string;
  tags: string[];
  growthAreas: string[];
  statChanges: Record<string, number>;
  characterProgression: {
    insights: string[];
    skillsImproved: string[];
    relationships: any[];
  };
} {
  const text = content.toLowerCase();
  const tags = generateTags(content);
  
  // Simple sentiment analysis
  const positiveWords = ['happy', 'great', 'awesome', 'good', 'excellent', 'proud', 'achieved'];
  const negativeWords = ['sad', 'bad', 'difficult', 'hard', 'frustrated', 'worried', 'failed'];
  
  const positiveCount = positiveWords.filter(word => text.includes(word)).length;
  const negativeCount = negativeWords.filter(word => text.includes(word)).length;
  
  const mood = positiveCount > negativeCount ? 'positive' : 
               negativeCount > positiveCount ? 'negative' : 'neutral';
  
  // Calculate stat changes based on content analysis
  const statChanges = {
    wellness: text.includes('health') || text.includes('exercise') || text.includes('sleep') ? 0.2 : 0,
    social: text.includes('friend') || text.includes('family') || text.includes('people') ? 0.2 : 0,
    growth: text.includes('learn') || text.includes('read') || text.includes('study') ? 0.2 : 0,
    achievement: text.includes('complete') || text.includes('finish') || text.includes('accomplish') ? 0.2 : 0
  };
  
  return { 
    mood, 
    tags, 
    growthAreas: [], 
    statChanges,
    characterProgression: {
      insights: [],
      skillsImproved: [],
      relationships: []
    }
  };
}

function generateQuestsFromAnalysis(analysis: ReturnType<typeof analyzeContent>): Quest[] {
  const quests: Quest[] = [];
  const categories = Object.keys(QUEST_TEMPLATES) as Array<keyof typeof QUEST_TEMPLATES>;
  const user = storage.getUser();
  
  if (!user) return [];
  
  // Get character stats
  const characterStats = user.character.stats;
  
  // Calculate stat growth potential and balance
  const statGrowthPotential = Object.entries(characterStats)
    .reduce((acc, [stat, value]) => {
      acc[stat] = Math.max(0, 10 - value) / 10; // Higher potential for lower stats
      return acc;
    }, {} as Record<string, number>);
  
  // Generate recommended quests based on stats and growth potential
  const recommendedQuests = categories.flatMap(category => {
    return QUEST_TEMPLATES[category].map(template => {
      // Calculate quest suitability scores
      const achievabilityScore = calculateAchievabilityScore(template.statRequirements || {}, characterStats);
      const growthScore = calculateGrowthScore(template.statRewards || {}, statGrowthPotential);
      const balanceScore = calculateBalanceScore(template.statRequirements || {}, characterStats);
      
      const finalScore = (achievabilityScore * 0.4) + (growthScore * 0.4) + (balanceScore * 0.2);
      
      return {
        quest: {
          id: generateId(),
          title: template.title,
          description: template.description,
          category,
          status: 'active' as const,
          difficulty: template.difficulty,
          statRequirements: template.statRequirements,
          statRewards: template.statRewards,
          metadata: {
            achievability: achievabilityScore,
            growthPotential: growthScore,
            balance: balanceScore,
            recommended: finalScore > 0.6
          }
        },
        score: finalScore
      };
    });
  });
  
  // Sort quests by score and take top recommendations
  const sortedQuests = recommendedQuests
    .sort((a, b) => b.score - a.score)
    .slice(0, 5) // Take top 5 recommended quests
    .map(({ quest }) => quest)
    .filter(quest => {
      // Additional filtering for quest suitability
      if (!quest.statRequirements) return true;
      
      // Calculate how many requirements are within reasonable reach
      const reqCount = Object.keys(quest.statRequirements).length;
      const meetableReqs = Object.entries(quest.statRequirements).reduce((count, [stat, required]) => {
        const current = characterStats[stat as keyof typeof characterStats] || 0;
        // Consider a requirement meetable if within 2 points or already met
        return count + (current >= required || current >= required - 2 ? 1 : 0);
      }, 0);
      
      // Quest is suitable if player can meet at least 70% of requirements
      return reqCount === 0 || (meetableReqs / reqCount) >= 0.7;
    });
  
  quests.push(...sortedQuests);
  
  return quests;
}
