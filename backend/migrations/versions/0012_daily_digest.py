"""daily digest

Revision ID: 0012
Revises: 0011
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

NOTIFICATION_TYPES = (
    "'message', 'reminder', 'file', 'task', 'approval', 'report', 'event', 'mention'"
)


def upgrade() -> None:
    op.add_column(
        "notification_preferences",
        sa.Column(
            "email_frequency",
            sa.Enum(
                "instant",
                "daily",
                name="emailfrequency",
                native_enum=False,
                length=20,
                create_constraint=True,
            ),
            nullable=False,
            server_default="instant",
        ),
    )
    op.add_column(
        "users", sa.Column("digest_hour", sa.Integer(), nullable=False, server_default="8")
    )
    op.add_column("users", sa.Column("digest_last_sent_on", sa.Date(), nullable=True))
    op.create_table(
        "digest_items",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("link", sa.String(length=300), nullable=False),
        sa.Column("notification_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(f"type IN ({NOTIFICATION_TYPES})", name="notificationtype"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["notification_id"], ["notifications.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_digest_items_user_id", "digest_items", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_digest_items_user_id", table_name="digest_items")
    op.drop_table("digest_items")
    op.drop_column("users", "digest_last_sent_on")
    op.drop_column("users", "digest_hour")
    op.drop_column("notification_preferences", "email_frequency")
