import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    name: str
    kind: str
    size: int
    current_version: int
    updated_at: datetime


class DownloadUrl(BaseModel):
    url: str
    expires_in: int
