"""Add searchable courses and managed learning media.

Revision ID: 0008_learning_catalog
Revises: 0007_winner_announcements
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0008_learning_catalog"
down_revision = "0007_winner_announcements"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    path_columns = {column["name"] for column in inspector.get_columns("learning_paths")}
    additions = (
        ("category", sa.String(length=120), "Backend Development"),
        ("thumbnail_url", sa.String(length=2048), None),
        ("instructor", sa.String(length=160), ""),
        ("duration_minutes", sa.Integer(), "0"),
    )
    for name, column_type, default in additions:
        if name not in path_columns:
            column = sa.Column(name, column_type, nullable=name == "thumbnail_url")
            if default is not None:
                column = sa.Column(
                    name, column_type, nullable=False, server_default=default
                )
            op.add_column("learning_paths", column)

    paths = sa.table(
        "learning_paths",
        sa.column("slug", sa.String),
        sa.column("category", sa.String),
    )
    for slug, category in (
        ("python", "Python Backend"),
        ("node", "JavaScript Backend"),
        ("typescript", "TypeScript & NestJS"),
        ("java", "Java & Spring Boot"),
    ):
        bind.execute(
            paths.update()
            .where(paths.c.slug == slug)
            .where(paths.c.category == "Backend Development")
            .values(category=category)
        )

    if "learning_media" not in inspector.get_table_names():
        op.create_table(
            "learning_media",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("kind", sa.String(length=20), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("caption", sa.Text(), nullable=False, server_default=""),
            sa.Column("category", sa.String(length=120), nullable=False),
            sa.Column("thumbnail_url", sa.String(length=2048), nullable=True),
            sa.Column("video_url", sa.String(length=2048), nullable=False),
            sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("difficulty", sa.String(length=20), nullable=False, server_default="BEGINNER"),
            sa.Column("instructor", sa.String(length=160), nullable=False, server_default=""),
            sa.Column("creator", sa.String(length=160), nullable=False, server_default=""),
            sa.Column("notes", sa.Text(), nullable=False, server_default=""),
            sa.Column("resources", sa.JSON(), nullable=False),
            sa.Column("tags", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="DRAFT"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_learning_media_kind", "learning_media", ["kind"])
        op.create_index("ix_learning_media_category", "learning_media", ["category"])
        op.create_index("ix_learning_media_status", "learning_media", ["status"])


def downgrade():
    raise RuntimeError(
        "This migration is intentionally irreversible to avoid deleting managed learning content."
    )
