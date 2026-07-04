# AI Sales Lead Intelligence Platform

A full-stack AI-powered sales lead qualification system combining ML-based lead scoring, RAG-grounded recommendations, and an intelligent chat assistant.

## Architecture

```
ML Pipeline (Python)  →  scored_leads.csv  →  Next.js API routes  →  React Frontend
NVIDIA NIM embeddings →  Pinecone index    →  /api/chat, /api/recommend-action
NVIDIA NIM / Groq LLM →  LLM explanations →  /api/explain-lead
```

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS |
| ML Pipeline | Python, scikit-learn, XGBoost, Faker |
| Embeddings | NVIDIA NIM (`nvidia/nv-embedqa-e5-v5`) |
| LLM | NVIDIA NIM (`meta/llama-3.1-70b-instruct`) → Groq fallback (`llama-3.3-70b-versatile`) |
| Vector DB | Pinecone |

## Quick Start

### 1. Clone & Configure

```bash
# Copy environment template
cp .env.local.example .env.local
# Edit .env.local and fill in your API keys
```

Required keys:
- `NVIDIA_API_KEY` — [build.nvidia.com](https://build.nvidia.com)
- `GROQ_API_KEY` — [console.groq.com](https://console.groq.com)
- `PINECONE_API_KEY` — [app.pinecone.io](https://app.pinecone.io)
- `PINECONE_INDEX_NAME` — name of your Pinecone index (must be **1024-dim**, cosine metric)

### 2. Create Pinecone Index

In the Pinecone console, create an index with:
- **Dimensions**: 1024
- **Metric**: cosine
- **Name**: `sales-leads-kb` (or whatever you set in `PINECONE_INDEX_NAME`)

### 3. Run the ML Pipeline

```bash
cd ml
pip install -r requirements.txt
python generate_and_train.py
```

This generates:
- `ml/scored_leads.csv` — 1000 scored leads
- `ml/best_model.pkl` — trained model
- `ml/raw_leads.csv` — raw synthetic dataset

### 4. Embed the Knowledge Base

```bash
npm install
npm run embed-docs
```

This reads `docs/*.txt`, embeds each paragraph via NVIDIA NIM, and upserts into Pinecone.

### 5. Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/leads`.

## Pages

### `/leads` — Lead Intelligence Table
- Sortable by conversion score, website visits
- Filterable by priority: Hot 🔴 / Warm 🟡 / Cold 🔵
- Search by industry, source, ID
- ⚡ Engagement spike badge for high-visit leads
- Expandable rows with:
  - AI explanation of why the lead is high/low priority
  - Recommended next action + draft follow-up email (RAG-grounded)
  - Mark as Converted / Not Converted (writes to `data/feedback.csv`)

### `/chat` — AI Sales Assistant
- RAG chatbot grounded in your knowledge base
- Sources cited under each answer
- Conversation history included in each request
- Suggested questions on empty state

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/leads` | GET | Paginated, sortable, filterable leads |
| `/api/explain-lead` | POST | LLM explanation of lead priority |
| `/api/recommend-action` | POST | RAG-grounded action + draft email |
| `/api/chat` | POST | RAG chatbot |
| `/api/feedback` | POST/GET | Record/read lead outcomes |

## Project Structure

```
├── ml/
│   ├── generate_and_train.py   # ML pipeline
│   ├── requirements.txt
│   ├── scored_leads.csv        # Generated output
│   └── best_model.pkl          # Trained model
├── docs/
│   ├── competitor-comparison.txt
│   ├── pricing-faq.txt
│   └── case-studies.txt
├── scripts/
│   └── embed-docs.js           # Pinecone embedding script
├── data/
│   └── feedback.csv            # Auto-created on first feedback
├── src/
│   ├── app/
│   │   ├── layout.js
│   │   ├── page.js             # Redirects to /leads
│   │   ├── leads/page.js
│   │   ├── chat/page.js
│   │   └── api/
│   │       ├── leads/route.js
│   │       ├── explain-lead/route.js
│   │       ├── recommend-action/route.js
│   │       ├── chat/route.js
│   │       └── feedback/route.js
│   ├── components/
│   │   ├── Navbar.js
│   │   ├── LeadRow.js
│   │   └── ChatMessage.js
│   └── lib/
│       ├── llm.js              # NVIDIA NIM → Groq fallback
│       ├── embeddings.js       # NVIDIA NIM embedding
│       ├── pinecone.js         # Pinecone client
│       └── leads.js            # CSV reader
└── .env.local.example
```

## Deploying to Vercel

```bash
vercel --prod
```

Set all environment variables in the Vercel dashboard under **Settings → Environment Variables**.

> ⚠️ **Note**: `data/feedback.csv` writes to the local filesystem — this won't persist across Vercel serverless invocations. For production, replace with a Vercel KV, Supabase, or Postgres database.

## Model Retraining

After collecting feedback via `/api/feedback`, you can retrain the model on real outcomes:

```bash
# Export feedback
curl http://localhost:3000/api/feedback > data/feedback.json

# Then merge with original dataset and re-run:
cd ml && python generate_and_train.py
```
