/**
 * POST /api/explain-lead
 * =======================
 * Input:  { leadData, probability, factors }
 * Output: { explanation: string, provider: string }
 *
 * Generates a plain-English explanation of why a lead is high/low priority
 * using the LLM (NVIDIA NIM → Groq fallback).
 */

import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function explainLeadHelper(leadData, probability, factors) {
  const companyName = leadData.company_name ?? "this company";
  const pct      = Math.round((probability ?? 0) * 100);
  const priority = pct >= 70 ? "HIGH PRIORITY 🔥" : pct >= 40 ? "MEDIUM PRIORITY 📈" : "LOW PRIORITY ❄️";

  const factorList = factors
    ? factors.split("|").map((f) => f.trim()).filter(Boolean)
    : [];

  const engagementContext = leadData.engagement_spike
    ? `⚡ IMPORTANT: This lead has shown an unusual engagement spike — website visits (${leadData.website_visits}) are significantly above their historical average. This signals active buying intent.`
    : `Website visits: ${leadData.website_visits ?? 0} (no unusual spike detected).`;

  const messages = [
    {
      role: "system",
      content: `You are LeadIQ's senior sales intelligence analyst. You write detailed, business-focused explanations for sales reps — not generic summaries.

Your analysis must:
1. Start with a one-sentence VERDICT that names the company and states the priority clearly.
2. Explain EACH contributing factor below in plain business English — what it means, why it matters, and what it signals about buyer intent. Do NOT just repeat the label; explain it.
3. Comment on the engagement data (visits, demo request, response time, recency).
4. End with one specific, actionable instruction the rep should do TODAY.

Format your response exactly like this:
**VERDICT:** [one sentence naming ${companyName} and its priority]

**WHY:**
• [Factor 1 name]: [2 sentences explaining what this means for ${companyName}'s buying journey]
• [Factor 2 name]: [2 sentences explaining business implication]
• [Factor 3 name]: [2 sentences explaining business implication]

**ENGAGEMENT SIGNAL:** [1–2 sentences interpreting visits, demo status, response time, and days since contact]

**ACTION FOR TODAY:** [one sharp, specific instruction]`,
    },
    {
      role: "user",
      content: `Analyze this lead for a sales rep.

Company: ${companyName}
Industry: ${leadData.industry ?? "Unknown"}
Size: ${leadData.company_size ?? "Unknown"}
Source: ${leadData.source ?? "Unknown"}
Website Visits (7d): ${leadData.website_visits ?? 0}
Demo Requested: ${leadData.demo_requested ?? "No"}
Response Time: ${leadData.response_time_hours ?? "N/A"} hours
Days Since Last Contact: ${leadData.days_since_last_contact ?? "N/A"}

ML Score: ${pct}% → ${priority}
Top Contributing Factors: ${factorList.length > 0 ? factorList.join(" | ") : "None recorded"}

${engagementContext}

Write the full structured analysis now.`,
    },
  ];

  return await callLLM(messages, { temperature: 0.35, maxTokens: 400 });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { leadData, probability, factors } = body;

    if (!leadData) {
      return NextResponse.json({ error: "leadData is required" }, { status: 400 });
    }

    const { text, provider } = await explainLeadHelper(leadData, probability ?? leadData.conversion_probability, factors ?? leadData.top_3_contributing_factors);

    return NextResponse.json({ explanation: text, provider });
  } catch (err) {
    console.error("[/api/explain-lead]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
