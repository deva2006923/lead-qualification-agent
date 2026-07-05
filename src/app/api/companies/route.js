import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { loadScoredLeads } from "@/lib/leads";

export const dynamic = "force-dynamic";

const COMPANIES_PATH = path.join(process.cwd(), "data", "companies.json");

function getAccessCode(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "") + "12";
}

export function loadCompanies() {
  if (fs.existsSync(COMPANIES_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(COMPANIES_PATH, "utf-8"));
    } catch (_) {}
  }

  // Populate default list from scored leads + prompt samples
  const leads = loadScoredLeads();
  const distinct = new Set(leads.map((l) => l.company_name).filter(Boolean));
  
  // Add prompt samples
  distinct.add("Hernandez Ltd");
  distinct.add("Diaz-Frederick");
  distinct.add("CloudNine SaaS");

  const defaultList = Array.from(distinct).map((name) => ({
    name,
    accessCode: getAccessCode(name)
  }));

  // Save to disk
  if (!fs.existsSync(path.dirname(COMPANIES_PATH))) {
    fs.mkdirSync(path.dirname(COMPANIES_PATH), { recursive: true });
  }
  fs.writeFileSync(COMPANIES_PATH, JSON.stringify(defaultList, null, 2), "utf-8");
  return defaultList;
}

export async function GET() {
  try {
    const list = loadCompanies();
    // Return only names for the login step (hide code in front-end list)
    const clientList = list.map((c) => ({ name: c.name }));
    return NextResponse.json({ success: true, companies: clientList });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
