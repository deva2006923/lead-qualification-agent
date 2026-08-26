/**
 * leadQuery.js — Structured Lead Data Query Helper
 * ==================================================
 * Detects natural-language filter queries against scored_leads.csv and
 * executes them directly on the parsed CSV rows, bypassing RAG/Pinecone.
 *
 * Supported filter patterns (auto-detected via regex):
 *   - conversion_probability threshold  (above/below/over/under/greater/less than X%)
 *   - website_visits threshold
 *   - days_since_last_contact threshold
 *   - industry equality  (e.g. "from Healthcare")
 *   - company_size equality  (Small / Mid / Large)
 *   - demo_requested  (yes/no)
 *   - lead source  (Referral, Organic, Paid, etc.)
 *   - assigned_sales_person contains
 */

import { loadScoredLeads } from "@/lib/leads";

/* ------------------------------------------------------------------ */
/* Intent Detection                                                      */
/* ------------------------------------------------------------------ */

const STRUCTURED_KEYWORDS = [
  /\blead\s?id[s]?\b/,
  /\bshow\s+(?:me\s+)?leads?\b/,
  /\blist\s+(?:all\s+)?leads?\b/,
  /\bgive\s+me\s+leads?\b/,
  /\bfind\s+leads?\b/,
  /\bfilter\s+leads?\b/,
  /\bwhich\s+leads?\b/,
  /\bleads?\s+(?:with|where|having|whose|that)\b/,
  /\bleads?\s+(?:from|in)\s+/,
  /\bleads?\s+above\b/,
  /\bleads?\s+below\b/,
  /\bconversion\s+(?:rate|probability)\b/,
];

/**
 * Returns true if the question looks like a structured filter query
 * rather than a general coaching / RAG question.
 * @param {string} question
 * @returns {boolean}
 */
export function isStructuredLeadQuery(question) {
  const lower = question.toLowerCase();
  return STRUCTURED_KEYWORDS.some((re) => re.test(lower));
}

/* ------------------------------------------------------------------ */
/* Filter Extraction                                                     */
/* ------------------------------------------------------------------ */

/**
 * Parse the question and return a list of filter specs.
 * Each spec: { field, op, value }
 *   op: "gt" | "gte" | "lt" | "lte" | "eq" | "contains"
 */
function extractFilters(question) {
  const lower = question.toLowerCase();
  const filters = [];

  /* ---------- conversion_probability / rate ---------- */
  const convAbove = lower.match(
    /(?:conversion|probability|rate)\s+(?:above|over|greater\s+than|more\s+than|at\s+least|>=?)\s*(\d+(?:\.\d+)?)\s*%?/
  );
  if (convAbove) {
    const raw = parseFloat(convAbove[1]);
    const val = raw > 1 ? raw / 100 : raw;
    filters.push({ field: "conversion_probability", op: "gt", value: val });
  }

  const convBelow = lower.match(
    /(?:conversion|probability|rate)\s+(?:below|under|less\s+than|at\s+most|<=?)\s*(\d+(?:\.\d+)?)\s*%?/
  );
  if (convBelow) {
    const raw = parseFloat(convBelow[1]);
    const val = raw > 1 ? raw / 100 : raw;
    filters.push({ field: "conversion_probability", op: "lt", value: val });
  }

  // Generic "above X%" without explicit "conversion" keyword (e.g. "lead IDs above 90%")
  if (filters.filter((f) => f.field === "conversion_probability").length === 0) {
    const genericAbove = lower.match(
      /(?:leads?\s+)?(?:above|over|greater\s+than|more\s+than|at\s+least|>=?)\s*(\d+(?:\.\d+)?)\s*%/
    );
    if (genericAbove) {
      const raw = parseFloat(genericAbove[1]);
      const val = raw > 1 ? raw / 100 : raw;
      filters.push({ field: "conversion_probability", op: "gt", value: val });
    }

    const genericBelow = lower.match(
      /(?:leads?\s+)?(?:below|under|less\s+than|at\s+most|<=?)\s*(\d+(?:\.\d+)?)\s*%/
    );
    if (genericBelow) {
      const raw = parseFloat(genericBelow[1]);
      const val = raw > 1 ? raw / 100 : raw;
      filters.push({ field: "conversion_probability", op: "lt", value: val });
    }
  }

  /* ---------- website_visits ---------- */
  const visitsAbove = lower.match(
    /(?:website\s+)?visits?\s+(?:above|over|greater\s+than|more\s+than|>=?)\s*(\d+)/
  );
  if (visitsAbove)
    filters.push({ field: "website_visits", op: "gt", value: parseInt(visitsAbove[1]) });

  const visitsBelow = lower.match(
    /(?:website\s+)?visits?\s+(?:below|under|less\s+than|<=?)\s*(\d+)/
  );
  if (visitsBelow)
    filters.push({ field: "website_visits", op: "lt", value: parseInt(visitsBelow[1]) });

  /* ---------- days_since_last_contact ---------- */
  const daysAbove = lower.match(
    /(?:days?\s+since\s+(?:last\s+)?contact|inactive)\s+(?:above|over|more\s+than|>=?)\s*(\d+)/
  );
  if (daysAbove)
    filters.push({ field: "days_since_last_contact", op: "gt", value: parseInt(daysAbove[1]) });

  const daysBelow = lower.match(
    /(?:days?\s+since\s+(?:last\s+)?contact)\s+(?:below|under|less\s+than|<=?)\s*(\d+)/
  );
  if (daysBelow)
    filters.push({ field: "days_since_last_contact", op: "lt", value: parseInt(daysBelow[1]) });

  /* ---------- industry ---------- */
  const industries = [
    "retail", "manufacturing", "healthcare", "finance", "technology",
    "education", "logistics", "real estate", "consulting", "insurance",
    "hospitality", "media", "energy", "construction", "pharma",
  ];
  for (const ind of industries) {
    if (lower.includes(ind)) {
      filters.push({
        field: "industry",
        op: "eq",
        value: ind.charAt(0).toUpperCase() + ind.slice(1),
      });
      break;
    }
  }

  /* ---------- company_size ---------- */
  if (/\bsmall\b/.test(lower))
    filters.push({ field: "company_size", op: "eq", value: "Small" });
  else if (/\bmid(?:[-\s]?size[d]?)?\b/.test(lower))
    filters.push({ field: "company_size", op: "eq", value: "Mid" });
  else if (/\blarge\b/.test(lower))
    filters.push({ field: "company_size", op: "eq", value: "Large" });

  /* ---------- demo_requested ---------- */
  if (/\bdemo\s+(?:was\s+)?requested\b|\bdemoed\b|\brequested\s+(?:a\s+)?demo\b/.test(lower))
    filters.push({ field: "demo_requested", op: "eq", value: "Yes" });
  else if (/\bno\s+demo\b|\bdemo\s+not\s+requested\b/.test(lower))
    filters.push({ field: "demo_requested", op: "eq", value: "No" });

  /* ---------- source ---------- */
  const sources = ["referral", "organic", "paid", "social", "cold call", "event", "partner"];
  for (const src of sources) {
    if (lower.includes(src)) {
      filters.push({
        field: "source",
        op: "eq",
        value: src.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      });
      break;
    }
  }

  /* ---------- converted ---------- */
  if (/\b(?:already\s+)?converted\b/.test(lower) && !/\bconversion\s+(?:rate|probability)\b/.test(lower))
    filters.push({ field: "converted", op: "eq", value: 1 });
  else if (/\bnot\s+(?:yet\s+)?converted\b/.test(lower))
    filters.push({ field: "converted", op: "eq", value: 0 });

  return filters;
}

/* ------------------------------------------------------------------ */
/* Filter Application                                                    */
/* ------------------------------------------------------------------ */

function applyFilter(row, { field, op, value }) {
  const rv = row[field];
  const numericFields = [
    "conversion_probability", "website_visits", "days_since_last_contact",
    "response_time_hours", "converted",
  ];

  if (numericFields.includes(field)) {
    const n = parseFloat(rv);
    if (isNaN(n)) return false;
    if (op === "gt")  return n >  value;
    if (op === "gte") return n >= value;
    if (op === "lt")  return n <  value;
    if (op === "lte") return n <= value;
    if (op === "eq")  return n === value;
  } else {
    const s = String(rv ?? "").toLowerCase();
    if (op === "eq")       return s === String(value).toLowerCase();
    if (op === "contains") return s.includes(String(value).toLowerCase());
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Public API                                                            */
/* ------------------------------------------------------------------ */

const MAX_IDS_IN_PROMPT = 50; // keep the context block manageable

/**
 * Run a structured query against scored_leads.csv and return a data
 * block for inclusion in the LLM prompt.
 *
 * @param {string} question
 * @returns {{ found: boolean, count: number, dataBlock: string, filters: object[] }}
 */
export function queryLeads(question) {
  const filters = extractFilters(question);
  const allLeads = loadScoredLeads();

  if (allLeads.length === 0) {
    return {
      found: false,
      count: 0,
      dataBlock: "scored_leads.csv is empty or not found. Run `python ml/generate_and_train.py` first.",
      filters,
    };
  }

  // Apply all extracted filters (AND logic)
  const matched =
    filters.length > 0
      ? allLeads.filter((row) => filters.every((f) => applyFilter(row, f)))
      : allLeads;

  const count = matched.length;

  if (count === 0) {
    const filterDesc = filters
      .map((f) => `${f.field} ${f.op} ${f.value}`)
      .join(", ");
    return {
      found: false,
      count: 0,
      dataBlock: `No leads matched the filter criteria: ${filterDesc || "none"}.`,
      filters,
    };
  }

  // Build a compact table for the LLM
  const displayRows = matched.slice(0, MAX_IDS_IN_PROMPT);
  const table = displayRows
    .map(
      (r) =>
        `Lead ${r.lead_id} | ${r.company_name} | ${r.industry} | ${r.company_size} | ` +
        `Prob: ${(parseFloat(r.conversion_probability) * 100).toFixed(1)}% | ` +
        `Demo: ${r.demo_requested} | Source: ${r.source}`
    )
    .join("\n");

  const filterDesc =
    filters.length > 0
      ? filters
          .map((f) => {
            const displayVal = f.field === "conversion_probability"
              ? `${(f.value * 100).toFixed(0)}%`
              : f.value;
            const opLabel =
              { gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=", contains: "contains" }[f.op] ?? f.op;
            return `${f.field} ${opLabel} ${displayVal}`;
          })
          .join(" AND ")
      : "all leads";

  const truncationNote =
    count > MAX_IDS_IN_PROMPT
      ? `\n(Showing first ${MAX_IDS_IN_PROMPT} of ${count} matching leads.)`
      : "";

  const dataBlock =
    `STRUCTURED QUERY RESULTS — Filter: ${filterDesc}\n` +
    `Total matching leads: ${count}\n\n` +
    `Lead ID | Company | Industry | Size | Conv. Probability | Demo Requested | Source\n` +
    `${"─".repeat(80)}\n` +
    `${table}${truncationNote}`;

  return { found: true, count, dataBlock, filters };
}
