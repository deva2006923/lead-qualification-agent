/**
 * POST /api/agent
 * ================
 * Autonomous Sales Operations Agent — optimized for speed.
 *
 * FAST PATH (hot/warm leads): fires explain + recommend in parallel via Promise.all
 * COLD PATH: uses flag_urgent check then short-circuits to no_action_needed
 * EDGE CASES: falls back to full agent loop only if needed
 */

import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { embedText } from "@/lib/embeddings";
import { queryIndex } from "@/lib/pinecone";
import { explainLeadHelper } from "../explain-lead/route";
import { recommendActionHelper } from "../recommend-action/route";

export const dynamic = "force-dynamic";

// Define OpenAI-compatible tool schemas for the LLM
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "generate_explanation",
      description: "Generates a plain-English explanation for the sales representative about why this lead has its conversion score and priority.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_recommendation",
      description: "Queries the playbook knowledge base and generates the next best action plan and personalized email draft.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "flag_urgent",
      description: "Flags this lead as extremely urgent requiring immediate attention (best for hot leads with engagement spikes or high visits).",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Reason why this lead requires immediate, fast attention." }
        },
        required: ["reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description: "Searches the B2B playbook/FAQ documents database for specific info (e.g. competitor comparison, discount matrix, objections).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Specific topic or objection to search for." }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "no_action_needed",
      description: "Concludes that no immediate follow-up actions or email drafts are needed for this lead (best for cold, low-engagement leads).",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Muting explanation why this lead is skipped." }
        },
        required: ["reason"]
      }
    }
  }
];

export async function POST(request) {
  try {
    const body = await request.json();
    const { lead, salesPersonName } = body;

    if (!lead) {
      return NextResponse.json({ error: "lead is required" }, { status: 400 });
    }

    const companyName = lead.company_name ?? "this company";
    const probability = Number(lead.conversion_probability ?? 0);
    const scorePct = Math.round(probability * 100);
    const priority = lead.priority ?? (scorePct >= 70 ? "hot" : scorePct >= 40 ? "warm" : "cold");

    const agentState = {
      trace:          [],
      explanation:    null,
      recommendation: null,
      urgent:         { flagged: false, reason: "" },
      noAction:       { needed: false, reason: "" }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // FAST PATH — Hot or Warm leads
    // Fire explanation + recommendation in parallel. No multi-turn LLM loop.
    // This cuts time from ~20s sequential → ~4-6s parallel.
    // ─────────────────────────────────────────────────────────────────────────
    if (priority === "hot" || priority === "warm") {

      // Flag urgent if hot + engagement spike
      if (priority === "hot" && lead.engagement_spike) {
        const urgentReason = `${companyName} is a high-score lead (${scorePct}%) with an active engagement spike — unusually high website visits signal imminent purchase intent.`;
        agentState.urgent = { flagged: true, reason: urgentReason };
        agentState.trace.push({
          tool: "flag_urgent",
          args: { reason: urgentReason },
          result: `Urgency flagged for ${companyName}.`
        });
      }

      // Run explanation + recommendation in parallel
      const [expResult, recResult] = await Promise.all([
        explainLeadHelper(lead, probability, lead.top_3_contributing_factors).catch((e) => ({
          text: `Explanation unavailable: ${e.message}`, provider: "error"
        })),
        recommendActionHelper(lead, lead.industry, salesPersonName).catch((e) => ({
          action: `Recommendation unavailable: ${e.message}`,
          draftEmail: "",
          sources: [],
          contextFound: false,
          provider: "error"
        }))
      ]);

      agentState.explanation = expResult.text;
      agentState.recommendation = {
        action:       recResult.action,
        draftEmail:   recResult.draftEmail,
        sources:      recResult.sources ?? [],
        contextFound: recResult.contextFound
      };

      agentState.trace.push(
        { tool: "generate_explanation",   args: {}, result: `Explanation generated via ${expResult.provider ?? "llm"}.` },
        { tool: "generate_recommendation", args: {}, result: `Recommendation generated. Sources: [${(recResult.sources ?? []).join(", ")}]` }
      );

      return NextResponse.json({ success: true, ...agentState });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COLD PATH — Low-priority leads
    // Short-circuit immediately with a no_action_needed decision.
    // ─────────────────────────────────────────────────────────────────────────
    if (priority === "cold") {
      // Check if demo was requested despite low score — if so, still generate recommendation
      if (lead.demo_requested === "Yes") {
        const [expResult, recResult] = await Promise.all([
          explainLeadHelper(lead, probability, lead.top_3_contributing_factors).catch((e) => ({
            text: `Explanation unavailable: ${e.message}`, provider: "error"
          })),
          recommendActionHelper(lead, lead.industry, salesPersonName).catch((e) => ({
            action: `Recommendation unavailable: ${e.message}`,
            draftEmail: "",
            sources: [],
            contextFound: false
          }))
        ]);

        agentState.explanation = expResult.text;
        agentState.recommendation = {
          action:       recResult.action,
          draftEmail:   recResult.draftEmail,
          sources:      recResult.sources ?? [],
          contextFound: recResult.contextFound
        };

        agentState.trace.push(
          { tool: "generate_explanation",    args: {}, result: "Cold lead but demo was requested — explanation generated." },
          { tool: "generate_recommendation", args: {}, result: "Demo signal triggered recommendation despite cold score." }
        );

        return NextResponse.json({ success: true, ...agentState });
      }

      // Pure cold lead — no action needed
      const noActionReason = `${companyName} has a low conversion score (${scorePct}%), no demo request, and low engagement. Follow-up is not cost-effective at this time. Re-queue in 30 days or if engagement spikes.`;
      agentState.noAction = { needed: true, reason: noActionReason };
      agentState.trace.push({
        tool: "no_action_needed",
        args: { reason: noActionReason },
        result: `No action decision logged for ${companyName}.`
      });

      return NextResponse.json({ success: true, ...agentState });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FALLBACK — Full agentic loop (edge cases only)
    // ─────────────────────────────────────────────────────────────────────────
    const systemPrompt = `You are LeadIQ's Autonomous Sales Operations Agent. Analyze the sales lead and call appropriate tools.

Lead Profile:
- Company: "${companyName}"
- Industry: ${lead.industry ?? "B2B"}
- Size: ${lead.company_size ?? "Unknown"}
- Website Visits: ${lead.website_visits ?? 0}
- Demo Requested: ${lead.demo_requested ?? "No"}
- Response Time: ${lead.response_time_hours ?? 0} hours
- Days Since Contact: ${lead.days_since_last_contact ?? 99}
- Recent Engagement Spike: ${lead.engagement_spike ? "YES" : "NO"}
- ML Predicted Conversion: ${scorePct}% (${priority?.toUpperCase()} priority)
- Top Factors: ${lead.top_3_contributing_factors ?? ""}

Call the most appropriate tool(s) based on the lead's profile.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Evaluate lead #${lead.lead_id} (${companyName}) and invoke necessary tools.` }
    ];

    let loopLimit = 4;
    let keepRunning = true;

    while (keepRunning && loopLimit > 0) {
      loopLimit--;

      const { message } = await callLLM(messages, {
        temperature: 0.2,
        tools: AGENT_TOOLS,
        tool_choice: "auto"
      });

      if (!message || !message.tool_calls || message.tool_calls.length === 0) {
        keepRunning = false;
        if (message?.content) messages.push({ role: "assistant", content: message.content });
        break;
      }

      messages.push(message);

      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;
        const toolId   = toolCall.id;
        let toolArgs = {};
        try { toolArgs = JSON.parse(toolCall.function.arguments); } catch (_) {}
        let toolResult = "";

        if (toolName === "generate_explanation") {
          try {
            const expRes = await explainLeadHelper(lead, probability, lead.top_3_contributing_factors);
            agentState.explanation = expRes.text;
            toolResult = `Explanation generated.`;
          } catch (e) { toolResult = `Error: ${e.message}`; }
        } else if (toolName === "generate_recommendation") {
          try {
            const recRes = await recommendActionHelper(lead, lead.industry, salesPersonName);
            agentState.recommendation = { action: recRes.action, draftEmail: recRes.draftEmail, sources: recRes.sources ?? [], contextFound: recRes.contextFound };
            toolResult = `Recommendation generated.`;
          } catch (e) { toolResult = `Error: ${e.message}`; }
        } else if (toolName === "flag_urgent") {
          agentState.urgent = { flagged: true, reason: toolArgs.reason };
          toolResult = `Urgency flagged.`;
        } else if (toolName === "search_knowledge_base") {
          try {
            const vector = await embedText(toolArgs.query, "query");
            const matches = await queryIndex(vector, 3);
            const filtered = matches.filter((m) => m.score > 0.35);
            toolResult = filtered.length > 0
              ? `Found ${filtered.length} matching entries.`
              : `No matches for: "${toolArgs.query}"`;
          } catch (e) { toolResult = `Search error: ${e.message}`; }
        } else if (toolName === "no_action_needed") {
          agentState.noAction = { needed: true, reason: toolArgs.reason };
          toolResult = `No action decision logged.`;
          keepRunning = false;
        }

        agentState.trace.push({ tool: toolName, args: toolArgs, result: toolResult });
        messages.push({ role: "tool", tool_call_id: toolId, name: toolName, content: toolResult });
      }
    }

    return NextResponse.json({ success: true, ...agentState });
  } catch (err) {
    console.error("[/api/agent] orchestrator error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
