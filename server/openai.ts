import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeEntry(content: string) {
  const prompt = `
    Analyze this journal entry and provide a response in the following JSON format:
    {
      "mood": "string describing the overall mood",
      "tags": ["array", "of", "relevant", "tags"],
      "growthAreas": ["array", "of", "growth", "opportunities"]
    }

    Journal entry: ${content}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an AI that analyzes journal entries and provides structured feedback for personal growth in a gaming context."
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

    const analysis = JSON.parse(response.choices[0].message.content || "{}");
    return {
      mood: analysis.mood || "neutral",
      tags: analysis.tags || [],
      growthAreas: analysis.growthAreas || []
    };
  } catch (error) {
    console.error("Error analyzing journal entry:", error);
    return {
      mood: "neutral",
      tags: [],
      growthAreas: []
    };
  }
}

export async function generateQuests(analysis: any) {
  const prompt = `
    Generate 3 RPG-style quests based on this journal analysis. Provide the response in the following JSON format:
    [
      {
        "title": "quest title",
        "description": "detailed quest description",
        "category": "one of: Personal/Professional/Social/Health"
      }
    ]

    Context:
    - Mood: ${analysis.mood}
    - Tags: ${analysis.tags.join(", ")}
    - Growth Areas: ${analysis.growthAreas.join(", ")}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a quest master that creates engaging personal development challenges in an RPG style."
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      temperature: 0.8,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const quests = JSON.parse(response.choices[0].message.content || "[]");
    return Array.isArray(quests) ? quests : [];
  } catch (error) {
    console.error("Error generating quests:", error);
    return [];
  }
}
