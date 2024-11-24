// Local storage keys
const STORAGE_KEYS = {
  USER: 'rpg-journal:user',
  JOURNALS: 'rpg-journal:journals',
  QUESTS: 'rpg-journal:quests',
  CHARACTER: 'rpg-journal:character'
} as const;

// Stat contexts for content analysis
const statContexts = {
  strength: ['exercise', 'physical', 'strength', 'power', 'lifting', 'sports'],
  dexterity: ['agility', 'balance', 'coordination', 'reflex', 'speed', 'craft'],
  constitution: ['health', 'endurance', 'stamina', 'wellness', 'resilience'],
  intelligence: ['study', 'learn', 'research', 'analysis', 'problem-solving'],
  wisdom: ['reflection', 'meditation', 'insight', 'awareness', 'mindfulness'],
  charisma: ['social', 'leadership', 'communication', 'persuasion', 'empathy']
};
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
  difficulty: number;
  xpReward: number;
  storylineId?: string;
  previousQuestId?: number;
  nextQuestId?: number;
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
    achievability?: number;
    growthPotential?: number;
    balance?: number;
    recommended?: boolean;
    storylineProgress?: number;
    animationState?: {
      isCompleting?: boolean;
      showReward?: boolean;
    };
  };
  createdAt: string;
  completedAt?: string;
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
  const words = text.split(/\s+/);
  const sentences = content.split(/[.!?]+/).filter(Boolean);
  // Initialize stat changes object
  const statChanges: Record<string, number> = {};
  
  // Calculate progressive stat changes based on context and patterns
  Object.entries(statContexts).forEach(([stat, keywords]) => {
    let statScore = 0;
    
    // Analyze each sentence for context
    sentences.forEach(sentence => {
      const sentenceL = sentence.toLowerCase();
      const keywordMatches = keywords.filter(word => sentenceL.includes(word));
      
      if (keywordMatches.length > 0) {
        // Base score from keyword matches
        const baseScore = keywordMatches.length * 0.1;
        
        // Context multipliers
        const hasDetail = sentence.length > 50 ? 1.2 : 1;
        const hasQuantifier = /\d+/.test(sentence) ? 1.3 : 1;
        const hasProgress = /(progress|improve|better|growth)/i.test(sentence) ? 1.2 : 1;
        
        statScore += baseScore * hasDetail * hasQuantifier * hasProgress;
      }
    });
    
    // Apply diminishing returns and normalize
    statChanges[stat] = Math.min(0.5, Math.log1p(statScore) * 0.2);
  });
  
  // Enhanced tag generation with context awareness
  const tags = generateTags(content);
  
  // Improved sentiment analysis with intensity scoring
  const moodKeywords = {
    positive: ['happy', 'great', 'awesome', 'good', 'excellent', 'proud', 'achieved', 'excited', 'inspired'],
    negative: ['sad', 'bad', 'difficult', 'hard', 'frustrated', 'worried', 'failed', 'anxious', 'overwhelmed'],
    neutral: ['okay', 'fine', 'normal', 'regular', 'usual']
  };
  
  const moodScores = {
    positive: 0,
    negative: 0,
    neutral: 0
  };
  
  // Calculate mood scores with intensity and context
  words.forEach((word, index) => {
    const prevWord = index > 0 ? words[index - 1] : '';
    const intensifiers = ['very', 'really', 'extremely', 'incredibly'];
    const multiplier = intensifiers.includes(prevWord) ? 1.5 : 1;
    
    Object.entries(moodKeywords).forEach(([mood, keywords]) => {
      if (keywords.includes(word)) {
        moodScores[mood as keyof typeof moodScores] += multiplier;
      }
    });
  });
  // Calculate progressive stat changes based on context and patterns
  Object.entries(statContexts).forEach(([stat, keywords]) => {
    let statScore = 0;
    
    // Analyze each sentence for context
    sentences.forEach(sentence => {
      const sentenceL = sentence.toLowerCase();
      const keywordMatches = keywords.filter(word => sentenceL.includes(word));
      
      if (keywordMatches.length > 0) {
        // Base score from keyword matches
        const baseScore = keywordMatches.length * 0.1;
        
        // Context multipliers
        const hasDetail = sentence.length > 50 ? 1.2 : 1;
        const hasQuantifier = /\d+/.test(sentence) ? 1.3 : 1;
        const hasProgress = /(progress|improve|better|growth)/i.test(sentence) ? 1.2 : 1;
        
        statScore += baseScore * hasDetail * hasQuantifier * hasProgress;
      }
    });
    
    // Apply diminishing returns and normalize
    statChanges[stat] = Math.min(0.5, Math.log1p(statScore) * 0.2);
  });
  
  // Extract growth areas and progression insights
  const growthAreas = Object.entries(statChanges)
    .filter(([_, value]) => value > 0.2)
    .map(([stat]) => stat);

  const characterProgression = {
    insights: sentences
      .filter(sentence => 
        /\b(realize|understand|learn|discover|insight)\b/i.test(sentence) &&
        sentence.length > 30
      ),
    skillsImproved: Object.entries(statContexts)
      .filter(([stat]) => statChanges[stat] > 0.3)
      .map(([stat]) => `Improved ${stat} through focused activities`),
    relationships: []
  };

  // Calculate final sentiment intensity for progression impact
  const sentimentIntensity = Math.max(...Object.values(moodScores)) / 5; // Normalize to 0-1 range
  
  // Apply sentiment multiplier to stat changes
  Object.keys(statChanges).forEach(stat => {
    const baseChange = statChanges[stat];
    const sentimentMultiplier = 1 + (sentimentIntensity * 0.5); // Max 50% boost from sentiment
    statChanges[stat] = Math.min(1.0, baseChange * sentimentMultiplier);
  });

  // Enhanced progression tracking with comprehensive context
  const enhancedCharacterProgression = {
    ...characterProgression,
    progressionContext: {
      sentimentIntensity,
      keywordMatches: Object.fromEntries(
        Object.entries(statContexts).map(([stat, keywords]) => [
          stat,
          keywords.filter(word => content.toLowerCase().includes(word)).length
        ])
      ),
      detailedAnalysis: sentences
        .filter(s => s.length > 30)
        .map(s => ({
          content: s,
          hasQuantifier: /\d+/.test(s),
          hasProgress: /(progress|improve|better|growth)/i.test(s)
        }))
    }
  };

  // Return the final analysis results with enhanced progression tracking
  // Determine mood based on mood scores
  const mood = Object.entries(moodScores).reduce<keyof typeof moodScores>((a, [key, value]) => {
    const currentScore = moodScores[a];
    return currentScore > value ? a : key as keyof typeof moodScores;
  }, 'neutral');

  return {
    mood,
    tags,
    growthAreas,
    statChanges,
    characterProgression: enhancedCharacterProgression
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
          xpReward: template.difficulty * 50,
          createdAt: new Date().toISOString(),
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
        const requiredValue = Number(required);
        return count + (current >= requiredValue || current >= requiredValue - 2 ? 1 : 0);
      }, 0);
      
      // Quest is suitable if player can meet at least 70% of requirements
      return reqCount === 0 || (meetableReqs / reqCount) >= 0.7;
    });
  
  quests.push(...sortedQuests);
  
  return quests;
}
