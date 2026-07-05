/**
 * POST /api/recommend-action
 * ===========================
 * Input:  { leadProfile, industry }
 * Output: { action: string, draftEmail: string, sources: string[], provider: string }
 *
 * 1. Embeds the lead's profile via NVIDIA NIM
 * 2. Queries Pinecone for relevant KB chunks
 * 3. Generates a recommended action + draft email grounded in retrieved context
 */

import { NextResponse } from "next/server";
import { embedText }    from "@/lib/embeddings";
import { queryIndex }   from "@/lib/pinecone";
import { callLLM }      from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function recommendActionHelper(leadProfile, industry, salesPersonName) {
  const repName = salesPersonName || "Sales Representative";

  // ------------------------------------------------------------------
  // 1. Build an embedding query from the lead's profile
  // ------------------------------------------------------------------
  const queryText = [
    `Sales lead in ${industry ?? leadProfile.industry ?? "B2B"} industry.`,
    `Company size: ${leadProfile.company_size ?? "Unknown"}.`,
    `Source: ${leadProfile.source ?? "Unknown"}.`,
    `Demo requested: ${leadProfile.demo_requested ?? "No"}.`,
    `Website visits: ${leadProfile.website_visits ?? 0}.`,
    `Response time: ${leadProfile.response_time_hours ?? "N/A"} hours.`,
    `Days since last contact: ${leadProfile.days_since_last_contact ?? "N/A"}.`,
    `Conversion probability: ${Math.round((leadProfile.conversion_probability ?? 0) * 100)}%.`,
  ].join(" ");

  // ------------------------------------------------------------------
  // 2. Embed + query Pinecone
  // ------------------------------------------------------------------
  let context = "";
  let sources  = [];

  try {
    const vector  = await embedText(queryText, "query");
    const matches = await queryIndex(vector, 5);

    // Filter to reasonably relevant matches (score > 0.4)
    const relevant = matches.filter((m) => m.score > 0.4);

    if (relevant.length > 0) {
      context = relevant
        .map((m, i) => `[${i + 1}] (${m.source}): ${m.text}`)
        .join("\n\n");
      sources = [...new Set(relevant.map((m) => m.source))];
    }
  } catch (embedErr) {
    console.warn("[/api/recommend-action helper] Embedding/Pinecone error:", embedErr.message);
  }

  const noContext = !context;

  // ------------------------------------------------------------------
  // 3. Generate recommendation + draft email
  // ------------------------------------------------------------------
  const companyName = leadProfile.company_name ?? "this company";

  const leadSummary = [
    `Company Name: ${companyName}`,
    `Company Size: ${leadProfile.company_size ?? "Unknown"}`,
    `Industry: ${industry ?? leadProfile.industry ?? "Unknown"}`,
    `Source: ${leadProfile.source ?? "Unknown"}`,
    `Website Visits: ${leadProfile.website_visits ?? 0}`,
    `Demo Requested: ${leadProfile.demo_requested ?? "No"}`,
    `Response Time: ${leadProfile.response_time_hours ?? "N/A"} hours`,
    `Days Since Last Contact: ${leadProfile.days_since_last_contact ?? "N/A"}`,
    `Conversion Score: ${Math.round((leadProfile.conversion_probability ?? 0) * 100)}%`,
    `Top Factors: ${leadProfile.top_3_contributing_factors ?? "N/A"}`,
  ].join("\n");

  const contextSection = noContext
    ? "No relevant playbook or case study context was found in the knowledge base."
    : `Retrieved Context (use ONLY this — do not invent facts):\n${context}`;

  const messages = [
    {
      role: "system",
      content: `You are an expert B2B sales coach AI. Generate a recommended next action and a 
short draft follow-up email for a sales rep, grounded ONLY in the provided context.
Personalize the draft email and action plan specifically for the client company "${companyName}". 
Always sign the end of the draft email with the salesperson's real name: "${repName}".
Never use generic placeholders like "[Company Name]" or "[Your Name]".
If no relevant context is found, say so explicitly instead of inventing information.

Format your response as follows:
RECOMMENDED ACTION:
[1-2 sentence action the rep should take today]

DRAFT EMAIL:
Subject: [subject line]
---
[email body, max 120 words, professional and personalized, ending with the signature:
Best regards,
${repName}]`,
    },
    {
      role: "user",
      content: `Lead Profile:\n${leadSummary}\n\n${contextSection}`,
    },
  ];

  const { text, provider } = await callLLM(messages, { temperature: 0.5, maxTokens: 512 });

  // Parse the response into action + email sections
  let action     = text;
  let draftEmail = "";

  const emailMatch = text.match(/DRAFT EMAIL:\s*([\s\S]+)/i);
  const actionMatch = text.match(/RECOMMENDED ACTION:\s*([\s\S]+?)(?=DRAFT EMAIL:|$)/i);

  if (actionMatch) action     = actionMatch[1].trim();
  if (emailMatch)  draftEmail = emailMatch[1].trim();

  return {
    action,
    draftEmail,
    sources,
    provider,
    contextFound: !noContext,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { leadProfile, industry, salesPersonName } = body;

    if (!leadProfile) {
      return NextResponse.json({ error: "leadProfile is required" }, { status: 400 });
    }

    const result = await recommendActionHelper(leadProfile, industry ?? leadProfile.industry, salesPersonName);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/recommend-action]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
