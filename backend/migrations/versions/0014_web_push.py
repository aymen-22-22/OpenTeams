"""web push

Revision ID: 0014
Revises: 0013
"""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

PUSH_DEFAULT = "('message', 'mention', 'reminder', 'task', 'approval')"


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.add_column(
        "notification_preferences",
        sa.Column("push", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Saved preferences get the same push defaults as users who never changed anything.
    op.execute(f"UPDATE notification_preferences SET push = true WHERE type IN {PUSH_DEFAULT}")
    op.create_table(
        "push_subscriptions",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("endpoint", sa.String(length=1000), nullable=False),
        sa.Column("p256dh", sa.String(length=200), nullable=False),
        sa.Column("auth", sa.String(length=100), nullable=False),
        sa.Column("user_agent", sa.String(length=200), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])
    op.create_table(
        "push_queue",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("link", sa.String(length=300), nullable=False),
        sa.Column("force", sa.Boolean(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("push_queue")
    op.drop_index("ix_push_subscriptions_user_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
    op.drop_column("notification_preferences", "push")
