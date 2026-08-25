import { NextResponse } from "next/server";
import { embedText } from "@/lib/embeddings";
import { callLLM } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  const results = {};
  const apiKey = process.env.GEMINI_API_KEY;
  
  // Test 1: Keys
  results.env = {
    hasGeminiKey: !!apiKey,
    geminiKeyPrefix: apiKey ? apiKey.slice(0, 6) : "none",
  };

  if (!apiKey) {
    return NextResponse.json({ error: "No GEMINI_API_KEY set" });
  }

  // Test 2: Embeddings
  try {
    const vector = await embedText("test content", "query");
    results.embeddings = {
      success: true,
      length: vector.length,
    };
  } catch (err) {
    results.embeddings = {
      success: false,
      error: err.message,
    };
  }

  // Test 3: LLM
  try {
    const response = await callLLM([
      { role: "user", content: "Say 'Gemini is active' in 3 words" }
    ]);
    results.llm = {
      success: true,
      response: response.text,
      provider: response.provider,
    };
  } catch (err) {
    results.llm = {
      success: false,
      error: err.message,
    };
  }

  return NextResponse.json(results);
}
