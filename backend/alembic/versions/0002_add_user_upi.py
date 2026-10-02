"""add user upi payment info

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-03 10:24:04.930771

"""
from alembic import op
import sqlalchemy as sa


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('upi_id', sa.String(length=256), nullable=True))
    op.add_column('users', sa.Column('upi_qr_path', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'upi_qr_path')
    op.drop_column('users', 'upi_id')
