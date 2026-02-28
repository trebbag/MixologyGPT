from sqlalchemy import Column, DateTime, String, Text

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class SystemJob(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "system_jobs"

    name = Column(String, nullable=False, unique=True, index=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_status = Column(String, nullable=True)
    last_message = Column(Text, nullable=True)
