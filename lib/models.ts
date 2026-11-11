import { createGroq } from "@ai-sdk/groq";
import { config } from "./config";

const groq = createGroq({
  apiKey: config.GROQ_API_KEY,
});

export const models = Object.freeze({
  chat: groq(config.CHAT_MODEL),
  fast: groq(config.FAST_MODEL),
});
