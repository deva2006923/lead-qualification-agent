/**
 * POST /api/admin/upload
 * ======================
 * Accepts a custom sales leads CSV file, validates it, and runs the
 * on-the-fly Python scoring worker to overwrite ml/scored_leads.csv.
 */

import { NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const UPLOAD_TEMP_PATH = path.join(process.cwd(), "ml", "uploaded_temp.csv");
const SCORED_OUT_PATH  = path.join(process.cwd(), "ml", "scored_leads.csv");
const MODEL_PKL_PATH   = path.join(process.cwd(), "ml", "best_model.pkl");
const WORKER_SCRIPT    = path.join(process.cwd(), "ml", "score_custom_leads.py");

/** Promisify exec */
function runScoringWorker(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Failed to parse worker output: ${stdout}`));
      }
    });
  });
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file was uploaded" }, { status: 400 });
    }

    // Convert file to buffer and write to temp CSV
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    fs.writeFileSync(UPLOAD_TEMP_PATH, buffer);

    // 1. Basic validation of headers before running python
    const fileContent = fs.readFileSync(UPLOAD_TEMP_PATH, "utf-8");
    const firstLine = fileContent.trim().split("\n")[0] || "";
    const headers = firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

    const requiredCols = [
      "company_id", "company_name", "industry", "company_size", 
      "website_visits", "demo_requested", "source", 
      "response_time_hours", "days_since_last_contact", "sales_person_id"
    ];

    const missing = requiredCols.filter((col) => !headers.includes(col));
    if (missing.length > 0) {
      if (fs.existsSync(UPLOAD_TEMP_PATH)) fs.unlinkSync(UPLOAD_TEMP_PATH);
      return NextResponse.json(
        { error: `Missing required columns: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // 2. Execute Python scoring script
    // Force UTF-8 environment for Python to avoid encoding crashes on Windows
    const pythonCmd = `set PYTHONIOENCODING=utf-8 && python "${WORKER_SCRIPT}" "${UPLOAD_TEMP_PATH}" "${SCORED_OUT_PATH}" "${MODEL_PKL_PATH}"`;

    try {
      const result = await runScoringWorker(pythonCmd);
      
      // Clean up temp file
      if (fs.existsSync(UPLOAD_TEMP_PATH)) fs.unlinkSync(UPLOAD_TEMP_PATH);

      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        count:   result.count,
        message: `Successfully uploaded and scored ${result.count} leads.`,
      });
    } catch (workerErr) {
      if (fs.existsSync(UPLOAD_TEMP_PATH)) fs.unlinkSync(UPLOAD_TEMP_PATH);
      console.error("[Worker Error]", workerErr);
      return NextResponse.json({ error: workerErr.message }, { status: 500 });
    }
  } catch (err) {
    console.error("[/api/admin/upload]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
