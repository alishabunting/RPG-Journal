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

// Quest categories and templates
const QUEST_TEMPLATES = {
  wellness: [
    { title: "Morning Exercise", description: "Complete a morning workout routine", difficulty: 2 },
    { title: "Healthy Meal", description: "Prepare a balanced, nutritious meal", difficulty: 1 },
    { title: "Meditation", description: "Practice mindfulness for 10 minutes", difficulty: 1 }
  ],
  social: [
    { title: "Social Connection", description: "Reach out to a friend or family member", difficulty: 1 },
    { title: "Group Activity", description: "Participate in a group activity or event", difficulty: 2 },
    { title: "Kind Gesture", description: "Perform a random act of kindness", difficulty: 1 }
  ],
  growth: [
    { title: "Skill Development", description: "Learn something new or practice a skill", difficulty: 2 },
    { title: "Reading Quest", description: "Read a book or article for personal growth", difficulty: 1 },
    { title: "Creative Expression", description: "Express yourself through art, writing, or music", difficulty: 2 }
  ],
  achievement: [
    { title: "Goal Setting", description: "Set and achieve a personal or professional goal", difficulty: 2 },
    { title: "Task Completion", description: "Complete an important task or project", difficulty: 2 },
    { title: "Skill Mastery", description: "Master a specific skill or technique", difficulty: 3 }
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
};

export type Quest = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'active' | 'completed';
};

// Helper functions
const generateId = () => Math.random().toString(36).substring(2, 15);

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
      mood: analysis.mood
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
  statChanges: Record<string, number>;
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
  
  return { mood, tags, statChanges };
}

function generateQuestsFromAnalysis(analysis: ReturnType<typeof analyzeContent>): Quest[] {
  const quests: Quest[] = [];
  const categories = Object.keys(QUEST_TEMPLATES) as Array<keyof typeof QUEST_TEMPLATES>;
  
  // Generate 1-3 relevant quests based on the journal content
  const relevantCategories = categories.filter(category => 
    analysis.statChanges[category] > 0 || analysis.tags.includes(category)
  );
  
  if (relevantCategories.length === 0) {
    // If no relevant categories, pick one randomly
    relevantCategories.push(categories[Math.floor(Math.random() * categories.length)]);
  }
  
  relevantCategories.forEach(category => {
    const template = QUEST_TEMPLATES[category][
      Math.floor(Math.random() * QUEST_TEMPLATES[category].length)
    ];
    
    quests.push({
      id: generateId(),
      title: template.title,
      description: template.description,
      category: category,
      status: 'active'
    });
  });
  
  return quests;
}
