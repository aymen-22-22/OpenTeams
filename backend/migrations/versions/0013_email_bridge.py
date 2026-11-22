"""email bridge

Revision ID: 0013
Revises: 0012
"""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("email_token", sa.String(length=32), nullable=True))
    op.create_unique_constraint("uq_conversations_email_token", "conversations", ["email_token"])
    op.add_column(
        "messages",
        sa.Column("via_email", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "inbound_emails",
        sa.Column("message_key", sa.String(length=64), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "posted",
                "rejected",
                name="inboundstatus",
                native_enum=False,
                length=20,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("reason", sa.String(length=40), nullable=False),
        sa.Column("sender_id", sa.Uuid(), nullable=True),
        sa.Column("conversation_id", sa.Uuid(), nullable=True),
        sa.Column("message_id", sa.Uuid(), nullable=True),
        sa.Column("attachments", sa.Integer(), nullable=False),
        sa.Column("skipped_attachments", sa.Integer(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_key", name="uq_inbound_emails_message_key"),
    )


def downgrade() -> None:
    op.drop_table("inbound_emails")
    op.drop_column("messages", "via_email")
    op.drop_constraint("uq_conversations_email_token", "conversations", type_="unique")
    op.drop_column("conversations", "email_token")
