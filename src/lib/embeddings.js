import OpenAI from "openai";

const NVIDIA_EMBED_BASE = "https://integrate.api.nvidia.com/v1";
const EMBED_MODEL       = "nvidia/nv-embedqa-e5-v5";

/** Helper to detect the current provider and credentials from env */
function getProviderAndKey() {
  const geminiKey = process.env.GEMINI_API_KEY || (
    process.env.NVIDIA_API_KEY && process.env.NVIDIA_API_KEY.startsWith("AIzaSy") ? process.env.NVIDIA_API_KEY : null
  ) || (
    process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("AIzaSy") ? process.env.OPENAI_API_KEY : null
  );

  if (geminiKey) {
    return { provider: "gemini", apiKey: geminiKey };
  }

  const openAIKey = process.env.OPENAI_API_KEY || (
    process.env.NVIDIA_API_KEY && (
      process.env.NVIDIA_API_KEY.startsWith("sk-") || 
      process.env.NVIDIA_API_KEY.startsWith("sk_")
    ) ? process.env.NVIDIA_API_KEY : null
  );

  if (openAIKey) {
    return { provider: "openai", apiKey: openAIKey };
  }

  if (process.env.NVIDIA_API_KEY) {
    return { provider: "nvidia", apiKey: process.env.NVIDIA_API_KEY };
  }

  if (process.env.GROQ_API_KEY) {
    return { provider: "groq", apiKey: process.env.GROQ_API_KEY };
  }

  return { provider: null, apiKey: null };
}

/**
 * Embed a single text string.
 * @param {string} text
 * @param {"query"|"passage"} inputType
 * @returns {Promise<number[]>}
 */
export async function embedText(text, inputType = "query") {
  const { provider, apiKey } = getProviderAndKey();

  if (provider === "gemini") {
    try {
      const openai = new OpenAI({
        apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      });
      const resp = await openai.embeddings.create({
        model: "text-embedding-004",
        input: text,
      });
      let embedding = resp.data?.[0]?.embedding ?? [];
      // Pad to 1024 dimensions if needed
      if (embedding.length > 0 && embedding.length < 1024) {
        const padding = new Array(1024 - embedding.length).fill(0);
        embedding = embedding.concat(padding);
      }
      return embedding;
    } catch (err) {
      console.error("[Embeddings] Gemini embedding failed:", err.message);
      throw err;
    }
  }

  if (provider === "openai") {
    try {
      const openai = new OpenAI({ apiKey });
      const resp = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        dimensions: 1024,
      });
      return resp.data?.[0]?.embedding ?? [];
    } catch (err) {
      console.error("[Embeddings] OpenAI embedding failed:", err.message);
      throw err;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch(`${NVIDIA_EMBED_BASE}/embeddings`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model:      EMBED_MODEL,
        input:      [text],
        input_type: inputType,
        encoding_format: "float",
        truncate: "END",
      }),
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`NVIDIA Embedding API error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    return data.data?.[0]?.embedding ?? [];
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Embed multiple texts in one call (batch).
 * @param {string[]} texts
 * @param {"query"|"passage"} inputType
 * @returns {Promise<number[][]>}
 */
export async function embedBatch(texts, inputType = "passage") {
  const { provider, apiKey } = getProviderAndKey();

  if (provider === "gemini") {
    try {
      const openai = new OpenAI({
        apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      });
      const resp = await openai.embeddings.create({
        model: "text-embedding-004",
        input: texts,
      });
      return resp.data.map((d) => {
        let embedding = d.embedding;
        if (embedding.length > 0 && embedding.length < 1024) {
          const padding = new Array(1024 - embedding.length).fill(0);
          embedding = embedding.concat(padding);
        }
        return embedding;
      });
    } catch (err) {
      console.error("[Embeddings] Gemini batch embedding failed:", err.message);
      throw err;
    }
  }

  if (provider === "openai") {
    try {
      const openai = new OpenAI({ apiKey });
      const resp = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
        dimensions: 1024,
      });
      return resp.data.map((d) => d.embedding);
    } catch (err) {
      console.error("[Embeddings] OpenAI batch embedding failed:", err.message);
      throw err;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s for batch

  try {
    const resp = await fetch(`${NVIDIA_EMBED_BASE}/embeddings`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model:      EMBED_MODEL,
        input:      texts,
        input_type: inputType,
        encoding_format: "float",
        truncate: "END",
      }),
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`NVIDIA Embedding API error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    return data.data.map((d) => d.embedding);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
