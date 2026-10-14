"""Add single-use member invitations.

Revision ID: 0002_member_invitations
Revises: 0001_add_roles_quizzes_tasks
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_member_invitations"
down_revision = "0001_add_roles_quizzes_tasks"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "invitations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("invited_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_invitations_email", "invitations", ["email"])


def downgrade():
    op.drop_index("ix_invitations_email", table_name="invitations")
    op.drop_table("invitations")
