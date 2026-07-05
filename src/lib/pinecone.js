/**
 * Pinecone Utility
 * =================
 * Initializes the Pinecone client and exposes a helper to query the index.
 */

import { Pinecone } from "@pinecone-database/pinecone";

let _client = null;
let _index  = null;

function getClient() {
  if (!_client) {
    _client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  }
  return _client;
}

function getIndex() {
  if (!_index) {
    const indexName = process.env.PINECONE_INDEX_NAME || "sales-leads-kb";
    _index = getClient().index(indexName);
  }
  return _index;
}

/**
 * Query Pinecone with an embedding vector.
 * @param {number[]} vector  - Query embedding
 * @param {number}   topK    - Number of results
 * @returns {Promise<Array<{text: string, source: string, score: number}>>}
 */
export async function queryIndex(vector, topK = 5) {
  const index = getIndex();
  const result = await index.query({
    vector,
    topK,
    includeMetadata: true,
  });

  return (result.matches ?? []).map((m) => ({
    text:   m.metadata?.text   ?? "",
    source: m.metadata?.source ?? "unknown",
    score:  m.score            ?? 0,
  }));
}

/**
 * Upsert vectors into the Pinecone index (used by embed-docs.js).
 * @param {Array<{id, values, metadata}>} vectors
 */
export async function upsertVectors(vectors) {
  const index = getIndex();
  await index.upsert(vectors);
}
