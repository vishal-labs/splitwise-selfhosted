"""settlement receiver confirmation + soft delete

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-11 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NULL pending = recorded before confirmations existed → treated as confirmed
    op.add_column('settlements', sa.Column('pending', sa.Boolean(), nullable=True))
    op.add_column('settlements', sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('settlements', sa.Column('confirmed_at', sa.DateTime(), nullable=True))
    op.add_column('settlements', sa.Column('deleted_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('settlements', 'deleted_at')
    op.drop_column('settlements', 'confirmed_at')
    op.drop_column('settlements', 'created_by')
    op.drop_column('settlements', 'pending')
