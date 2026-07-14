import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Explicitly initialize the provider using the environment key
export const googleProvider = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY,
});
