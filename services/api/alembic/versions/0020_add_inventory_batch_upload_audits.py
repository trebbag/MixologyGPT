"""add inventory batch upload audits

Revision ID: 0020_add_inventory_batch_upload_audits
Revises: 0019_add_studio_perf_indexes
Create Date: 2026-03-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0020_add_inventory_batch_upload_audits"
down_revision = "0019_add_studio_perf_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inventory_batch_upload_audits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_email", sa.String(), nullable=False),
        sa.Column("ingredient_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("inventory_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("inventory_lot_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("source_name", sa.String(), nullable=False),
        sa.Column("canonical_name", sa.String(), nullable=False),
        sa.Column("row_status", sa.String(), nullable=False),
        sa.Column("import_action", sa.String(), nullable=False),
        sa.Column("import_result", sa.String(), nullable=True),
        sa.Column("review_status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("missing_fields", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("notes", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("source_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("resolved_payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["ingredient_id"], ["ingredients.id"]),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"]),
        sa.ForeignKeyConstraint(["inventory_lot_id"], ["inventory_lots.id"]),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"]),
    )
    op.create_index(
        "ix_inventory_batch_upload_audits_user_id",
        "inventory_batch_upload_audits",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_batch_upload_audits_ingredient_id",
        "inventory_batch_upload_audits",
        ["ingredient_id"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_batch_upload_audits_inventory_item_id",
        "inventory_batch_upload_audits",
        ["inventory_item_id"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_batch_upload_audits_inventory_lot_id",
        "inventory_batch_upload_audits",
        ["inventory_lot_id"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_batch_upload_audits_reviewed_by_user_id",
        "inventory_batch_upload_audits",
        ["reviewed_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_batch_upload_audits_review_status",
        "inventory_batch_upload_audits",
        ["review_status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_inventory_batch_upload_audits_review_status", table_name="inventory_batch_upload_audits")
    op.drop_index("ix_inventory_batch_upload_audits_reviewed_by_user_id", table_name="inventory_batch_upload_audits")
    op.drop_index("ix_inventory_batch_upload_audits_inventory_lot_id", table_name="inventory_batch_upload_audits")
    op.drop_index("ix_inventory_batch_upload_audits_inventory_item_id", table_name="inventory_batch_upload_audits")
    op.drop_index("ix_inventory_batch_upload_audits_ingredient_id", table_name="inventory_batch_upload_audits")
    op.drop_index("ix_inventory_batch_upload_audits_user_id", table_name="inventory_batch_upload_audits")
    op.drop_table("inventory_batch_upload_audits")
