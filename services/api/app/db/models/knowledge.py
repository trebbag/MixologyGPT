from sqlalchemy import Column, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class KnowledgeDocument(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_documents"

    document_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    title = Column(String, nullable=True)
    source_url = Column(String, nullable=True)
    source_type = Column(String, nullable=True)
    license = Column(String, nullable=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    content_hash = Column(String, nullable=True, index=True)
    citations = Column(JSON, nullable=True)
    metadata_json = Column("metadata", JSON, nullable=True)
    embedding = Column(Vector(1536), nullable=True)
