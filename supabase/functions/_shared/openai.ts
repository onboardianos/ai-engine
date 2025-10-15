import OpenAI from "npm:openai@4.56.0";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is missing in Edge Function secrets.");
}

export const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
export const isOpenAIConfigured = !!OPENAI_API_KEY;

