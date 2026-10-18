"""Add a YouTube video URL to learning lessons.

Revision ID: 0006_lesson_youtube_video
Revises: 0005_task_assignments
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0006_lesson_youtube_video"
down_revision = "0005_task_assignments"
branch_labels = None
depends_on = None


def upgrade():
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("lessons")}
    if "video_url" not in columns:
        op.add_column("lessons", sa.Column("video_url", sa.String(length=2048), nullable=True))


def downgrade():
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("lessons")}
    if "video_url" in columns:
        op.drop_column("lessons", "video_url")
