"""add original filenames

Revision ID: a61c9c7311d2
Revises: b894e3b6a753
"""

from alembic import op
import sqlalchemy as sa


revision = "a61c9c7311d2"
down_revision = "b894e3b6a753"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("models", sa.Column("original_filename", sa.String(), nullable=True))
    op.add_column("datasets", sa.Column("original_filename", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("datasets", "original_filename")
    op.drop_column("models", "original_filename")
