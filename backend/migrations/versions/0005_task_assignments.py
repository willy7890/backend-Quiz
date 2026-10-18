"""Add assignment requirements, difficulty, and publication status.

Revision ID: 0005_task_assignments
Revises: 0004_learning_content
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0005_task_assignments"
down_revision = "0004_learning_content"
branch_labels = None
depends_on = None


def upgrade():
    inspector = inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("tasks")}
    if "requirements" not in columns:
        op.add_column("tasks", sa.Column("requirements", sa.Text(), nullable=False, server_default=""))
    if "difficulty" not in columns:
        op.add_column("tasks", sa.Column("difficulty", sa.String(20), nullable=False, server_default="BEGINNER"))
    if "is_published" not in columns:
        op.add_column("tasks", sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade():
    op.drop_column("tasks", "is_published")
    op.drop_column("tasks", "difficulty")
    op.drop_column("tasks", "requirements")
