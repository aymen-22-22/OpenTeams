"""Import every model here so Alembic sees them all."""

from app.admin.models import AuditLog
from app.auth.models import Session
from app.chat.events import RealtimeEvent
from app.chat.models import Conversation, ConversationMember, Message, MessageRead, Pin
from app.files.models import File, FileVersion
from app.users.models import Team, TeamMember, User

__all__ = [
    "AuditLog",
    "Conversation",
    "ConversationMember",
    "File",
    "FileVersion",
    "Message",
    "MessageRead",
    "Pin",
    "RealtimeEvent",
    "Session",
    "Team",
    "TeamMember",
    "User",
]
