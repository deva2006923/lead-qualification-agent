/**
 * POST /api/chat
 * ==============
 * Input:  { question: string, history?: [{role, content}] }
 * Output: { answer: string, sources: string[], provider: string }
 *
 * General-purpose RAG chatbot for sales reps:
 * 1. Embed the question via NVIDIA NIM
 * 2. Query Pinecone for relevant KB chunks
 * 3. Build grounded prompt and generate answer
 * 4. Return answer + source document names
 */

import { NextResponse } from "next/server";
import { embedText }    from "@/lib/embeddings";
import { queryIndex }   from "@/lib/pinecone";
import { callLLM }      from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const { question, history = [], companyName, companyId } = body;

    if (!question?.trim()) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const repContext = companyName && companyId
      ? `You are speaking to a representative from ${companyName} (Company ID: ${companyId}). Tailor your answers to help their organization leverage our software features and close customer queries.`
      : "You are speaking to a customer representative.";

    // ------------------------------------------------------------------
    // 1. Embed the question and retrieve relevant context
    // ------------------------------------------------------------------
    let context = "";
    let sources  = [];
    let contextFound = false;

    try {
      const vector  = await embedText(question, "query");
      const matches = await queryIndex(vector, 5);
      const relevant = matches.filter((m) => m.score > 0.35);

      if (relevant.length > 0) {
        context = relevant
          .map((m, i) => `[${i + 1}] Source: ${m.source}\n${m.text}`)
          .join("\n\n---\n\n");
        sources = [...new Set(relevant.map((m) => m.source))];
        contextFound = true;
      }
    } catch (embedErr) {
      console.warn("[/api/chat] Embedding/Pinecone error:", embedErr.message);
    }

    // ------------------------------------------------------------------
    // 2. Build grounded prompt
    // ------------------------------------------------------------------
    const systemPrompt = contextFound
      ? `You are a knowledgeable AI sales assistant for a B2B SaaS company. 
${repContext}
Answer questions about our product, pricing, competitors, and case studies using ONLY the provided context.
If the context doesn't contain the answer, fall back to your general B2B sales coaching knowledge to answer the question helpfully while mentioning it is general advice.
Always cite the source document name when you use information from it (e.g., "According to our pricing guide...").
Keep answers clear, concise, and under 200 words.

Context from knowledge base:
${context}`
      : `You are a knowledgeable AI sales assistant. ${repContext}
The specific playbook did not return matches for this query. Answer the user's question using your general B2B sales coaching knowledge and best practices. Give helpful, professional, and practical advice to the sales representative.`;

    // ------------------------------------------------------------------
    // 3. Build messages with optional conversation history
    // ------------------------------------------------------------------
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })), // last 3 exchanges
      { role: "user", content: question },
    ];

    const { text, provider } = await callLLM(messages, { temperature: 0.35, maxTokens: 512 });

    return NextResponse.json({
      answer:       text,
      sources,
      provider,
      contextFound,
    });
  } catch (err) {
    console.error("[/api/chat]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
