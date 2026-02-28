import uuid
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class KnowledgeCitation(BaseModel):
    url: str
    note: Optional[str] = None


class KnowledgeIngestRequest(BaseModel):
    title: Optional[str] = None
    source_url: Optional[str] = None
    source_type: Optional[str] = None
    license: Optional[str] = None
    content: str
    citations: Optional[List[KnowledgeCitation]] = None
    metadata: Optional[Dict[str, Any]] = None
    chunk_size: int = Field(800, ge=200, le=4000)
    chunk_overlap: int = Field(100, ge=0, le=1000)


class KnowledgeIngestResponse(BaseModel):
    document_id: uuid.UUID
    chunks: int


class KnowledgeSearchRequest(BaseModel):
    query: str
    limit: int = Field(5, ge=1, le=20)
    source_type: Optional[str] = None
    license: Optional[str] = None
    document_id: Optional[uuid.UUID] = None


class KnowledgeSearchResult(BaseModel):
    document_id: uuid.UUID
    chunk_id: uuid.UUID
    title: Optional[str] = None
    source_url: Optional[str] = None
    source_type: Optional[str] = None
    license: Optional[str] = None
    content: str
    citations: Optional[List[KnowledgeCitation]] = None
    score: Optional[float] = None


class KnowledgeSearchResponse(BaseModel):
    results: List[KnowledgeSearchResult]
