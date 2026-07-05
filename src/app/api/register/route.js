import { NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { loadCompanies } from "../companies/route";

export const dynamic = "force-dynamic";

const UPLOAD_TEMP_IN   = path.join(process.cwd(), "ml", "register_temp_in.csv");
const UPLOAD_TEMP_OUT  = path.join(process.cwd(), "ml", "register_temp_out.csv");
const SCORED_OUT_PATH  = path.join(process.cwd(), "ml", "scored_leads.csv");
const MODEL_PKL_PATH   = path.join(process.cwd(), "ml", "best_model.pkl");
const WORKER_SCRIPT    = path.join(process.cwd(), "ml", "score_custom_leads.py");
const COMPANIES_PATH   = path.join(process.cwd(), "data", "companies.json");

function getAccessCode(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "") + "12";
}

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

function parseCSV(content) {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = [];
    let current = "";
    let inQuote  = false;
    for (const ch of line) {
      if (ch === '"')  { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { values.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    values.push(current.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const companyName = formData.get("companyName");
    const customCode  = formData.get("accessCode");
    const file        = formData.get("file");

    if (!companyName?.trim()) {
      return NextResponse.json({ error: "Company Name is required" }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
    }

    const accessCode = customCode?.trim() || getAccessCode(companyName);

    // 1. Process and preprocess CSV content in-memory
    const bytes = await file.arrayBuffer();
    const rawContent = Buffer.from(bytes).toString("utf-8");
    const rows = parseCSV(rawContent);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Uploaded CSV has no records" }, { status: 400 });
    }

    // Pre-fill missing fields dynamically
    const normalizedRows = rows.map((r, idx) => {
      return {
        lead_id:                  r.lead_id ?? String(idx),
        company_id:               r.company_id || `CMP-${Math.floor(1000 + Math.random() * 9000)}`,
        company_name:             companyName.trim(), // Force scoping to this company
        sales_person_id:          r.sales_person_id || "SP-01",
        assigned_sales_person:    r.assigned_sales_person || "Rahul Kumar",
        company_size:             r.company_size || "Mid",
        industry:                 r.industry || "SaaS",
        website_visits:           r.website_visits || "5",
        demo_requested:           r.demo_requested || "No",
        source:                   r.source || "Organic",
        response_time_hours:      r.response_time_hours || "12",
        days_since_last_contact:  r.days_since_last_contact || "10",
        converted:                r.converted || "0",
        conversion_probability:   r.conversion_probability || "0",
        top_3_contributing_factors: r.top_3_contributing_factors || ""
      };
    });

    // Write normalized CSV to temp file
    const headers = [
      "lead_id", "company_id", "company_name", "sales_person_id", "assigned_sales_person",
      "company_size", "industry", "website_visits", "demo_requested", "source",
      "response_time_hours", "days_since_last_contact", "converted",
      "conversion_probability", "top_3_contributing_factors"
    ];

    const headerLine = headers.join(",");
    const csvLines = normalizedRows.map((r) => {
      return headers.map((h) => {
        let val = String(r[h] ?? "");
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          val = `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(",");
    });

    fs.writeFileSync(UPLOAD_TEMP_IN, headerLine + "\n" + csvLines.join("\n"), "utf-8");

    // 2. Call Python script to score leads
    const platformCommand = process.platform === "win32"
      ? `set PYTHONIOENCODING=utf-8 && python "${WORKER_SCRIPT}" "${UPLOAD_TEMP_IN}" "${UPLOAD_TEMP_OUT}" "${MODEL_PKL_PATH}"`
      : `PYTHONIOENCODING=utf-8 python3 "${WORKER_SCRIPT}" "${UPLOAD_TEMP_IN}" "${UPLOAD_TEMP_OUT}" "${MODEL_PKL_PATH}"`;

    await runScoringWorker(platformCommand);

    // 3. Read scored output and assign sequential global lead_ids
    const scoredContent = fs.readFileSync(UPLOAD_TEMP_OUT, "utf-8");
    const scoredRows = parseCSV(scoredContent);

    let maxLeadId = 0;
    if (fs.existsSync(SCORED_OUT_PATH)) {
      const existing = parseCSV(fs.readFileSync(SCORED_OUT_PATH, "utf-8"));
      existing.forEach((el) => {
        const idNum = parseInt(el.lead_id, 10);
        if (!isNaN(idNum) && idNum > maxLeadId) {
          maxLeadId = idNum;
        }
      });
    }

    const reindexedRows = scoredRows.map((r, idx) => ({
      ...r,
      lead_id: String(maxLeadId + 1 + idx)
    }));

    // Append to master database
    const appendLines = reindexedRows.map((r) => {
      return headers.map((h) => {
        let val = String(r[h] ?? "");
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          val = `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(",");
    });

    if (fs.existsSync(SCORED_OUT_PATH)) {
      fs.appendFileSync(SCORED_OUT_PATH, "\n" + appendLines.join("\n"), "utf-8");
    } else {
      fs.writeFileSync(SCORED_OUT_PATH, headerLine + "\n" + appendLines.join("\n"), "utf-8");
    }

    // 4. Save company registration
    const list = loadCompanies();
    if (!list.some((c) => c.name.toLowerCase() === companyName.trim().toLowerCase())) {
      list.push({ name: companyName.trim(), accessCode });
      fs.writeFileSync(COMPANIES_PATH, JSON.stringify(list, null, 2), "utf-8");
    }

    // Clean up temp files
    try {
      if (fs.existsSync(UPLOAD_TEMP_IN)) fs.unlinkSync(UPLOAD_TEMP_IN);
      if (fs.existsSync(UPLOAD_TEMP_OUT)) fs.unlinkSync(UPLOAD_TEMP_OUT);
    } catch (_) {}

    return NextResponse.json({
      success: true,
      message: `Registered ${companyName} and added ${reindexedRows.length} scored leads successfully.`,
      companyName: companyName.trim(),
      accessCode
    });
  } catch (err) {
    console.error("[/api/register]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
