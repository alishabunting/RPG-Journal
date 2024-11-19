import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testOpenAI() {
  try {
    console.log("Testing OpenAI connection...");
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a JSON response generator. Return a JSON response with connection status."
        },
        {
          role: "user",
          content: "Test connection. Return a JSON response with the following format: { \"status\": \"ok\", \"message\": \"Connection successful\" }"
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const responseContent = response.choices[0].message.content;
    console.log("OpenAI test response:", responseContent);
    return true;
  } catch (error) {
    console.error("OpenAI test failed:", error);
    return false;
  }
}

// Run test
testOpenAI().then(success => {
  if (success) {
    console.log("OpenAI connection test passed!");
  } else {
    console.error("OpenAI connection test failed!");
  }
}).catch(console.error);
