"""Store detected media providers and video examples.

Revision ID: 0010_multi_platform_media
Revises: 0009_lesson_resources
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0010_multi_platform_media"
down_revision = "0009_lesson_resources"
branch_labels = None
depends_on = None


def upgrade():
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("learning_media")}
    if "provider" not in columns:
        op.add_column(
            "learning_media",
            sa.Column("provider", sa.String(length=24), nullable=False, server_default="external"),
        )
    if "code_example" not in columns:
        op.add_column(
            "learning_media",
            sa.Column("code_example", sa.Text(), nullable=False, server_default=""),
        )
def downgrade():
    raise RuntimeError(
        "This migration is intentionally irreversible to preserve provider metadata and examples."
    )
