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
  stats: {
    strength: 5,
    intelligence: 5,
    dexterity: 5,
    charisma: 5
  }
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
  stats: {
    strength: number;
    intelligence: number;
    dexterity: number;
    charisma: number;
  };
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

  addJournal: (content: string): Journal => {
    const journals = storage.getJournals();
    const newJournal: Journal = {
      id: generateId(),
      content,
      createdAt: new Date().toISOString(),
      tags: generateTags(content)
    };
    journals.unshift(newJournal);
    localStorage.setItem(STORAGE_KEYS.JOURNALS, JSON.stringify(journals));
    return newJournal;
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

// Helper function to generate tags from content (simplified version)
function generateTags(content: string): string[] {
  const commonTerms = ['goal', 'achievement', 'challenge', 'progress', 'milestone'];
  return commonTerms.filter(term => content.toLowerCase().includes(term));
}
