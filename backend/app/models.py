"""Import every model here so Alembic sees them all."""

from app.admin.models import AuditLog
from app.ai.models import AIAuditLog, AIConversation, AIMessage, AIProfile
from app.auth.models import Session
from app.chat.events import RealtimeEvent
from app.chat.models import Conversation, ConversationMember, Message, MessageRead, Pin
from app.files.models import File, FileVersion
from app.tasks.models import Task, TaskEvent
from app.users.models import Team, TeamMember, User

__all__ = [
    "AIAuditLog",
    "AIConversation",
    "AIMessage",
    "AIProfile",
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
    "Task",
    "TaskEvent",
    "Team",
    "TeamMember",
    "User",
]
