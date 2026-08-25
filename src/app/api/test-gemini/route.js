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

  // Test 2: List Models
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!resp.ok) {
      throw new Error(`Status ${resp.status}: ${await resp.text()}`);
    }
    const data = await resp.json();
    results.models = data.models.map((m) => ({
      name: m.name,
      displayName: m.displayName,
      supportedGenerationMethods: m.supportedGenerationMethods,
    }));
  } catch (err) {
    results.models = { error: err.message };
  }

  return NextResponse.json(results);
}
