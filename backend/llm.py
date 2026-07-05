import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

# Load env variables from root folder
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local')
load_dotenv(dotenv_path)

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
GROQ_BASE_URL   = "https://api.groq.com/openai/v1"

NVIDIA_MODEL = "meta/llama-3.3-70b-instruct"
GROQ_MODEL   = "llama-3.3-70b-versatile"

def make_async_client(provider: str) -> AsyncOpenAI:
    if provider == "nvidia":
        return AsyncOpenAI(
            api_key=os.getenv("NVIDIA_API_KEY"),
            base_url=NVIDIA_BASE_URL
        )
    return AsyncOpenAI(
        api_key=os.getenv("GROQ_API_KEY"),
        base_url=GROQ_BASE_URL
    )

async def call_llm(messages: list, temperature: float = 0.4, max_tokens: int = 1024, tools: list = None, tool_choice = None):
    """
    Call LLM using Groq as primary, falling back to NVIDIA NIM.
    Both providers are OpenAI SDK compatible.
    """
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        try:
            client = make_async_client("groq")
            params = {
                "model": GROQ_MODEL,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            if tools:
                params["tools"] = tools
            if tool_choice:
                params["tool_choice"] = tool_choice
                
            resp = await client.chat.completions.create(**params)
            message = resp.choices[0].message
            text = message.content.strip() if message.content else ""
            return {"text": text, "message": message, "provider": "groq"}
        except Exception as err:
            status = getattr(err, "status_code", None)
            should_fallback = status is None or status == 429 or status >= 500
            if not should_fallback:
                raise err
            print(f"[LLM] Groq failed, falling back to NVIDIA NIM: {err}")

    # Fallback to NVIDIA NIM
    nvidia_key = os.getenv("NVIDIA_API_KEY")
    if not nvidia_key:
        raise ValueError("No LLM API keys configured. Set GROQ_API_KEY or NVIDIA_API_KEY in .env.local")
        
    client = make_async_client("nvidia")
    params = {
        "model": NVIDIA_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens
    }
    if tools:
        params["tools"] = tools
    if tool_choice:
        params["tool_choice"] = tool_choice
        
    resp = await client.chat.completions.create(**params)
    message = resp.choices[0].message
    text = message.content.strip() if message.content else ""
    return {"text": text, "message": message, "provider": "nvidia"}
