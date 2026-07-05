import os
import httpx
from dotenv import load_dotenv

# Load env variables from root folder
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local')
load_dotenv(dotenv_path)

NVIDIA_EMBED_BASE = "https://integrate.api.nvidia.com/v1"
EMBED_MODEL       = "nvidia/nv-embedqa-e5-v5"

async def embed_text(text: str, input_type: str = "query") -> list:
    """Embed a single text string."""
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        raise ValueError("NVIDIA_API_KEY is not configured in .env.local")
        
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{NVIDIA_EMBED_BASE}/embeddings",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            json={
                "model": EMBED_MODEL,
                "input": [text],
                "input_type": input_type,
                "encoding_format": "float",
                "truncate": "END"
            },
            timeout=30.0
        )
        if resp.status_code != 200:
            raise ValueError(f"NVIDIA Embedding API error {resp.status_code}: {resp.text}")
        data = resp.json()
        return data.get("data", [{}])[0].get("embedding", [])

async def embed_batch(texts: list, input_type: str = "passage") -> list:
    """Embed a batch of text strings."""
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        raise ValueError("NVIDIA_API_KEY is not configured in .env.local")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{NVIDIA_EMBED_BASE}/embeddings",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            json={
                "model": EMBED_MODEL,
                "input": texts,
                "input_type": input_type,
                "encoding_format": "float",
                "truncate": "END"
            },
            timeout=30.0
        )
        if resp.status_code != 200:
            raise ValueError(f"NVIDIA Embedding API error {resp.status_code}: {resp.text}")
        data = resp.json()
        return [item.get("embedding", []) for item in data.get("data", [])]
