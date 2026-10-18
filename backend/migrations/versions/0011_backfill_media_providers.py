"""Backfill provider metadata for existing learning media.

Revision ID: 0011_backfill_media_providers
Revises: 0010_multi_platform_media
"""
from alembic import op
import sqlalchemy as sa


revision = "0011_backfill_media_providers"
down_revision = "0010_multi_platform_media"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        sa.text(
            """
            UPDATE learning_media
            SET provider = CASE
                WHEN lower(video_url) LIKE '%youtube.com/watch%'
                  OR lower(video_url) LIKE '%youtube.com/shorts/%'
                  OR lower(video_url) LIKE '%youtube.com/embed/%'
                  OR lower(video_url) LIKE '%youtu.be/%' THEN 'youtube'
                WHEN lower(video_url) LIKE '%tiktok.com/%/video/%' THEN 'tiktok'
                WHEN lower(video_url) LIKE '%instagram.com/reel/%'
                  OR lower(video_url) LIKE '%instagram.com/p/%'
                  OR lower(video_url) LIKE '%instagram.com/tv/%' THEN 'instagram'
                WHEN lower(video_url) LIKE '%linkedin.com/posts/%'
                  OR lower(video_url) LIKE '%linkedin.com/feed/update/%' THEN 'linkedin'
                WHEN lower(video_url) LIKE '%.mp4%'
                  OR lower(video_url) LIKE '%.webm%'
                  OR lower(video_url) LIKE '%.ogg%' THEN 'direct'
                ELSE 'external'
            END
            """
        )
    )


def downgrade():
    raise RuntimeError(
        "This data migration is intentionally irreversible to preserve detected provider metadata."
    )
