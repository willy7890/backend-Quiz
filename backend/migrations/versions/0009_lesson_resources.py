"""Add explicit course lesson code and resource fields.

Revision ID: 0009_lesson_resources
Revises: 0008_learning_catalog
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0009_lesson_resources"
down_revision = "0008_learning_catalog"
branch_labels = None
depends_on = None


def upgrade():
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("lessons")}
    if "code_example" not in columns:
        op.add_column(
            "lessons",
            sa.Column("code_example", sa.Text(), nullable=False, server_default=""),
        )
    if "resources" not in columns:
        op.add_column(
            "lessons",
            sa.Column("resources", sa.JSON(), nullable=False, server_default="[]"),
        )


def downgrade():
    raise RuntimeError(
        "This migration is intentionally irreversible to avoid deleting lesson data."
    )
