"""expense notes + soft delete, per-group simplify toggle, comment edits

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-11 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('expenses', sa.Column('notes', sa.String(length=2000), nullable=True))
    op.add_column('expenses', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.add_column('groups', sa.Column('simplify_debts', sa.Boolean(), nullable=True))
    op.add_column('comments', sa.Column('updated_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('comments', 'updated_at')
    op.drop_column('groups', 'simplify_debts')
    op.drop_column('expenses', 'deleted_at')
    op.drop_column('expenses', 'notes')
