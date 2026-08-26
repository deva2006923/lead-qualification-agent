import OpenAI from "openai";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/** Detect which provider to use, based on which keys are actually set. */
function getProviderAndKey() {
  if (process.env.GEMINI_API_KEY) {
    return { provider: "gemini", apiKey: process.env.GEMINI_API_KEY };
  }

  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", apiKey: process.env.OPENAI_API_KEY };
  }

  if (process.env.NVIDIA_API_KEY) {
    return { provider: "nvidia", apiKey: process.env.NVIDIA_API_KEY };
  }

  return { provider: null, apiKey: null };
}

/** Create an OpenAI-compatible client for NVIDIA NIM. */
function makeNvidiaClient() {
  return new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: NVIDIA_BASE_URL,
  });
}

/** Convert OpenAI-style messages array into Gemini's `contents` format. */
function mapOpenAiToGemini(openaiMessages) {
  let systemInstructionText = "";
  const contents = [];

  for (const msg of openaiMessages) {
    if (msg.role === "system") {
      systemInstructionText += msg.content + "\n";
      continue;
    }

    const role = msg.role === "assistant" ? "model" : "user";
    const text = msg.content || "";

    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      // Merge consecutive messages with the same role
      contents[contents.length - 1].parts[0].text += "\n\n" + text;
    } else {
      contents.push({
        role,
        parts: [{ text }],
      });
    }
  }

  // Gemini requires the conversation to start with a 'user' turn.
  if (contents.length > 0 && contents[0].role === "model") {
    contents.unshift({
      role: "user",
      parts: [{ text: "Hello" }],
    });
  }

  return {
    contents,
    ...(systemInstructionText && {
      systemInstruction: {
        parts: [{ text: systemInstructionText.trim() }],
      },
    }),
  };
}

async function callGemini(messages, { temperature, maxTokens, apiKey }) {
  console.log(`[LLM] Calling Gemini with model: ${GEMINI_MODEL}`);
  const mapped = mapOpenAiToGemini(messages);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: mapped.contents,
          ...(mapped.systemInstruction && { systemInstruction: mapped.systemInstruction }),
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        }),
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Gemini generateContent error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!text) {
      console.warn("[LLM] Gemini returned an empty response:", JSON.stringify(data));
    }

    return {
      text,
      message: { role: "assistant", content: text },
      provider: "gemini",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callOpenAI(messages, { temperature, maxTokens, apiKey, tools, tool_choice }) {
  console.log(`[LLM] Calling OpenAI with model: ${OPENAI_MODEL}`);
  const client = new OpenAI({ apiKey });
  const resp = await client.chat.completions.create(
    {
      model: OPENAI_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      ...(tools && { tools }),
      ...(tool_choice && { tool_choice }),
    },
    { timeout: 12000 }
  );
  const message = resp.choices?.[0]?.message;
  const text = message?.content?.trim() ?? "";
  return { text, message, provider: "openai" };
}

async function callNvidia(messages, { temperature, maxTokens, tools, tool_choice }) {
  console.log(`[LLM] Calling NVIDIA NIM with model: ${NVIDIA_MODEL}`);
  const client = makeNvidiaClient();
  const resp = await client.chat.completions.create(
    {
      model: NVIDIA_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      ...(tools && { tools }),
      ...(tool_choice && { tool_choice }),
    },
    { timeout: 12000 }
  );
  const message = resp.choices?.[0]?.message;
  const text = message?.content?.trim() ?? "";
  return { text, message, provider: "nvidia" };
}

/**
 * Call the LLM. Primary provider is Gemini. Falls back to OpenAI or NVIDIA
 * ONLY if those keys are explicitly set — there is no silent fallback.
 *
 * @param {Array}  messages - OpenAI-style chat messages array
 * @param {Object} options  - { temperature, maxTokens, tools, tool_choice }
 * @returns {{ text: string, message: object, provider: string }}
 */
export async function callLLM(
  messages,
  { temperature = 0.4, maxTokens = 1024, tools, tool_choice } = {}
) {
  const { provider, apiKey } = getProviderAndKey();

  if (!provider) {
    throw new Error(
      "No LLM API key configured. Please set GEMINI_API_KEY (preferred), OPENAI_API_KEY, or NVIDIA_API_KEY in your environment variables."
    );
  }

  try {
    if (provider === "gemini") {
      return await callGemini(messages, { temperature, maxTokens, apiKey });
    }
    if (provider === "openai") {
      return await callOpenAI(messages, { temperature, maxTokens, apiKey, tools, tool_choice });
    }
    if (provider === "nvidia") {
      return await callNvidia(messages, { temperature, maxTokens, tools, tool_choice });
    }
  } catch (err) {
    console.error(`[LLM] ${provider} call failed:`, err.message);
    throw new Error(`LLM call failed (${provider}): ${err.message}`);
  }
}