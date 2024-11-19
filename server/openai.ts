import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

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
    achievements: string[];
    questSuggestions: Array<{
      title: string;
      description: string;
      category: string;
      difficulty: number;
    }>;
  };
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

class OpenAIError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'OpenAIError';
  }
}

async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (error?.response?.status) {
        const status = error.response.status;
        const errorMessage = error.response?.data?.error?.message || error.message;
        
        switch (status) {
          case 401:
            throw new OpenAIError('Invalid API key', 'INVALID_API_KEY', status);
          case 429:
            console.log(`Rate limited. Retrying in ${baseDelay * Math.pow(2, attempt)}ms...`);
            break;
          case 500:
            throw new OpenAIError('OpenAI service error', 'INTERNAL_ERROR', status);
          case 503:
            console.log('OpenAI service temporarily unavailable, retrying...');
            break;
          default:
            if (attempt === maxRetries - 1) {
              throw new OpenAIError(
                `OpenAI API error: ${errorMessage}`,
                'API_ERROR',
                status
              );
            }
        }
      }
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  throw lastError || new Error("Operation failed after retries");
}

export async function analyzeEntry(content: string): Promise<JournalAnalysis> {
  try {
    console.log("Analyzing journal entry...");
    const response = await withRetry<ChatCompletion>(async () => 
      openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are an RPG Game Master analyzing journal entries to track character progression and generate quests. 
                     Focus on personal growth, achievements, and relationships from an RPG perspective.
                     Identify opportunities for character development and quest generation.
                     Consider emotional state, challenges faced, and growth opportunities.
                     Think about how real-life experiences can be gamified into meaningful quests.
                     Return a JSON formatted response.`
          },
          {
            role: "user",
            content: `Analyze this journal entry and provide an RPG-style assessment in JSON format:
            
            ${content}`
          }
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: "json_object" }
      })
    );

    console.log("Successfully received OpenAI analysis");
    const responseContent = response.choices[0].message.content;
    if (!responseContent) {
      throw new OpenAIError("Empty response from OpenAI", "EMPTY_RESPONSE");
    }
    
    const result = JSON.parse(responseContent) as JournalAnalysis;
    
    if (!result.mood || !result.tags || !result.growthAreas || !result.statChanges) {
      throw new OpenAIError("Invalid response structure from OpenAI", "INVALID_RESPONSE");
    }
    
    Object.entries(result.statChanges).forEach(([stat, value]) => {
      if (typeof value !== 'number' || value < -1 || value > 1) {
        throw new OpenAIError(`Invalid stat change value for ${stat}`, "INVALID_STAT_CHANGE");
      }
    });
    
    return result;
  } catch (error) {
    console.error("Error analyzing journal entry:", error);
    if (error instanceof OpenAIError) {
      throw error;
    }
    throw new OpenAIError(
      "Failed to analyze journal entry: " + (error instanceof Error ? error.message : String(error)),
      "ANALYSIS_ERROR"
    );
  }
}

export async function generateQuests(analysis: JournalAnalysis): Promise<Quest[]> {
  try {
    console.log("Generating quests based on analysis...");
    const response = await withRetry<ChatCompletion>(async () =>
      openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are an RPG Quest Master generating personalized quests based on journal analysis.
                     Create meaningful, achievable quests that align with character development.
                     Focus on the character's current emotional state and growth opportunities.
                     Design quests that encourage personal growth and skill development.
                     Consider both short-term challenges and long-term character progression.
                     Return a JSON formatted response.`
          },
          {
            role: "user",
            content: `Generate RPG-style quests based on this character analysis in JSON format:
            
            ${JSON.stringify(analysis)}`
          }
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: "json_object" }
      })
    );

    console.log("Successfully generated quests");
    const responseContent = response.choices[0].message.content;
    if (!responseContent) {
      throw new OpenAIError("Empty response from OpenAI", "EMPTY_RESPONSE");
    }
    
    const result = JSON.parse(responseContent) as { quests: Quest[] };
    if (!Array.isArray(result.quests)) {
      throw new OpenAIError("Invalid quest structure from OpenAI", "INVALID_RESPONSE");
    }
    
    result.quests.forEach((quest, index) => {
      if (!quest.title || !quest.description || !quest.category || !quest.difficulty) {
        throw new OpenAIError(`Invalid quest at index ${index}`, "INVALID_QUEST");
      }
      
      quest.difficulty = Math.max(1, Math.min(5, quest.difficulty));
      quest.xpReward = Math.max(50, Math.min(200, quest.xpReward));
      
      if (quest.statRewards) {
        Object.entries(quest.statRewards).forEach(([stat, value]) => {
          if (typeof value === 'number') {
            quest.statRewards[stat] = Math.max(1, Math.min(3, value));
          }
        });
      }
    });
    
    return result.quests;
  } catch (error) {
    console.error("Error generating quests:", error);
    if (error instanceof OpenAIError) {
      throw error;
    }
    throw new OpenAIError(
      "Failed to generate quests: " + (error instanceof Error ? error.message : String(error)),
      "QUEST_GENERATION_ERROR"
    );
  }
}

export async function calculateQuestCompletion(
  questId: number,
  currentStats: Record<string, number>
): Promise<{
  xpGained: number;
  statUpdates: Record<string, number>;
  achievements: string[];
}> {
  try {
    console.log("Calculating quest completion rewards...");
    const response = await withRetry<ChatCompletion>(async () =>
      openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are an RPG reward system that calculates appropriate rewards for completed quests.
                     Consider the character's current progression and balance rewards accordingly.
                     Generate meaningful achievements that reflect personal growth.
                     Ensure rewards are meaningful but not overpowered.
                     Return a JSON formatted response.`
          },
          { 
            role: "user", 
            content: `Calculate quest completion rewards based on:
            Current character stats: ${JSON.stringify(currentStats)}
            
            Return the response in JSON format.`
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: "json_object" }
      })
    );

    console.log("Successfully calculated rewards");
    const responseContent = response.choices[0].message.content;
    if (!responseContent) {
      throw new OpenAIError("Empty response from OpenAI", "EMPTY_RESPONSE");
    }

    const result = JSON.parse(responseContent) as {
      xpGained: number;
      statUpdates: Record<string, number>;
      achievements: string[];
    };

    if (typeof result.xpGained !== 'number' || !result.statUpdates || !Array.isArray(result.achievements)) {
      throw new OpenAIError("Invalid reward structure from OpenAI", "INVALID_RESPONSE");
    }

    return {
      xpGained: Math.max(50, Math.min(200, result.xpGained)),
      statUpdates: Object.fromEntries(
        Object.entries(result.statUpdates).map(([stat, value]) => [
          stat,
          Math.max(0, Math.min(2, value))
        ])
      ),
      achievements: result.achievements
    };
  } catch (error) {
    console.error("Error calculating quest completion rewards:", error);
    if (error instanceof OpenAIError) {
      throw error;
    }
    throw new OpenAIError(
      "Failed to calculate quest completion rewards: " + (error instanceof Error ? error.message : String(error)),
      "REWARD_CALCULATION_ERROR"
    );
  }
}

// Test OpenAI connection during startup
export async function testOpenAIConnection(): Promise<void> {
  try {
    await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a JSON response generator. Return a JSON response."
        },
        {
          role: "user",
          content: "Test connection. Return a JSON response with status."
        }
      ],
      response_format: { type: "json_object" }
    });
    console.log("OpenAI connection test successful");
  } catch (error) {
    console.error("OpenAI connection test failed:", error);
    throw new Error("Failed to connect to OpenAI API. Please check your API key and try again.");
  }
}
