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

const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct";
const GROQ_MODEL   = process.env.GROQ_MODEL   || "llama-3.3-70b-versatile";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

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
 * Call the LLM — tries Gemini/OpenAI/NVIDIA first, falls back to Groq.
 *
 * @param {Array}  messages  - OpenAI chat messages array
 * @param {Object} options   - { temperature, maxTokens, tools, tool_choice }
 * @returns {{ text: string, message: object, provider: string }}
 */
export async function callLLM(messages, { temperature = 0.4, maxTokens = 1024, tools, tool_choice } = {}) {
  let nvidiaError = null;
  let openAIError = null;
  let geminiError = null;

  const { provider, apiKey } = getProviderAndKey();

  // --- Primary 1: Gemini ---
  if (provider === "gemini") {
    try {
      console.log(`[LLM] Attempting Gemini call with model: ${GEMINI_MODEL}`);
      const client = new OpenAI({
        apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      });
      const resp = await client.chat.completions.create({
        model:      GEMINI_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream:     false,
        ...(tools       && { tools }),
        ...(tool_choice && { tool_choice }),
      }, {
        timeout: 12000 // 12 seconds timeout
      });
      const message = resp.choices?.[0]?.message;
      const text = message?.content?.trim() ?? "";
      return { text, message, provider: "gemini" };
    } catch (err) {
      geminiError = err;
      console.error(`[LLM] Gemini failed:`, err.message);
      
      // If no other provider is configured, fail immediately
      if (!process.env.GROQ_API_KEY && (!process.env.NVIDIA_API_KEY || apiKey === process.env.NVIDIA_API_KEY || apiKey === process.env.OPENAI_API_KEY)) {
        throw err;
      }
    }
  }

  // --- Primary 2: OpenAI ---
  if (provider === "openai") {
    try {
      console.log(`[LLM] Attempting OpenAI call with model: ${OPENAI_MODEL}`);
      const client = new OpenAI({ apiKey });
      const resp = await client.chat.completions.create({
        model:      OPENAI_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream:     false,
        ...(tools       && { tools }),
        ...(tool_choice && { tool_choice }),
      }, {
        timeout: 12000 // 12 seconds timeout
      });
      const message = resp.choices?.[0]?.message;
      const text = message?.content?.trim() ?? "";
      return { text, message, provider: "openai" };
    } catch (err) {
      openAIError = err;
      console.error(`[LLM] OpenAI failed:`, err.message);
      
      // If no other provider is configured, fail immediately
      if (!process.env.GROQ_API_KEY && (!process.env.NVIDIA_API_KEY || apiKey === process.env.NVIDIA_API_KEY)) {
        throw err;
      }
    }
  }

  // --- Secondary: NVIDIA NIM ---
  if (process.env.NVIDIA_API_KEY && provider !== "gemini" && provider !== "openai") {
    try {
      console.log(`[LLM] Attempting NVIDIA NIM call with model: ${NVIDIA_MODEL}`);
      const client = makeClient("nvidia");
      const resp = await client.chat.completions.create({
        model:      NVIDIA_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream:     false,
        ...(tools       && { tools }),
        ...(tool_choice && { tool_choice }),
      }, {
        timeout: 12000 // 12 seconds timeout
      });
      const message = resp.choices?.[0]?.message;
      const text = message?.content?.trim() ?? "";
      return { text, message, provider: "nvidia" };
    } catch (err) {
      nvidiaError = err;
      console.error(`[LLM] NVIDIA NIM failed:`, err.message);
    }
  }

  // --- Fallback: Groq ---
  if (process.env.GROQ_API_KEY) {
    const modelsToTry = [
      GROQ_MODEL,
      "llama-3.3-70b-specdec",
      "llama-3.1-8b-instant",
    ];

    // Remove duplicates while preserving order
    const uniqueModels = [...new Set(modelsToTry)];

    for (const model of uniqueModels) {
      try {
        console.log(`[LLM] Attempting Groq fallback call with model: ${model}`);
        const client = makeClient("groq");
        const resp = await client.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens:  maxTokens,
          stream:      false,
          ...(tools       && { tools }),
          ...(tool_choice && { tool_choice }),
        }, {
          timeout: 12000 // 12 seconds timeout
        });
        const message = resp.choices?.[0]?.message;
        const text = message?.content?.trim() ?? "";
        return { text, message, provider: "groq" };
      } catch (err) {
        const status = err?.status ?? err?.response?.status;
        console.warn(`[LLM] Groq failed for model ${model} with status ${status}:`, err.message);
        
        if (status === 401 || status === 403 || status === 429 || status >= 500) {
          break;
        }
      }
    }
  }

  // If all failed or are not configured
  const lastError = geminiError || openAIError || nvidiaError;
  if (lastError) {
    throw new Error(`LLM call failed. Error: ${lastError.message}. Groq fallback: ${process.env.GROQ_API_KEY ? "failed" : "not configured"}`);
  }

  throw new Error("No LLM API keys configured. Please set NVIDIA_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY in environment variables.");
}
