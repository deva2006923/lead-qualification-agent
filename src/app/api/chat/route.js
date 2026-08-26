/**
 * POST /api/chat
 * ==============
 * Input:  { question: string, history?: [{role, content}] }
 * Output: { answer: string, sources: string[], provider: string, queryType: string }
 *
 * Dual-path chat assistant:
 *
 * PATH A — Structured Data Query (e.g. "which lead IDs have conversion rate above 90%")
 *   1. Detect query intent via isStructuredLeadQuery()
 *   2. Run queryLeads() to filter scored_leads.csv
 *   3. Pass the filtered data table + user question to Gemini for natural-language articulation
 *
 * PATH B — RAG / Playbook Coaching (everything else)
 *   1. Embed question via Gemini embedding API
 *   2. Query Pinecone for relevant KB chunks
 *   3. Build grounded prompt and generate answer via Gemini
 */

import { NextResponse }            from "next/server";
import { embedText }               from "@/lib/embeddings";
import { queryIndex }              from "@/lib/pinecone";
import { callLLM }                 from "@/lib/llm";
import { isStructuredLeadQuery, queryLeads } from "@/lib/leadQuery";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const { question, history = [], companyName, companyId } = body;

    if (!question?.trim()) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const repContext = companyName && companyId
      ? `You are speaking to a representative from ${companyName} (Company ID: ${companyId}).`
      : "You are speaking to a sales representative.";

    // ----------------------------------------------------------------
    // PATH A: Structured Lead Data Query
    // ----------------------------------------------------------------
    if (isStructuredLeadQuery(question)) {
      const { found, count, dataBlock } = queryLeads(question);

      const systemPrompt = found
        ? `You are a data-aware AI sales assistant. ${repContext}
The user has asked a question that requires querying the leads dataset.
Below is the EXACT data result from the system — this is real data, not hypothetical.

${dataBlock}

Using ONLY the data above, answer the user's question clearly and concisely.
- List the lead IDs explicitly (e.g. "Lead 5, Lead 42, Lead 107…").
- State the total count.
- If there are more than 20 results, summarize the key patterns (top industries, average probability, etc.) and list the first 20 IDs.
- Do NOT say "That's a great question" or add filler. Go straight to the answer.`
        : `You are a data-aware AI sales assistant. ${repContext}
The user asked a data query but no leads matched the criteria.

${dataBlock}

Tell the user clearly that no leads matched, and suggest they try a broader filter (e.g., lower the threshold or remove one condition).`;

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user",   content: question },
      ];

      const { text, provider } = await callLLM(messages, { temperature: 0.2, maxTokens: 1500 });

      return NextResponse.json({
        answer:    text,
        sources:   [],
        provider,
        queryType: "structured_data",
        count:     found ? count : 0,
      });
    }

    // ----------------------------------------------------------------
    // PATH B: RAG / Playbook Coaching
    // ----------------------------------------------------------------
    let context      = "";
    let sources      = [];
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

    const systemPrompt = contextFound
      ? `You are a knowledgeable AI sales assistant for a B2B SaaS company.
${repContext}
Answer questions about our product, pricing, competitors, and case studies using ONLY the provided context.
If the context doesn't contain the answer, fall back to your general B2B sales coaching knowledge and clearly note it is general advice.
Always cite the source document name when you use information from it (e.g., "According to our pricing guide…").
Keep answers clear, professional, and complete — do not truncate.

Context from knowledge base:
${context}`
      : `You are a knowledgeable AI sales assistant. ${repContext}
No relevant playbook context was found for this query. Answer using your general B2B sales coaching knowledge and best practices.
Give helpful, professional, and practical advice. Keep answers complete — do not truncate.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: question },
    ];

    const { text, provider } = await callLLM(messages, { temperature: 0.35, maxTokens: 1500 });

    return NextResponse.json({
      answer:    text,
      sources,
      provider,
      queryType: "rag",
      contextFound,
    });
  } catch (err) {
    console.error("[/api/chat]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

