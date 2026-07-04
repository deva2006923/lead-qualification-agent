/**
 * Leads Utility — server-side CSV reader
 * ========================================
 * Reads scored_leads.csv from the ml/ directory and returns parsed rows.
 * Used by /api/leads route (server component only).
 */

import fs   from "fs";
import path from "path";

const CSV_PATH = path.join(process.cwd(), "ml", "scored_leads.csv");

/**
 * Parse a minimal CSV (no external dependency needed server-side).
 * Returns array of objects with headers as keys.
 */
function parseCSV(content) {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    // Handle quoted commas
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

/**
 * Load all scored leads.
 * @returns {Array<object>} Parsed lead objects
 */
export function loadScoredLeads() {
  if (!fs.existsSync(CSV_PATH)) {
    return [];
  }
  const content = fs.readFileSync(CSV_PATH, "utf-8");
  const rows    = parseCSV(content);

  // Coerce numeric fields
  return rows.map((r) => ({
    ...r,
    lead_id:                  String(r.lead_id ?? ""),
    website_visits:           Number(r.website_visits ?? 0),
    response_time_hours:      Number(r.response_time_hours ?? 0),
    days_since_last_contact:  Number(r.days_since_last_contact ?? 0),
    converted:                Number(r.converted ?? 0),
    conversion_probability:   Number(r.conversion_probability ?? 0),
  }));
}
