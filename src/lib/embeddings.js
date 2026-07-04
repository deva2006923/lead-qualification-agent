/**
 * NVIDIA NIM Embedding Utility
 * =============================
 * Calls the NVIDIA NIM embedding endpoint and returns a float[] vector.
 * Model: nvidia/nv-embedqa-e5-v5 (1024-dim)
 */

const NVIDIA_EMBED_BASE = "https://integrate.api.nvidia.com/v1";
const EMBED_MODEL       = "nvidia/nv-embedqa-e5-v5";

/**
 * Embed a single text string.
 * @param {string} text
 * @param {"query"|"passage"} inputType
 * @returns {Promise<number[]>}
 */
export async function embedText(text, inputType = "query") {
  const resp = await fetch(`${NVIDIA_EMBED_BASE}/embeddings`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model:      EMBED_MODEL,
      input:      [text],
      input_type: inputType,
      encoding_format: "float",
      truncate: "END",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`NVIDIA Embedding API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.data?.[0]?.embedding ?? [];
}

/**
 * Embed multiple texts in one call (batch).
 * @param {string[]} texts
 * @param {"query"|"passage"} inputType
 * @returns {Promise<number[][]>}
 */
export async function embedBatch(texts, inputType = "passage") {
  const resp = await fetch(`${NVIDIA_EMBED_BASE}/embeddings`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model:      EMBED_MODEL,
      input:      texts,
      input_type: inputType,
      encoding_format: "float",
      truncate: "END",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`NVIDIA Embedding API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.data.map((d) => d.embedding);
}
