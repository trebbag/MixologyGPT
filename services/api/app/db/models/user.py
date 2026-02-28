from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import Boolean, Column, String

from app.db.base import Base
from app.db.models.mixins import TimestampMixin


class User(SQLAlchemyBaseUserTableUUID, TimestampMixin, Base):
    __tablename__ = "users"

    role = Column(String, default="user", nullable=False)
    mfa_enabled = Column(Boolean, default=False, nullable=False)
    mfa_secret = Column(String, nullable=True)
