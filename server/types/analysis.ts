export interface Analysis {
  mood: string;
  tags: string[];
  growthAreas: string[];
  statChanges: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  characterProgression: {
    insights: string[];
    skillsImproved: string[];
    relationships: Array<{ name: string; context: string }>;
  };
}
