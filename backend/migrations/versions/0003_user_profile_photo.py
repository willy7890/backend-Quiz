"""Add optional user profile photo data.

Revision ID: 0003_user_profile_photo
Revises: 0002_member_invitations
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0003_user_profile_photo"
down_revision = "0002_member_invitations"
branch_labels = None
depends_on = None

def upgrade():
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("users")}
    if "avatar_data" not in columns:
        op.add_column("users", sa.Column("avatar_data", sa.Text(), nullable=True))

def downgrade():
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("users")}
    if "avatar_data" in columns:
        op.drop_column("users", "avatar_data")
