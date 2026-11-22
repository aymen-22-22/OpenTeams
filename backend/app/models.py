"""Import every model here so Alembic sees them all."""

from app.admin.models import AuditLog
from app.ai.models import AIAuditLog, AIConversation, AIMessage, AIProfile
from app.auth.models import Session
from app.bridge.models import InboundEmail
from app.calendar.models import CalendarEvent, EventAttendee
from app.chat.events import RealtimeEvent
from app.chat.models import Conversation, ConversationMember, Message, MessageRead, Pin
from app.files.models import File, FileVersion
from app.playbooks.models import Playbook, PlaybookRun
from app.projects.models import Milestone, Project, ProjectMember
from app.reminders.models import (
    DigestItem,
    EmailOutbox,
    Notification,
    NotificationPreference,
    Reminder,
)
from app.requests.models import Request, RequestStep
from app.tasks.models import Task, TaskEvent
from app.users.models import Team, TeamMember, User

__all__ = [
    "DigestItem",
    "InboundEmail",
    "CalendarEvent",
    "EventAttendee",
    "EmailOutbox",
    "Notification",
    "NotificationPreference",
    "Reminder",
    "Request",
    "RequestStep",
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
    "Milestone",
    "MessageRead",
    "Pin",
    "Playbook",
    "Project",
    "ProjectMember",
    "PlaybookRun",
    "RealtimeEvent",
    "Session",
    "Task",
    "TaskEvent",
    "Team",
    "TeamMember",
    "User",
]
