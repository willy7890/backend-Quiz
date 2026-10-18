"""Persist official quiz winner announcements.

Revision ID: 0007_winner_announcements
Revises: 0006_lesson_youtube_video
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0007_winner_announcements"
down_revision = "0006_lesson_youtube_video"
branch_labels = None
depends_on = None


def upgrade():
    inspector = inspect(op.get_bind())
    quiz_columns = {column["name"] for column in inspector.get_columns("quizzes")}
    if "closed_at" not in quiz_columns:
        op.add_column("quizzes", sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True))

    if "winner_announcements" not in inspector.get_table_names():
        op.create_table(
            "winner_announcements",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("quiz_id", sa.Integer(), sa.ForeignKey("quizzes.id"), nullable=False),
            sa.Column("winner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("final_score", sa.Integer(), nullable=False),
            sa.Column("winner_total_points", sa.Integer(), nullable=False),
            sa.Column("computer_reward_points", sa.Integer(), nullable=False),
            sa.Column("computers_earned", sa.Integer(), nullable=False),
            sa.Column("ranking", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("tie_breaking_rule", sa.String(length=200), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="PUBLISHED"),
            sa.Column("result_period_start", sa.DateTime(timezone=True), nullable=True),
            sa.Column("result_period_end", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("quiz_id", name="one_winner_announcement_per_quiz"),
        )
        op.create_index("ix_winner_announcements_quiz_id", "winner_announcements", ["quiz_id"])
        op.create_index("ix_winner_announcements_winner_user_id", "winner_announcements", ["winner_user_id"])


def downgrade():
    if "winner_announcements" in inspect(op.get_bind()).get_table_names():
        op.drop_index("ix_winner_announcements_winner_user_id", table_name="winner_announcements")
        op.drop_index("ix_winner_announcements_quiz_id", table_name="winner_announcements")
        op.drop_table("winner_announcements")
    quiz_columns = {column["name"] for column in inspect(op.get_bind()).get_columns("quizzes")}
    if "closed_at" in quiz_columns:
        op.drop_column("quizzes", "closed_at")
