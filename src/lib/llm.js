/**
 * LLM Utility — Groq PRIMARY (fast) with NVIDIA NIM fallback
 * ===========================================================
 * Primary:  Groq  (llama-3.3-70b-versatile) — ~800 tokens/sec, ultra-fast
 * Fallback: NVIDIA NIM (meta/llama-3.3-70b-instruct)
 *
 * Both are OpenAI-SDK-compatible, so we just swap baseURL + model.
 */

import OpenAI from "openai";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const GROQ_BASE_URL   = "https://api.groq.com/openai/v1";

const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
const GROQ_MODEL   = "llama-3.3-70b-versatile";

/** Create an OpenAI-compatible client for the given provider. */
function makeClient(provider) {
  if (provider === "nvidia") {
    return new OpenAI({
      apiKey:  process.env.NVIDIA_API_KEY,
      baseURL: NVIDIA_BASE_URL,
    });
  }
  return new OpenAI({
    apiKey:  process.env.GROQ_API_KEY,
    baseURL: GROQ_BASE_URL,
  });
}

/**
 * Call the LLM — tries Groq first (fast ~800 tok/s), falls back to NVIDIA NIM.
 *
 * @param {Array}  messages  - OpenAI chat messages array
 * @param {Object} options   - { temperature, maxTokens, tools, tool_choice }
 * @returns {{ text: string, message: object, provider: string }}
 */
export async function callLLM(messages, { temperature = 0.4, maxTokens = 1024, tools, tool_choice } = {}) {
  // --- Primary: Groq (fast ~800 tokens/sec) ---
  if (process.env.GROQ_API_KEY) {
    try {
      const client = makeClient("groq");
      const resp = await client.chat.completions.create({
        model:       GROQ_MODEL,
        messages,
        temperature,
        max_tokens:  maxTokens,
        stream:      false,
        ...(tools       && { tools }),
        ...(tool_choice && { tool_choice }),
      });
      const message = resp.choices?.[0]?.message;
      const text = message?.content?.trim() ?? "";
      return { text, message, provider: "groq" };
    } catch (err) {
      const status = err?.status ?? err?.response?.status;
      const shouldFallback = !status || status === 429 || status >= 500;
      if (!shouldFallback) throw err;
      console.warn(`[LLM] Groq failed (${status}), falling back to NVIDIA NIM:`, err.message);
    }
  }

  // --- Fallback: NVIDIA NIM ---
  if (!process.env.NVIDIA_API_KEY) {
    throw new Error("No LLM API keys configured. Set GROQ_API_KEY or NVIDIA_API_KEY in .env.local");
  }
  const client = makeClient("nvidia");
  const resp = await client.chat.completions.create({
    model:      NVIDIA_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream:     false,
    ...(tools       && { tools }),
    ...(tool_choice && { tool_choice }),
  });
  const message = resp.choices?.[0]?.message;
  const text = message?.content?.trim() ?? "";
  return { text, message, provider: "nvidia" };
}
