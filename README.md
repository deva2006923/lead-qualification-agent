# LeadIQ — AI Sales Lead Intelligence Platform

A full-stack, enterprise-grade B2B sales lead qualification and intelligence platform. It features machine-learning-based lead scoring, a multi-tool autonomous AI Agent for lead diagnostics, RAG-grounded outreach email generation, and a context-aware chat assistant.

---

## 🚀 Key Features

### 1. 🔐 Two-Step Company Authentication Flow
* **Side-by-side Layout:** A visual list of registered client companies on the left, with an authorization panel on the right.
* **Secured Access Codes:** Authenticate sessions securely using lowercase names plus a numeric suffix (e.g., `davisandsons12`).
* **Session Scoping:** Once logged in, all data points, lead pipelines, chat history, and exports are restricted solely to the active company's scope.

### 2. ⚡ Autonomous Sales Operations Agent (`/api/agent`)
* **Parallel Fast-Path:** Analyzes Hot and Warm leads concurrently using `Promise.all()` to generate explanations and playbooks in parallel. Cuts analysis time from **~20s → ~5s**.
* **Markdown Rendered Analysis:** Renders a clean structured diagnosis with a clear **Verdict**, bulleted **Why** factors, **Engagement Signal** checks, and a direct **Action for Today**.
* **Draft outreach template:** Instantly produces a personalized follow-up email tailored to the prospect's industry and website visits.
* **Copy to Clipboard:** Features a **Copy Email** button to copy drafts in one click.
* **Muting of Cold Leads:** Instantly logs `no_action_needed` for cold leads with zero active engagement to save representative time.
* **Audit Trail Log:** Exposes the underlying step-by-step tool trace so reps can inspect *how* the agent reasoned through the lead.

### 3. 📊 Expanded Pipeline Dataset (1,500 leads)
* **High density data:** Database expanded to **1,500 records** distributed evenly across a fixed pool of 35 companies (roughly 40-50 leads per company).
* **Deterministic Spikes:** Real-time engagement spikes are flagged when a prospect's website visits exceed their historical baseline by 1.8x.

### 4. 💬 General fallback Sales Chatbot
* **Hybrid RAG Chat:** Grounded in case studies and playbooks, with a smart fallback to general B2B sales coaching principles when playbook context isn't matched.

---

## 🛠️ Technology Stack

| Layer | Technology | Description |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) | High-performance React application structure |
| **Styling** | Tailwind CSS & Vanilla CSS | Sleek, dark-mode premium copper-gold palette |
| **Database/Cache** | CSV & local JSON | Local data storage for pipeline records |
| **Vector DB** | Pinecone | Vector indexing of playbook guides |
| **Embeddings** | NVIDIA NIM | `nvidia/nv-embedqa-e5-v5` for query matching |
| **LLM Engine** | Groq & NVIDIA NIM | Primary: `llama-3.3-70b-versatile` (fast fallback to NVIDIA) |
| **ML Engine** | Python / scikit-learn | Custom classifier for conversion scores |

---

## 💻 Quick Start & Setup

### 1. Configure Secrets
Rename `.env.local.example` to `.env.local` and configure your API keys:
```env
GROQ_API_KEY=gsk_...
NVIDIA_API_KEY=nvapi-...
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=sales-leads-kb
```

### 2. Generate and Score leads
Regenerate the 1,500 lead database and train/score the classification models:
```bash
cd ml
pip install -r requirements.txt
python generate_and_train.py
```

### 3. Embed Playbooks into Vector DB
```bash
npm install
npm run embed-docs
```

### 4. Start Next.js Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and select a company card on the login screen to access the console!

---

## 🔒 Sales Rep Accounts for Quick Demo
* **Davis and Sons** — Access Code: `davisandsons12`
* **Blake and Sons** — Access Code: `blakeandsons12`
* **Doyle Ltd** — Access Code: `doyleltd12`
* **Hernandez Ltd** — Access Code: `hernandezltd12`
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
