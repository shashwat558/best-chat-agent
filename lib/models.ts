import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { config } from "./config";

const google = createGoogle({
  apiKey: config.GEMINI_API_KEY,
});

const groq = createGroq({
  apiKey: config.GROQ_API_KEY,
});

export const models = Object.freeze({
  chat: google(config.CHAT_MODEL),
  fast: groq(config.FAST_MODEL),
});
