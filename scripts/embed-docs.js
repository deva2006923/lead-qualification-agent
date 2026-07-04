#!/usr/bin/env node
/**
 * embed-docs.js — Knowledge Base Embedding Script
 * =================================================
 * Reads each .txt file in /docs, chunks by paragraph, embeds each chunk
 * using NVIDIA NIM, and upserts into Pinecone with {text, source} metadata.
 *
 * Usage: node scripts/embed-docs.js
 * Requires: NVIDIA_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_NAME in .env.local
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load .env.local manually (no dotenv dep needed — parse ourselves)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const envPath   = path.join(ROOT, ".env.local");

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] = val;
  }
  console.log("[env] Loaded .env.local");
} else {
  console.warn("[env] No .env.local found — relying on shell environment");
}

// -------------------------------------------------------------------------
// Config
// -------------------------------------------------------------------------
const DOCS_DIR        = path.join(ROOT, "docs");
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const EMBED_MODEL     = "nvidia/nv-embedqa-e5-v5";
const PINECONE_INDEX  = process.env.PINECONE_INDEX_NAME || "sales-leads-kb";
const BATCH_SIZE      = 10; // upsert in batches to avoid rate limits
const DELAY_MS        = 500;

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/** Split text into non-empty paragraph chunks (double-newline separated). */
function chunkByParagraph(text, minLen = 60) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter((p) => p.length >= minLen);
}

/** Sleep helper to respect rate limits. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Embed a batch of texts via NVIDIA NIM. */
async function embedBatch(texts) {
  const resp = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${process.env.NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model:           EMBED_MODEL,
      input:           texts,
      input_type:      "passage",
      encoding_format: "float",
      truncate:        "END",
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`NVIDIA embed error ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  return data.data.map((d) => d.embedding);
}

/** Upsert a batch of vectors into Pinecone via REST API. */
async function upsertToPinecone(vectors) {
  // Describe index to get host
  const descResp = await fetch(
    `https://api.pinecone.io/indexes/${PINECONE_INDEX}`,
    { headers: { "Api-Key": process.env.PINECONE_API_KEY, "Content-Type": "application/json" } }
  );

  if (!descResp.ok) {
    const body = await descResp.text();
    throw new Error(`Pinecone describe error ${descResp.status}: ${body}`);
  }

  const indexInfo = await descResp.json();
  const host = indexInfo.host;

  const upsertResp = await fetch(`https://${host}/vectors/upsert`, {
    method:  "POST",
    headers: {
      "Api-Key":      process.env.PINECONE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ vectors }),
  });

  if (!upsertResp.ok) {
    const body = await upsertResp.text();
    throw new Error(`Pinecone upsert error ${upsertResp.status}: ${body}`);
  }

  return upsertResp.json();
}

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------
async function main() {
  console.log("\n🚀 Knowledge Base Embedding Script");
  console.log("=====================================");

  if (!process.env.NVIDIA_API_KEY) throw new Error("NVIDIA_API_KEY is not set");
  if (!process.env.PINECONE_API_KEY) throw new Error("PINECONE_API_KEY is not set");

  const docFiles = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".txt"));

  if (docFiles.length === 0) {
    console.error(`No .txt files found in ${DOCS_DIR}`);
    process.exit(1);
  }

  console.log(`Found ${docFiles.length} document(s):`, docFiles);

  let totalChunks = 0;
  let totalUpserted = 0;
  let globalId = 0;

  for (const filename of docFiles) {
    const source   = filename.replace(".txt", "");
    const fullPath = path.join(DOCS_DIR, filename);
    const text     = fs.readFileSync(fullPath, "utf-8");
    const chunks   = chunkByParagraph(text);

    console.log(`\n📄 ${filename} → ${chunks.length} chunks`);
    totalChunks += chunks.length;

    // Process in BATCH_SIZE groups
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);
      const batchIds    = batchChunks.map((_, j) => `${source}-${globalId + j}`);

      process.stdout.write(
        `  Embedding chunks ${i + 1}–${Math.min(i + BATCH_SIZE, chunks.length)}... `
      );

      const embeddings = await embedBatch(batchChunks);

      const vectors = batchChunks.map((chunk, j) => ({
        id:       batchIds[j],
        values:   embeddings[j],
        metadata: { text: chunk, source },
      }));

      await upsertToPinecone(vectors);
      totalUpserted += vectors.length;
      globalId      += batchChunks.length;

      console.log(`✓ Upserted ${vectors.length} vectors`);

      if (i + BATCH_SIZE < chunks.length) await sleep(DELAY_MS);
    }
  }

  console.log("\n✅ Embedding complete!");
  console.log(`   Documents : ${docFiles.length}`);
  console.log(`   Chunks    : ${totalChunks}`);
  console.log(`   Upserted  : ${totalUpserted}`);
  console.log(`   Index     : ${PINECONE_INDEX}`);
}

main().catch((err) => {
  console.error("\n❌ Embedding failed:", err.message);
  process.exit(1);
});
