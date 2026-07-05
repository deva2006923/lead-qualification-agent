import os
import re
import json
import math
import random
import asyncio
import pandas as pd
from io import StringIO
from fastapi import FastAPI, HTTPException, UploadFile, Form, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .llm import call_llm
from .embeddings import embed_text
from .pinecone_db import query_index

app = FastAPI(title="LeadIQ Python Backend", version="1.0.0")

# Enable CORS for frontend flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COMPANIES_PATH = os.path.join("data", "companies.json")
SCORED_LEADS_PATH = os.path.join("ml", "scored_leads.csv")
FEEDBACK_PATH = os.path.join("data", "feedback.csv")
FEEDBACK_HEADER = "lead_id,outcome,timestamp\n"

# Helper for access code generation
def get_access_code(name: str) -> str:
    cleaned = re.sub(r'[^a-z0-9]', '', name.lower())
    return cleaned + "12"

# Helper to load and initialize companies
def load_companies():
    if os.path.exists(COMPANIES_PATH):
        try:
            with open(COMPANIES_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
            
    # Default list from scored leads
    distinct = set()
    if os.path.exists(SCORED_LEADS_PATH):
        try:
            df = pd.read_csv(SCORED_LEADS_PATH)
            if "company_name" in df.columns:
                distinct.update(df["company_name"].dropna().unique())
        except Exception as e:
            print("Failed to read scored_leads.csv for companies:", e)
            
    distinct.add("Hernandez Ltd")
    distinct.add("Diaz-Frederick")
    distinct.add("CloudNine SaaS")
    
    default_list = [{"name": name, "accessCode": get_access_code(name)} for name in distinct]
    
    os.makedirs(os.path.dirname(COMPANIES_PATH), exist_ok=True)
    with open(COMPANIES_PATH, "w", encoding="utf-8") as f:
        json.dump(default_list, f, indent=2)
    return default_list

def ensure_feedback_file():
    os.makedirs(os.path.dirname(FEEDBACK_PATH), exist_ok=True)
    if not os.path.exists(FEEDBACK_PATH):
        with open(FEEDBACK_PATH, "w", encoding="utf-8") as f:
            f.write(FEEDBACK_HEADER)

# =====================================================================
# API Endpoints
# =====================================================================

@app.get("/api/companies")
async def get_companies():
    try:
        companies_list = load_companies()
        # Return only names for the login step (hide code in front-end list)
        client_list = [{"name": c["name"]} for c in companies_list]
        return {"success": True, "companies": client_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class LoginPayload(BaseModel):
    companyName: str
    accessCode: str

@app.post("/api/auth/login")
async def post_login(payload: LoginPayload):
    company_name = payload.companyName.strip()
    access_code = payload.accessCode.strip()
    
    if not company_name or not access_code:
        raise HTTPException(status_code=400, detail="Company Name and Access Code are required")
        
    companies_list = load_companies()
    company = next((c for c in companies_list if c["name"].lower() == company_name.lower()), None)
    
    if not company or company["accessCode"] != access_code:
        raise HTTPException(status_code=401, detail="Incorrect access code")
        
    return {
        "success": True,
        "companyName": company["name"],
        "companyId": re.sub(r'[^a-z0-9]', '', company["name"].lower())
    }

@app.get("/api/leads")
async def get_leads(
    company_name: str,
    sort: str = "conversion_probability",
    order: str = "desc",
    page: int = 1,
    limit: int = 50,
    search: str = "",
    filter: str = ""
):
    if not company_name:
        raise HTTPException(status_code=401, detail="Company Name is required to view assigned leads.")
        
    if not os.path.exists(SCORED_LEADS_PATH):
        raise HTTPException(
            status_code=404,
            detail="scored_leads.csv not found. Run 'python ml/generate_and_train.py' first."
        )
        
    try:
        # Load and coerce
        df = pd.read_csv(SCORED_LEADS_PATH)
        df["lead_id"] = df["lead_id"].astype(str)
        
        # Scope to company
        df = df[df["company_name"].str.lower() == company_name.strip().lower()]
        
        # Search query matching
        if search:
            q = search.lower()
            df = df[
                df["industry"].str.lower().str.contains(q, na=False) |
                df["company_size"].str.lower().str.contains(q, na=False) |
                df["source"].str.lower().str.contains(q, na=False) |
                df["company_name"].str.lower().str.contains(q, na=False) |
                df["lead_id"].str.contains(q, na=False)
            ]
            
        # Priority filter (conversion ranges)
        if filter:
            p = df["conversion_probability"]
            if filter == "hot":
                df = df[p >= 0.7]
            elif filter == "warm":
                df = df[(p >= 0.4) & (p < 0.7)]
            elif filter == "cold":
                df = df[p < 0.4]
                
        # Sort values
        ascending = order == "asc"
        if sort in df.columns:
            if sort in ["conversion_probability", "website_visits", "response_time_hours", "days_since_last_contact"]:
                df[sort] = pd.to_numeric(df[sort], errors="coerce").fillna(0)
            df = df.sort_values(by=sort, ascending=ascending)
            
        total = len(df)
        start = (page - 1) * limit
        paged_df = df.iloc[start:start + limit]
        
        # Transform and annotate
        records = paged_df.to_dict(orient="records")
        annotated = []
        for r in records:
            lead_id_num = 0
            try:
                lead_id_num = int(r.get("lead_id", 0))
            except ValueError:
                pass
            prior_average = (lead_id_num % 6) + 3
            is_spike = float(r.get("website_visits", 0)) > prior_average * 1.8
            
            prob = float(r.get("conversion_probability", 0.0))
            priority = "hot" if prob >= 0.7 else "warm" if prob >= 0.4 else "cold"
            
            r["website_visits"] = int(r.get("website_visits", 0))
            r["response_time_hours"] = float(r.get("response_time_hours", 0.0))
            r["days_since_last_contact"] = int(r.get("days_since_last_contact", 0))
            r["converted"] = int(r.get("converted", 0))
            r["conversion_probability"] = float(r.get("conversion_probability", 0.0))
            r["priority"] = priority
            r["engagement_spike"] = bool(is_spike)
            annotated.append(r)
            
        return {
            "leads": annotated,
            "total": total,
            "page": page,
            "limit": limit,
            "totalPages": math.ceil(total / limit)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Diagnostic Explain Helper
async def explain_lead_helper(lead_data: dict, probability: float = None, factors: str = None):
    company_name = lead_data.get("company_name", "this company")
    prob = probability if probability is not None else float(lead_data.get("conversion_probability", 0.0))
    pct = round(prob * 100)
    priority = "HIGH PRIORITY 🔥" if pct >= 70 else "MEDIUM PRIORITY 📈" if pct >= 40 else "LOW PRIORITY ❄️"
    
    factor_list = [f.strip() for f in factors.split("|") if f.strip()] if factors else []
    
    is_spike = lead_data.get("engagement_spike", False)
    if is_spike:
        engagement_context = f"⚡ IMPORTANT: This lead has shown an unusual engagement spike — website visits ({lead_data.get('website_visits', 0)}) are significantly above their historical average. This signals active buying intent."
    else:
        engagement_context = f"Website visits: {lead_data.get('website_visits', 0)} (no unusual spike detected)."
        
    system_prompt = f"""You are LeadIQ's senior sales intelligence analyst. You write detailed, business-focused explanations for sales reps — not generic summaries.

Your analysis must:
1. Start with a one-sentence VERDICT that names the company and states the priority clearly.
2. Explain EACH contributing factor below in plain business English — what it means, why it matters, and what it signals about buyer intent. Do NOT just repeat the label; explain it.
3. Comment on the engagement data (visits, demo request, response time, recency).
4. End with one specific, actionable instruction the rep should do TODAY.

Format your response exactly like this:
**VERDICT:** [one sentence naming {company_name} and its priority]

**WHY:**
"""
    for factor in factor_list[:3]:
        system_prompt += f"• [{factor}]: [2 sentences explaining what this means for {company_name}'s buying journey]\n"
    if not factor_list:
        system_prompt += "• [No factors]: [2 sentences explaining why no factors were recorded]\n"
        
    system_prompt += f"""
**ENGAGEMENT SIGNAL:** [1–2 sentences interpreting visits, demo status, response time, and days since contact]

**ACTION FOR TODAY:** [one sharp, specific instruction]"""

    user_prompt = f"""Analyze this lead for a sales rep.

Company: {company_name}
Industry: {lead_data.get('industry', 'Unknown')}
Size: {lead_data.get('company_size', 'Unknown')}
Source: {lead_data.get('source', 'Unknown')}
Website Visits (7d): {lead_data.get('website_visits', 0)}
Demo Requested: {lead_data.get('demo_requested', 'No')}
Response Time: {lead_data.get('response_time_hours', 'N/A')} hours
Days Since Last Contact: {lead_data.get('days_since_last_contact', 'N/A')}

ML Score: {pct}% → {priority}
Top Contributing Factors: {" | ".join(factor_list) if factor_list else "None recorded"}

{engagement_context}

Write the full structured analysis now."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    return await call_llm(messages, temperature=0.35, max_tokens=400)

class ExplainLeadPayload(BaseModel):
    leadData: dict
    probability: float = None
    factors: str = None

@app.post("/api/explain-lead")
async def post_explain_lead(payload: ExplainLeadPayload):
    try:
        res = await explain_lead_helper(payload.leadData, payload.probability, payload.factors)
        return {"explanation": res["text"], "provider": res["provider"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Recommendation / RAG Actions Helper
async def recommend_action_helper(lead_profile: dict, industry: str = None, sales_person_name: str = None):
    rep_name = sales_person_name or "Sales Representative"
    ind = industry or lead_profile.get("industry") or "B2B"
    
    query_text = " ".join([
        f"Sales lead in {ind} industry.",
        f"Company size: {lead_profile.get('company_size', 'Unknown')}.",
        f"Source: {lead_profile.get('source', 'Unknown')}.",
        f"Demo requested: {lead_profile.get('demo_requested', 'No')}.",
        f"Website visits: {lead_profile.get('website_visits', 0)}.",
        f"Response time: {lead_profile.get('response_time_hours', 'N/A')} hours.",
        f"Days since last contact: {lead_profile.get('days_since_last_contact', 'N/A')}.",
        f"Conversion probability: {round(float(lead_profile.get('conversion_probability', 0.0)) * 100)}%."
    ])
    
    context = ""
    sources = []
    
    try:
        vector = await embed_text(query_text, "query")
        matches = await query_index(vector, 5)
        relevant = [m for m in matches if m["score"] > 0.4]
        if relevant:
            context = "\n\n".join([f"[{idx + 1}] ({m['source']}): {m['text']}" for idx, m in enumerate(relevant)])
            sources = list(set([m["source"] for m in relevant]))
    except Exception as e:
        print(f"[recommend_action helper] Embedding/Pinecone error: {e}")
        
    no_context = not context
    company_name = lead_profile.get("company_name", "this company")
    
    lead_summary = "\n".join([
        f"Company Name: {company_name}",
        f"Company Size: {lead_profile.get('company_size', 'Unknown')}",
        f"Industry: {ind}",
        f"Source: {lead_profile.get('source', 'Unknown')}",
        f"Website Visits: {lead_profile.get('website_visits', 0)}",
        f"Demo Requested: {lead_profile.get('demo_requested', 'No')}",
        f"Response Time: {lead_profile.get('response_time_hours', 'N/A')} hours",
        f"Days Since Last Contact: {lead_profile.get('days_since_last_contact', 'N/A')}",
        f"Conversion Score: {round(float(lead_profile.get('conversion_probability', 0.0)) * 100)}%",
        f"Top Factors: {lead_profile.get('top_3_contributing_factors', 'N/A')}"
    ])
    
    context_section = "No relevant playbook or case study context was found in the knowledge base." if no_context else f"Retrieved Context (use ONLY this — do not invent facts):\n{context}"
    
    system_prompt = f"""You are an expert B2B sales coach AI. Generate a recommended next action and a 
short draft follow-up email for a sales rep, grounded ONLY in the provided context.
Personalize the draft email and action plan specifically for the client company "{company_name}". 
Always sign the end of the draft email with the salesperson's real name: "{rep_name}".
Never use generic placeholders like "[Company Name]" or "[Your Name]".
If no relevant context is found, say so explicitly instead of inventing information.

Format your response as follows:
RECOMMENDED ACTION:
[1-2 sentence action the rep should take today]

DRAFT EMAIL:
Subject: [subject line]
---
[email body, max 120 words, professional and personalized, ending with the signature:
Best regards,
{rep_name}]"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Lead Profile:\n{lead_summary}\n\n{context_section}"}
    ]
    
    res = await call_llm(messages, temperature=0.5, max_tokens=512)
    text = res["text"]
    
    action = text
    draft_email = ""
    
    email_match = re.search(r'DRAFT EMAIL:\s*([\s\S]+)', text, re.IGNORECASE)
    action_match = re.search(r'RECOMMENDED ACTION:\s*([\s\S]+?)(?=DRAFT EMAIL:|$)', text, re.IGNORECASE)
    
    if action_match:
        action = action_match.group(1).strip()
    if email_match:
        draft_email = email_match.group(1).strip()
        
    return {
        "action": action,
        "draftEmail": draft_email,
        "sources": sources,
        "provider": res["provider"],
        "contextFound": not no_context
    }

class RecommendActionPayload(BaseModel):
    leadProfile: dict
    industry: str = None
    salesPersonName: str = None

@app.post("/api/recommend-action")
async def post_recommend_action(payload: RecommendActionPayload):
    try:
        result = await recommend_action_helper(payload.leadProfile, payload.industry, payload.salesPersonName)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Autonomous Diagnostic Agent (Fast-path parallel execution)
class AgentPayload(BaseModel):
    lead: dict
    salesPersonName: str = None

@app.post("/api/agent")
async def post_agent(payload: AgentPayload):
    lead = payload.lead
    sales_person_name = payload.salesPersonName
    
    company_name = lead.get("company_name", "this company")
    probability = float(lead.get("conversion_probability", 0.0))
    score_pct = round(probability * 100)
    priority = lead.get("priority")
    
    if not priority:
        priority = "hot" if score_pct >= 70 else "warm" if score_pct >= 40 else "cold"
        
    agent_state = {
        "trace": [],
        "explanation": None,
        "recommendation": None,
        "urgent": {"flagged": False, "reason": ""},
        "noAction": {"needed": False, "reason": ""}
    }
    
    # FAST PATH — Hot or Warm leads
    if priority in ["hot", "warm"]:
        # Flag urgent if hot + engagement spike
        lead_id_num = 0
        try:
            lead_id_num = int(lead.get("lead_id", 0))
        except ValueError:
            pass
        prior_average = (lead_id_num % 6) + 3
        is_spike = float(lead.get("website_visits", 0)) > prior_average * 1.8
        
        if priority == "hot" and is_spike:
            urgent_reason = f"{company_name} is a high-score lead ({score_pct}%) with an active engagement spike — unusually high website visits signal imminent purchase intent."
            agent_state["urgent"] = {"flagged": True, "reason": urgent_reason}
            agent_state["trace"].append({
                "tool": "flag_urgent",
                "args": {"reason": urgent_reason},
                "result": f"Urgency flagged for {company_name}."
            })
            
        # Parallel Execution of Sub-Tasks
        try:
            exp_task = explain_lead_helper(lead, probability, lead.get("top_3_contributing_factors"))
            rec_task = recommend_action_helper(lead, lead.get("industry"), sales_person_name)
            
            exp_result, rec_result = await asyncio.gather(exp_task, rec_task)
            
            agent_state["explanation"] = exp_result["text"]
            agent_state["recommendation"] = {
                "action": rec_result["action"],
                "draftEmail": rec_result["draftEmail"],
                "sources": rec_result.get("sources") or [],
                "contextFound": rec_result["contextFound"]
            }
            
            agent_state["trace"].extend([
                {"tool": "generate_explanation", "args": {}, "result": f"Explanation generated via {exp_result.get('provider', 'llm')}."},
                {"tool": "generate_recommendation", "args": {}, "result": f"Recommendation generated. Sources: [{', '.join(rec_result.get('sources', []))}]"}
            ])
        except Exception as e:
            agent_state["explanation"] = f"Explanation unavailable: {str(e)}"
            agent_state["recommendation"] = {
                "action": f"Recommendation unavailable: {str(e)}",
                "draftEmail": "",
                "sources": [],
                "contextFound": False
            }
            agent_state["trace"].append({
                "tool": "error",
                "args": {},
                "result": f"Execution failed: {str(e)}"
            })
            
        return {"success": True, **agent_state}
        
    # COLD PATH — Low-priority leads
    if priority == "cold":
        if lead.get("demo_requested") == "Yes":
            try:
                exp_task = explain_lead_helper(lead, probability, lead.get("top_3_contributing_factors"))
                rec_task = recommend_action_helper(lead, lead.get("industry"), sales_person_name)
                
                exp_result, rec_result = await asyncio.gather(exp_task, rec_task)
                
                agent_state["explanation"] = exp_result["text"]
                agent_state["recommendation"] = {
                    "action": rec_result["action"],
                    "draftEmail": rec_result["draftEmail"],
                    "sources": rec_result.get("sources") or [],
                    "contextFound": rec_result["contextFound"]
                }
                agent_state["trace"].extend([
                    {"tool": "generate_explanation", "args": {}, "result": "Cold lead but demo was requested — explanation generated."},
                    {"tool": "generate_recommendation", "args": {}, "result": "Demo signal triggered recommendation despite cold score."}
                ])
            except Exception as e:
                agent_state["explanation"] = f"Explanation unavailable: {str(e)}"
                agent_state["recommendation"] = {
                    "action": f"Recommendation unavailable: {str(e)}",
                    "draftEmail": "",
                    "sources": [],
                    "contextFound": False
                }
            return {"success": True, **agent_state}
            
        no_action_reason = f"{company_name} has a low conversion score ({score_pct}%), no demo request, and low engagement. Follow-up is not cost-effective at this time. Re-queue in 30 days or if engagement spikes."
        agent_state["noAction"] = {"needed": True, "reason": no_action_reason}
        agent_state["trace"].append({
            "tool": "no_action_needed",
            "args": {"reason": no_action_reason},
            "result": f"No action decision logged for {company_name}."
        })
        return {"success": True, **agent_state}

# General Purpose Coach Chatbot
class ChatPayload(BaseModel):
    question: str
    history: list = []
    companyName: str = None
    companyId: str = None

@app.post("/api/chat")
async def post_chat(payload: ChatPayload):
    question = payload.question
    history = payload.history
    company_name = payload.companyName
    company_id = payload.companyId
    
    if not question.strip():
        raise HTTPException(status_code=400, detail="question is required")
        
    rep_context = f"You are speaking to a representative from {company_name} (Company ID: {company_id}). Tailor your answers to help their organization leverage our software features and close customer queries." if company_name and company_id else "You are speaking to a customer representative."
    
    context = ""
    sources = []
    context_found = False
    
    try:
        vector = await embed_text(question, "query")
        matches = await query_index(vector, 5)
        relevant = [m for m in matches if m["score"] > 0.35]
        if relevant:
            context = "\n\n---\n\n".join([f"[{idx + 1}] Source: {m['source']}\n{m['text']}" for idx, m in enumerate(relevant)])
            sources = list(set([m["source"] for m in relevant]))
            context_found = True
    except Exception as e:
        print(f"[/api/chat] Embedding/Pinecone error: {e}")
        
    if context_found:
        system_prompt = f"""You are a knowledgeable AI sales assistant for a B2B SaaS company. 
{rep_context}
Answer questions about our product, pricing, competitors, and case studies using ONLY the provided context.
If the context doesn't contain the answer, fall back to your general B2B sales coaching knowledge to answer the question helpfully while mentioning it is general advice.
Always cite the source document name when you use information from it (e.g., "According to our pricing guide...").
Keep answers clear, concise, and under 200 words.

Context from knowledge base:
{context}"""
    else:
        system_prompt = f"""You are a knowledgeable AI sales assistant. {rep_context}
The specific playbook did not return matches for this query. Answer the user's question using your general B2B sales coaching knowledge and best practices. Give helpful, professional, and practical advice to the sales representative."""

    messages = [{"role": "system", "content": system_prompt}]
    for h in history[-6:]:
        messages.append({"role": h.get("role"), "content": h.get("content")})
    messages.append({"role": "user", "content": question})
    
    res = await call_llm(messages, temperature=0.35, max_tokens=512)
    return {
        "answer": res["text"],
        "sources": sources,
        "provider": res["provider"],
        "contextFound": context_found
    }

# Feedback collection
class FeedbackPayload(BaseModel):
    leadId: str
    outcome: str

@app.post("/api/feedback")
async def post_feedback(payload: FeedbackPayload):
    lead_id = payload.leadId.strip()
    outcome = payload.outcome.strip()
    
    if not lead_id or not outcome:
        raise HTTPException(status_code=400, detail="leadId and outcome are required")
        
    if outcome not in ["Converted", "Not Converted"]:
        raise HTTPException(status_code=400, detail="outcome must be Converted or Not Converted")
        
    ensure_feedback_file()
    
    from datetime import datetime
    timestamp = datetime.utcnow().isoformat()
    row = f'"{lead_id}","{outcome}","{timestamp}"\n'
    
    with open(FEEDBACK_PATH, "a", encoding="utf-8") as f:
        f.write(row)
        
    total = 0
    with open(FEEDBACK_PATH, "r", encoding="utf-8") as f:
        total = len(f.readlines()) - 1
        
    return {
        "success": True,
        "leadId": lead_id,
        "outcome": outcome,
        "timestamp": timestamp,
        "total": total,
        "message": f"Feedback recorded. Total feedback entries: {total}"
    }

@app.get("/api/feedback")
async def get_feedback():
    if not os.path.exists(FEEDBACK_PATH):
        return {"feedback": [], "total": 0}
        
    try:
        df = pd.read_csv(FEEDBACK_PATH)
        records = df.to_dict(orient="records")
        parsed = []
        for r in records:
            parsed.append({
                "leadId": str(r.get("lead_id")),
                "outcome": str(r.get("outcome")),
                "timestamp": str(r.get("timestamp"))
            })
        return {"feedback": parsed, "total": len(parsed)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Company & Lead Upload Pipeline
@app.post("/api/register")
async def post_register(
    companyName: str = Form(...),
    accessCode: str = Form(None),
    file: UploadFile = File(...)
):
    if not companyName.strip():
        raise HTTPException(status_code=400, detail="Company Name is required")
    if not file:
        raise HTTPException(status_code=400, detail="CSV file is required")
        
    final_access_code = accessCode.strip() if accessCode else get_access_code(companyName)
    
    content = await file.read()
    raw_content = content.decode("utf-8")
    
    df_raw = pd.read_csv(StringIO(raw_content))
    if len(df_raw) == 0:
        raise HTTPException(status_code=400, detail="Uploaded CSV has no records")
        
    # Standardize values
    normalized = []
    for idx, (_, r) in enumerate(df_raw.iterrows()):
        normalized.append({
            "lead_id": str(r.get("lead_id") if pd.notna(r.get("lead_id")) else idx),
            "company_id": str(r.get("company_id") if pd.notna(r.get("company_id")) else f"CMP-{random.randint(1000, 9999)}"),
            "company_name": companyName.strip(),
            "sales_person_id": str(r.get("sales_person_id") if pd.notna(r.get("sales_person_id")) else "SP-01"),
            "assigned_sales_person": str(r.get("assigned_sales_person") if pd.notna(r.get("assigned_sales_person")) else "Rahul Kumar"),
            "company_size": str(r.get("company_size") if pd.notna(r.get("company_size")) else "Mid"),
            "industry": str(r.get("industry") if pd.notna(r.get("industry")) else "SaaS"),
            "website_visits": int(r.get("website_visits") if pd.notna(r.get("website_visits")) else 5),
            "demo_requested": str(r.get("demo_requested") if pd.notna(r.get("demo_requested")) else "No"),
            "source": str(r.get("source") if pd.notna(r.get("source")) else "Organic"),
            "response_time_hours": float(r.get("response_time_hours") if pd.notna(r.get("response_time_hours")) else 12.0),
            "days_since_last_contact": int(r.get("days_since_last_contact") if pd.notna(r.get("days_since_last_contact")) else 10),
            "converted": int(r.get("converted") if pd.notna(r.get("converted")) else 0),
            "conversion_probability": float(r.get("conversion_probability") if pd.notna(r.get("conversion_probability")) else 0.0),
            "top_3_contributing_factors": str(r.get("top_3_contributing_factors") if pd.notna(r.get("top_3_contributing_factors")) else "")
        })
        
    df_normalized = pd.DataFrame(normalized)
    
    # Path mappings
    UPLOAD_TEMP_IN = os.path.join("ml", "register_temp_in.csv")
    UPLOAD_TEMP_OUT = os.path.join("ml", "register_temp_out.csv")
    MODEL_PKL_PATH = os.path.join("ml", "best_model.pkl")
    WORKER_SCRIPT = os.path.join("ml", "score_custom_leads.py")
    
    df_normalized.to_csv(UPLOAD_TEMP_IN, index=False)
    
    # Run the python model classifier script
    cmd = f'python "{WORKER_SCRIPT}" "{UPLOAD_TEMP_IN}" "{UPLOAD_TEMP_OUT}" "{MODEL_PKL_PATH}"'
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    
    if proc.returncode != 0:
        err_msg = stderr.decode().strip() or stdout.decode().strip()
        raise HTTPException(status_code=500, detail=f"Scoring worker failed: {err_msg}")
        
    # Parse scored csv output
    df_scored = pd.read_csv(UPLOAD_TEMP_OUT)
    
    max_lead_id = 0
    if os.path.exists(SCORED_LEADS_PATH):
        try:
            df_existing = pd.read_csv(SCORED_LEADS_PATH)
            ids = pd.to_numeric(df_existing["lead_id"], errors="coerce").dropna().astype(int)
            if len(ids) > 0:
                max_lead_id = ids.max()
        except Exception:
            pass
            
    df_scored["lead_id"] = [str(max_lead_id + 1 + idx) for idx in range(len(df_scored))]
    
    # Append to database
    if os.path.exists(SCORED_LEADS_PATH):
        df_scored.to_csv(SCORED_LEADS_PATH, mode="a", header=False, index=False)
    else:
        df_scored.to_csv(SCORED_LEADS_PATH, index=False)
        
    # Record company registration
    companies_list = load_companies()
    if not any(c["name"].lower() == companyName.strip().lower() for c in companies_list):
        companies_list.append({"name": companyName.strip(), "accessCode": final_access_code})
        with open(COMPANIES_PATH, "w", encoding="utf-8") as f:
            json.dump(companies_list, f, indent=2)
            
    # Cleanup files
    try:
        if os.path.exists(UPLOAD_TEMP_IN):
            os.remove(UPLOAD_TEMP_IN)
        if os.path.exists(UPLOAD_TEMP_OUT):
            os.remove(UPLOAD_TEMP_OUT)
    except Exception:
        pass
        
    return {
        "success": True,
        "message": f"Registered {companyName} and added {len(df_scored)} scored leads successfully.",
        "companyName": companyName.strip(),
        "accessCode": final_access_code
    }
