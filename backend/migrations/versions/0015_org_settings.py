"""organization settings (SMTP, branding, email texts)

Revision ID: 0015
Revises: 0014
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "org_settings",
        sa.Column("smtp_host", sa.String(length=255), nullable=False),
        sa.Column("smtp_port", sa.Integer(), nullable=False),
        sa.Column("smtp_security", sa.String(length=10), nullable=False),
        sa.Column("smtp_user", sa.String(length=255), nullable=False),
        sa.Column("smtp_password_enc", sa.Text(), nullable=False),
        sa.Column("mail_from", sa.String(length=320), nullable=False),
        sa.Column("brand_name", sa.String(length=120), nullable=False),
        sa.Column("brand_color", sa.String(length=7), nullable=False),
        sa.Column("brand_footer", sa.Text(), nullable=False),
        sa.Column("logo", sa.LargeBinary(), nullable=True),
        sa.Column("logo_type", sa.String(length=40), nullable=False),
        sa.Column("email_texts", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("org_settings")
