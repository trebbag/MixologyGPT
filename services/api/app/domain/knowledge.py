from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.knowledge import KnowledgeDocument
from app.domain.embeddings import text_to_embedding


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> List[str]:
    raw = (text or "").strip()
    if not raw:
        return []
    if chunk_size <= 0:
        return [raw]
    if overlap >= chunk_size:
        overlap = max(chunk_size // 4, 0)
    paragraphs = [p.strip() for p in raw.split("\n") if p.strip()]
    combined = "\n".join(paragraphs)
    if not combined:
        return []
    step = max(chunk_size - overlap, 1)
    chunks: List[str] = []
    for start in range(0, len(combined), step):
        chunk = combined[start : start + chunk_size].strip()
        if chunk:
            chunks.append(chunk)
        if start + chunk_size >= len(combined):
            break
    return chunks


async def search_knowledge_chunks(
    db: AsyncSession,
    query: str,
    limit: int = 3,
    source_type: Optional[str] = None,
    license: Optional[str] = None,
) -> List[KnowledgeDocument]:
    if not query:
        return []
    embedding = await text_to_embedding(query)
    distance = KnowledgeDocument.embedding.cosine_distance(embedding)
    stmt = select(KnowledgeDocument).where(KnowledgeDocument.embedding.isnot(None))
    if source_type:
        stmt = stmt.where(KnowledgeDocument.source_type == source_type)
    if license:
        stmt = stmt.where(KnowledgeDocument.license == license)
    stmt = stmt.order_by(distance).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())
