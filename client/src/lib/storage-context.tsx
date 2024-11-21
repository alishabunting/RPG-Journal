import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, Character, Journal, Quest } from './storage';
import { storage } from './storage';

interface StorageContextType {
  user: User | null;
  journals: Journal[];
  quests: Quest[];
  updateUser: (user: User) => void;
  updateCharacter: (character: Character) => void;
  addJournal: (content: string) => void;
  addQuest: (quest: Omit<Quest, 'id' | 'status'>) => void;
  completeQuest: (questId: string) => void;
}

const StorageContext = createContext<StorageContextType | undefined>(undefined);

export function StorageProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => storage.getUser());
  const [journals, setJournals] = useState<Journal[]>(() => storage.getJournals());
  const [quests, setQuests] = useState<Quest[]>(() => storage.getQuests());

  const updateUser = (newUser: User) => {
    storage.setUser(newUser.username);
    setUser(newUser);
  };

  const updateCharacter = (character: Character) => {
    storage.updateCharacter(character);
    setUser(prev => prev ? { ...prev, character } : null);
  };

  const addJournal = (content: string) => {
    const result = storage.addJournal(content);
    setJournals(prev => [result.journal, ...prev]);
    setQuests(prev => [...result.quests, ...prev]);
    
    if (user) {
      const updatedUser = storage.getUser();
      if (updatedUser) {
        setUser(updatedUser);
      }
    }
  };

  const addQuest = (quest: Omit<Quest, 'id' | 'status'>) => {
    const newQuest = storage.addQuest(quest);
    setQuests(prev => [...prev, newQuest]);
  };

  const completeQuest = (questId: string) => {
    storage.completeQuest(questId);
    setQuests(prev => 
      prev.map(quest => 
        quest.id === questId ? { ...quest, status: 'completed' as const } : quest
      )
    );
  };

  return (
    <StorageContext.Provider
      value={{
        user,
        journals,
        quests,
        updateUser,
        updateCharacter,
        addJournal,
        addQuest,
        completeQuest,
      }}
    >
      {children}
    </StorageContext.Provider>
  );
}

export function useStorage() {
  const context = useContext(StorageContext);
  if (context === undefined) {
    throw new Error('useStorage must be used within a StorageProvider');
  }
  return context;
}
