import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface JournalAnalysis {
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

function getEmotionalIntensity(mood: string): number {
  const intensityMap: Record<string, number> = {
    'very positive': 1.0,
    'positive': 0.7,
    'neutral': 0.3,
    'negative': 0.5,
    'very negative': 0.8
  };
  
  return intensityMap[mood.toLowerCase()] || 0.3;
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
            content: `You are an advanced RPG Game Master analyzing journal entries for character progression.
                     Key Analysis Points:
                     1. Emotional Intelligence:
                        - Identify emotional patterns and self-awareness
                        - Track emotional growth and resilience
                        - Assess emotional impact on different stats
                     2. Achievement Recognition:
                        - Identify concrete accomplishments
                        - Measure progress towards goals
                        - Recognize small wins and milestone achievements
                     3. Skill Development:
                        - Track recurring activities and their impact on stats
                        - Identify emerging patterns of expertise
                        - Note skill synergies and combinations
                     4. Challenge Analysis:
                        - Assess difficulty of overcome obstacles
                        - Identify growth opportunities from setbacks
                        - Measure progressive challenge engagement
                     5. Relationship Dynamics:
                        - Track social interactions and their quality
                        - Identify relationship building patterns
                        - Assess leadership and influence moments
                     6. Personal Growth:
                        - Identify moments of insight and learning
                        - Track habit formation and consistency
                        - Measure progress in different life areas
                     
                     Return a detailed JSON analysis focusing on progressive stat development 
                     and meaningful character growth opportunities.`
          },
          {
            role: "user",
            content: `Analyze this journal entry with focus on progressive character development:
            
            ${content}`
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
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
            content: `You are an RPG Quest Master generating personalized quests based on journal analysis and character stats.
                     Create quests that provide an optimal challenge based on the character's current stats and growth areas.
                     Core RPG stats and their meanings:
                     - Strength: Physical power, athletic ability, physical challenges
                     - Dexterity: Agility, reflexes, coordination, fine motor skills
                     - Constitution: Health, endurance, vitality, resilience
                     - Intelligence: Learning, memory, reasoning, problem-solving
                     - Wisdom: Intuition, perception, judgment, emotional intelligence
                     - Charisma: Personality, leadership, social skills, influence

                     Quest Generation Rules:
                     1. Primary stat focus: Each quest should primarily challenge 1-2 core stats
                     2. Stat requirements: Set minimum stat requirements that are challenging but achievable
                     3. Growth balance: Mix quests between:
                        - Comfort zone (using high stats) for confidence building
                        - Growth areas (improving low stats) for progression
                        - Hybrid challenges that combine both
                     4. Scaling difficulty: Adjust based on the gap between required stats and current stats
                     5. Meaningful rewards: Stat rewards should be proportional to challenge and focused on used stats

                     Return a JSON formatted response with an array of quests, each containing:
                     {
                       "title": "Quest title",
                       "description": "Detailed quest description",
                       "primaryStats": ["stat1", "stat2"], // Main stats being challenged
                       "statRequirements": {
                         "stat": minValue,  // Minimum stats needed
                       },
                       "statRewards": {
                         "stat": rewardValue // Stat improvements on completion
                       },
                       "difficulty": 1-5,    // Based on stat requirements vs current stats
                       "category": "Physical/Mental/Social/Combined",
                       "xpReward": number    // Based on difficulty and stat challenges
                       "growthPotential": ["stat1", "stat2"] // Stats that can be improved
                     }`
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
        if (quest.statRewards) {
          Object.entries(quest.statRewards).forEach(([stat, value]) => {
            if (typeof value === 'number' && stat in quest.statRewards) {
              quest.statRewards![stat as keyof typeof quest.statRewards] = Math.max(1, Math.min(3, value));
            }
          });
        }
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
