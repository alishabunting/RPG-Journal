import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeEntry(content: string) {
  const prompt = `
    Analyze this journal entry and extract:
    1. Overall mood
    2. Key themes/tags
    3. Potential areas for personal growth

    Journal entry: ${content}
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 200,
  });

  const analysis = JSON.parse(response.choices[0].message.content || "{}");
  return {
    mood: analysis.mood,
    tags: analysis.tags,
    growthAreas: analysis.growthAreas,
  };
}

export async function generateQuests(analysis: any) {
  const prompt = `
    Based on this journal analysis, generate 3 RPG-style quests that would help with personal growth:
    Mood: ${analysis.mood}
    Tags: ${analysis.tags.join(", ")}
    Growth Areas: ${analysis.growthAreas.join(", ")}

    Format each quest as JSON with:
    - title
    - description
    - category (Personal/Professional/Social/Health)
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
    max_tokens: 300,
  });

  return JSON.parse(response.choices[0].message.content || "[]");
}
