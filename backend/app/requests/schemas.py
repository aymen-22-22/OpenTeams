import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.requests.models import RequestKind, RequestStatus

LeaveType = Literal["paid", "unpaid", "sick", "other"]


class RequestIn(BaseModel):
    kind: RequestKind
    title: str = Field(min_length=1, max_length=200)
    comment: str = Field(default="", max_length=5000)
    approver_id: uuid.UUID
    # leave
    start_date: date | None = None
    end_date: date | None = None
    leave_type: LeaveType | None = None
    # expense
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    currency: str = Field(default="EUR", pattern="^[A-Z]{3}$")

    @model_validator(mode="after")
    def _kind_fields(self) -> "RequestIn":
        if self.kind == RequestKind.LEAVE:
            if not (self.start_date and self.end_date and self.leave_type):
                raise ValueError("leave needs start_date, end_date and leave_type")
            if self.end_date < self.start_date:
                raise ValueError("end_date must not be before start_date")
        if self.kind == RequestKind.EXPENSE and self.amount is None:
            raise ValueError("expense needs an amount")
        return self


class StepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    actor_id: uuid.UUID | None
    action: str
    comment: str
    created_at: datetime


class RequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    requester_id: uuid.UUID
    approver_id: uuid.UUID | None
    kind: RequestKind
    title: str
    comment: str
    details: dict[str, object]
    status: RequestStatus
    decided_at: datetime | None
    decision_comment: str
    created_at: datetime
    steps: list[StepOut] = []


class DecisionIn(BaseModel):
    comment: str = Field(default="", max_length=2000)


class ApproverOut(BaseModel):
    id: uuid.UUID
    display_name: str
