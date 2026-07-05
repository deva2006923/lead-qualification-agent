import os
import asyncio
from pinecone import Pinecone
from dotenv import load_dotenv

# Load env variables from root folder
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local')
load_dotenv(dotenv_path)

_client = None
_index = None

def get_client() -> Pinecone:
    global _client
    if _client is None:
        api_key = os.getenv("PINECONE_API_KEY")
        if not api_key:
            raise ValueError("PINECONE_API_KEY is not configured in .env.local")
        _client = Pinecone(api_key=api_key)
    return _client

def get_index():
    global _index
    if _index is None:
        index_name = os.getenv("PINECONE_INDEX_NAME") or "sales-leads-kb"
        _index = get_client().Index(index_name)
    return _index

async def query_index(vector: list, top_k: int = 5) -> list:
    """Query Pinecone index asynchronously in a worker thread."""
    index = get_index()
    
    def run_query():
        return index.query(
            vector=vector,
            top_k=top_k,
            include_metadata=True
        )
        
    result = await asyncio.to_thread(run_query)
    matches = result.get("matches") or []
    
    parsed = []
    for m in matches:
        metadata = m.get("metadata") or {}
        parsed.append({
            "text": metadata.get("text") or "",
            "source": metadata.get("source") or "unknown",
            "score": m.get("score") or 0.0
        })
    return parsed
