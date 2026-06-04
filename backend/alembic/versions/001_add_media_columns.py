"""Add image_url, video_url, media_urls to events table

Revision ID: 001_add_media_columns
Revises:
Create Date: 2026-03-10

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '001_add_media_columns'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('events', sa.Column('image_url', sa.Text(), nullable=True))
    op.add_column('events', sa.Column('video_url', sa.Text(), nullable=True))
    op.add_column('events', sa.Column('media_urls', JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('events', 'media_urls')
    op.drop_column('events', 'video_url')
    op.drop_column('events', 'image_url')
