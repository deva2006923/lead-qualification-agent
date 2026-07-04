import { NextResponse } from "next/server";
import { loadCompanies } from "../../companies/route";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const { companyName, accessCode } = body;

    if (!companyName?.trim() || !accessCode?.trim()) {
      return NextResponse.json({ error: "Company Name and Access Code are required" }, { status: 400 });
    }

    const list = loadCompanies();
    const company = list.find(
      (c) => c.name.toLowerCase() === companyName.trim().toLowerCase()
    );

    if (!company || company.accessCode !== accessCode.trim()) {
      return NextResponse.json({ error: "Incorrect access code" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      companyName: company.name,
      companyId: company.name.toLowerCase().replace(/[^a-z0-9]/g, "")
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
