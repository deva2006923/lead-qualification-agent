/**
 * GET /api/leads
 * ==============
 * Returns all scored leads from ml/scored_leads.csv as JSON.
 * Supports ?sort=conversion_probability&order=desc&page=1&limit=50
 */

import { NextResponse } from "next/server";
import { loadScoredLeads } from "@/lib/leads";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sort    = searchParams.get("sort")  || "conversion_probability";
    const order   = searchParams.get("order") || "desc";
    const page    = parseInt(searchParams.get("page")  || "1",  10);
    const limit   = parseInt(searchParams.get("limit") || "50", 10);
    const search  = searchParams.get("search") || "";
    const filter  = searchParams.get("filter") || "";  // hot|warm|cold
    const companyName = searchParams.get("company_name") || "";

    if (!companyName) {
      return NextResponse.json(
        { error: "unauthorized", message: "Company Name is required to view assigned leads." },
        { status: 401 }
      );
    }

    let leads = loadScoredLeads();

    if (!leads.length) {
      return NextResponse.json(
        {
          error:   "no_data",
          message: "scored_leads.csv not found. Run `python ml/generate_and_train.py` first.",
        },
        { status: 404 }
      );
    }

    // Enforce company scoping: filter leads to only show this company's records
    leads = leads.filter(
      (l) => l.company_name?.toLowerCase() === companyName.trim().toLowerCase()
    );

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      leads = leads.filter(
        (l) =>
          l.industry?.toLowerCase().includes(q) ||
          l.company_size?.toLowerCase().includes(q) ||
          l.source?.toLowerCase().includes(q) ||
          l.company_name?.toLowerCase().includes(q) ||
          l.lead_id?.includes(q)
      );
    }

    // Priority filter
    if (filter) {
      leads = leads.filter((l) => {
        const p = l.conversion_probability;
        if (filter === "hot")  return p >= 0.7;
        if (filter === "warm") return p >= 0.4 && p < 0.7;
        if (filter === "cold") return p < 0.4;
        return true;
      });
    }

    // Sort
    leads.sort((a, b) => {
      const av = Number(a[sort] ?? 0);
      const bv = Number(b[sort] ?? 0);
      return order === "asc" ? av - bv : bv - av;
    });

    // Pagination
    const total = leads.length;
    const start = (page - 1) * limit;
    const paged = leads.slice(start, start + limit);

    // Annotate each lead with priority + spike flag
    const annotated = paged.map((l) => {
      // Treat website_visits as visits in the last 7 days,
      // and calculate a deterministic prior average (e.g. between 3 and 8)
      const leadIdNum = parseInt(l.lead_id, 10) || 0;
      const priorAverage = (leadIdNum % 6) + 3;
      const isSpike = l.website_visits > priorAverage * 1.8;

      return {
        ...l,
        priority:         getPriority(l.conversion_probability),
        engagement_spike: isSpike,
      };
    });

    return NextResponse.json({
      leads:      annotated,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[/api/leads]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function getPriority(prob) {
  if (prob >= 0.7) return "hot";
  if (prob >= 0.4) return "warm";
  return "cold";
}
