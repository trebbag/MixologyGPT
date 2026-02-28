import hashlib
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_active_user
from app.core.rate_limit import limiter
from app.db.models.knowledge import KnowledgeDocument
from app.db.models.user import User
from app.db.session import get_db
from app.domain.embeddings import text_to_embedding
from app.domain.knowledge import chunk_text
from app.schemas.knowledge import (
    KnowledgeIngestRequest,
    KnowledgeIngestResponse,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    KnowledgeSearchResult,
)


router = APIRouter()


@router.post("/ingest", response_model=KnowledgeIngestResponse)
@limiter.limit("10/minute")
async def ingest_knowledge(
    payload: KnowledgeIngestRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    if not payload.content.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Content is required")
    if payload.source_url and not payload.citations:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Citations required when source_url is provided",
        )
    if payload.chunk_overlap >= payload.chunk_size:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="chunk_overlap must be smaller than chunk_size",
        )

    chunks = chunk_text(payload.content, payload.chunk_size, payload.chunk_overlap)
    if not chunks:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No content to ingest")

    content_hash = hashlib.sha256(payload.content.encode("utf-8")).hexdigest()
    existing = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.content_hash == content_hash)
    )
    existing_doc = existing.scalars().first()
    if existing_doc:
        return KnowledgeIngestResponse(document_id=existing_doc.document_id, chunks=0)

    document_id = uuid.uuid4()
    citations = [c.model_dump() for c in payload.citations] if payload.citations else None
    for index, chunk in enumerate(chunks):
        embedding = await text_to_embedding(chunk)
        row = KnowledgeDocument(
            document_id=document_id,
            title=payload.title,
            source_url=payload.source_url,
            source_type=payload.source_type,
            license=payload.license,
            chunk_index=index,
            content=chunk,
            content_hash=content_hash,
            citations=citations,
            metadata_json=payload.metadata,
            embedding=embedding,
        )
        db.add(row)
    await db.commit()
    return KnowledgeIngestResponse(document_id=document_id, chunks=len(chunks))


@router.post("/search", response_model=KnowledgeSearchResponse)
@limiter.limit("60/minute")
async def search_knowledge(
    payload: KnowledgeSearchRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    if not payload.query.strip():
        return KnowledgeSearchResponse(results=[])
    query_embedding = await text_to_embedding(payload.query)
    distance = KnowledgeDocument.embedding.cosine_distance(query_embedding)
    query = select(KnowledgeDocument, distance.label("distance")).where(KnowledgeDocument.embedding.isnot(None))
    if payload.source_type:
        query = query.where(KnowledgeDocument.source_type == payload.source_type)
    if payload.license:
        query = query.where(KnowledgeDocument.license == payload.license)
    if payload.document_id:
        query = query.where(KnowledgeDocument.document_id == payload.document_id)
    result = await db.execute(query.order_by(distance).limit(payload.limit))
    results = []
    for doc, dist in result.all():
        score = None
        if dist is not None:
            try:
                score = float(1.0 - dist)
            except Exception:
                score = None
        results.append(
            KnowledgeSearchResult(
                document_id=doc.document_id,
                chunk_id=doc.id,
                title=doc.title,
                source_url=doc.source_url,
                source_type=doc.source_type,
                license=doc.license,
                content=doc.content,
                citations=doc.citations,
                score=score,
            )
        )
    return KnowledgeSearchResponse(results=results)


@router.get("/licenses/report")
async def license_report(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    result = await db.execute(select(KnowledgeDocument.license))
    counts: dict[str, int] = {}
    missing = 0
    for (license_name,) in result.all():
        if not license_name:
            missing += 1
            continue
        counts[license_name] = counts.get(license_name, 0) + 1
    return {"by_license": counts, "missing": missing}
