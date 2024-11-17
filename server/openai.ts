import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface JournalAnalysis {
  mood: string;
  tags: string[];
  growthAreas: string[];
  statChanges: {
    wellness: number;
    social: number;
    growth: number;
    achievement: number;
  };
  characterProgression: {
    insights: string[];
    skillsImproved: string[];
    relationships: Array<{ name: string; context: string }>;
  };
}

export async function analyzeEntry(content: string): Promise<JournalAnalysis> {
  const prompt = `
    Analyze this journal entry and provide a response in the following JSON format:
    {
      "mood": "string describing the overall mood",
      "tags": ["array", "of", "relevant", "tags"],
      "growthAreas": ["array", "of", "growth", "opportunities"],
      "statChanges": {
        "wellness": "number between -1 and 1",
        "social": "number between -1 and 1",
        "growth": "number between -1 and 1",
        "achievement": "number between -1 and 1"
      },
      "characterProgression": {
        "insights": ["array", "of", "personal", "insights"],
        "skillsImproved": ["array", "of", "skills", "developed"],
        "relationships": [
          {
            "name": "person name",
            "context": "interaction context"
          }
        ]
      }
    }

    Journal entry: ${content}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an AI that analyzes journal entries to track personal growth, character development, and relationships in an RPG context. Provide nuanced analysis of emotional states, personal achievements, and growth opportunities."
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(response.choices[0].message.content || "{}");
    return {
      mood: analysis.mood || "neutral",
      tags: analysis.tags || [],
      growthAreas: analysis.growthAreas || [],
      statChanges: analysis.statChanges || {
        wellness: 0,
        social: 0,
        growth: 0,
        achievement: 0
      },
      characterProgression: analysis.characterProgression || {
        insights: [],
        skillsImproved: [],
        relationships: []
      }
    };
  } catch (error) {
    console.error("Error analyzing journal entry:", error);
    return {
      mood: "neutral",
      tags: [],
      growthAreas: [],
      statChanges: {
        wellness: 0,
        social: 0,
        growth: 0,
        achievement: 0
      },
      characterProgression: {
        insights: [],
        skillsImproved: [],
        relationships: []
      }
    };
  }
}

interface Quest {
  title: string;
  description: string;
  category: string;
  difficulty: number;
  xpReward: number;
  statRewards: {
    wellness?: number;
    social?: number;
    growth?: number;
    achievement?: number;
  };
  timeframe?: string;
}

export async function generateQuests(analysis: JournalAnalysis): Promise<Quest[]> {
  const prompt = `
    Generate 3 personalized RPG-style quests based on this journal analysis. Provide the response in the following JSON format:
    [
      {
        "title": "quest title",
        "description": "detailed quest description",
        "category": "Personal/Professional/Social/Health",
        "difficulty": "number between 1-5",
        "xpReward": "number between 50-200",
        "statRewards": {
          "wellness": "optional number between 1-3",
          "social": "optional number between 1-3",
          "growth": "optional number between 1-3",
          "achievement": "optional number between 1-3"
        },
        "timeframe": "suggested timeframe for completion"
      }
    ]

    Context:
    - Current Mood: ${analysis.mood}
    - Tags: ${analysis.tags.join(", ")}
    - Growth Areas: ${analysis.growthAreas.join(", ")}
    - Recent Insights: ${analysis.characterProgression.insights.join(", ")}
    - Skills Being Developed: ${analysis.characterProgression.skillsImproved.join(", ")}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a quest master that creates engaging personal development challenges. Focus on the user's current growth trajectory and emotional state to generate meaningful, achievable quests that align with their character progression."
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      temperature: 0.8,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const quests = JSON.parse(response.choices[0].message.content || "[]");
    return Array.isArray(quests) ? quests : [];
  } catch (error) {
    console.error("Error generating quests:", error);
    return [];
  }
}

export async function calculateQuestCompletion(
  questId: number,
  currentStats: any
): Promise<{
  xpGained: number;
  statUpdates: Record<string, number>;
  achievements: string[];
}> {
  const prompt = `
    Generate quest completion rewards in the following JSON format:
    {
      "xpGained": "number between 50-200",
      "statUpdates": {
        "wellness": "number between 0-2",
        "social": "number between 0-2",
        "growth": "number between 0-2",
        "achievement": "number between 0-2"
      },
      "achievements": ["array", "of", "achievement", "descriptions"]
    }

    Current character stats: ${JSON.stringify(currentStats)}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an RPG reward system that calculates appropriate rewards for completed quests based on character progression and current stats."
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const rewards = JSON.parse(response.choices[0].message.content || "{}");
    return {
      xpGained: rewards.xpGained || 50,
      statUpdates: rewards.statUpdates || {},
      achievements: rewards.achievements || []
    };
  } catch (error) {
    console.error("Error calculating quest completion rewards:", error);
    return {
      xpGained: 50,
      statUpdates: {},
      achievements: []
    };
  }
}
