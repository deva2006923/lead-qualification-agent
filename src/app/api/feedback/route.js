/**
 * POST /api/feedback
 * ===================
 * Input:  { leadId: string, outcome: "Converted" | "Not Converted" }
 * Output: { success: true, total: number }
 *
 * Appends feedback to data/feedback.csv for future model retraining.
 */

import { NextResponse } from "next/server";
import fs   from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const FEEDBACK_PATH = path.join(process.cwd(), "data", "feedback.csv");
const HEADER = "lead_id,outcome,timestamp\n";

function ensureFeedbackFile() {
  const dir = path.dirname(FEEDBACK_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FEEDBACK_PATH)) fs.writeFileSync(FEEDBACK_PATH, HEADER, "utf-8");
}

function countFeedbackRows() {
  if (!fs.existsSync(FEEDBACK_PATH)) return 0;
  const content = fs.readFileSync(FEEDBACK_PATH, "utf-8");
  return content.trim().split("\n").length - 1; // subtract header
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { leadId, outcome } = body;

    if (!leadId || !outcome) {
      return NextResponse.json(
        { error: "leadId and outcome are required" },
        { status: 400 }
      );
    }

    const validOutcomes = ["Converted", "Not Converted"];
    if (!validOutcomes.includes(outcome)) {
      return NextResponse.json(
        { error: `outcome must be one of: ${validOutcomes.join(", ")}` },
        { status: 400 }
      );
    }

    ensureFeedbackFile();

    const timestamp = new Date().toISOString();
    const row = `"${leadId}","${outcome}","${timestamp}"\n`;

    fs.appendFileSync(FEEDBACK_PATH, row, "utf-8");

    const total = countFeedbackRows();

    return NextResponse.json({
      success:  true,
      leadId,
      outcome,
      timestamp,
      total,
      message: `Feedback recorded. Total feedback entries: ${total}`,
    });
  } catch (err) {
    console.error("[/api/feedback]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** GET /api/feedback — returns all feedback as JSON */
export async function GET() {
  try {
    if (!fs.existsSync(FEEDBACK_PATH)) {
      return NextResponse.json({ feedback: [], total: 0 });
    }

    const content = fs.readFileSync(FEEDBACK_PATH, "utf-8");
    const lines = content.trim().split("\n").slice(1); // skip header
    const feedback = lines
      .filter(Boolean)
      .map((line) => {
        const parts = line.replace(/"/g, "").split(",");
        return { leadId: parts[0], outcome: parts[1], timestamp: parts[2] };
      });

    return NextResponse.json({ feedback, total: feedback.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
