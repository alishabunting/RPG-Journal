export interface StatWeights {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface Character {
  name: string;
  class: string;
  level: number;
  xp: number;
  stats: StatWeights;
  achievements: Array<{
    title: string;
    description?: string;
    timestamp: string;
  }>;
}

export interface CharacterProgression {
  insights: string[];
  skillsImproved: string[];
  relationships: Array<{
    name: string;
    context: string;
  }>;
}
