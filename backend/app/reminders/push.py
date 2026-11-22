"""Web push: devices subscribe, notify() queues, a job sends through the browsers' push services.

Payloads are encrypted for the device (aes128gcm); push services only see ciphertext.
"""

import asyncio
import base64
import json
import logging
from datetime import datetime, timedelta
from typing import Annotated, Any
from urllib.parse import urlsplit

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import APIRouter, Header
from pywebpush import WebPushException, webpush  # type: ignore[import-untyped]
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import DB, CurrentUser
from app.core import clock
from app.core.db import SessionLocal
from app.core.errors import AppError
from app.core.settings import get_settings
from app.reminders.models import PushItem, PushSubscription
from app.reminders.schemas import PushConfig, PushEndpoint, PushSubscriptionIn
from app.users import presence

logger = logging.getLogger(__name__)

router = APIRouter(tags=["push"])

MAX_DEVICES = 10  # per user; the oldest is dropped
MAX_AGE = timedelta(minutes=10)  # a late alert is worse than none
PUSH_TTL_SECONDS = 600  # how long a push service keeps it for an offline device

# Replaced by a fake in tests (it receives the same arguments as pywebpush.webpush).
send = webpush


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def generate_vapid_keys() -> tuple[str, str]:
    """(public, private), both base64url: the public key goes to browsers, the private stays."""
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_numbers().private_value.to_bytes(32, "big")
    public = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return _b64(public), _b64(private)


def endpoint_allowed(endpoint: str) -> bool:
    """Only HTTPS endpoints of known push services: the server must never be made to call
    an arbitrary (e.g. internal) address."""
    parts = urlsplit(endpoint)
    host = (parts.hostname or "").lower()
    return parts.scheme == "https" and any(
        host == allowed or host.endswith("." + allowed)
        for allowed in get_settings().push_allowed_hosts
    )


def _require_enabled() -> None:
    if not get_settings().push_enabled:
        raise AppError("push_disabled", "Push notifications are not configured", 404)


# --- API -------------------------------------------------------------------------------


@router.get("/push/config", response_model=PushConfig)
async def push_config(_: CurrentUser) -> PushConfig:
    s = get_settings()
    return PushConfig(public_key=s.vapid_public_key if s.push_enabled else None)


@router.post("/push/subscriptions", status_code=204)
async def subscribe(
    body: PushSubscriptionIn,
    user: CurrentUser,
    db: DB,
    user_agent: Annotated[str, Header()] = "",
) -> None:
    _require_enabled()
    if not endpoint_allowed(body.endpoint):
        raise AppError("invalid_endpoint", "Not a known push service", 422)
    sub = await db.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    if sub is None:
        sub = PushSubscription(endpoint=body.endpoint, user_id=user.id)
        db.add(sub)
    # A shared device that changes user moves to the new user.
    sub.user_id, sub.p256dh, sub.auth = user.id, body.keys.p256dh, body.keys.auth
    sub.user_agent = user_agent[:200]
    await db.flush()
    devices = list(
        await db.scalars(
            select(PushSubscription)
            .where(PushSubscription.user_id == user.id)
            .order_by(PushSubscription.updated_at.desc(), PushSubscription.created_at.desc())
        )
    )
    for old in devices[MAX_DEVICES:]:
        await db.delete(old)
    await db.commit()


@router.delete("/push/subscriptions", status_code=204)
async def unsubscribe(body: PushEndpoint, user: CurrentUser, db: DB) -> None:
    """Remove this device (own devices only; unknown endpoints are ignored)."""
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint, PushSubscription.user_id == user.id
        )
    )
    await db.commit()


@router.post("/push/test", status_code=202)
async def test_push(user: CurrentUser, db: DB) -> None:
    """Queue a test notification to all of my devices (sent within seconds)."""
    _require_enabled()
    has_device = await db.scalar(
        select(PushSubscription.id).where(PushSubscription.user_id == user.id).limit(1)
    )
    if has_device is None:
        raise AppError("no_device", "No device is subscribed", 409)
    db.add(
        PushItem(
            user_id=user.id,
            title="OpenTeams",
            body="✓",
            link="/preferences",
            force=True,
            created_at=clock.now(),
        )
    )
    await db.commit()


# --- sending ---------------------------------------------------------------------------


def _payload(item: PushItem) -> str:
    # The link is also the tag: new alerts for the same conversation replace the old one.
    return json.dumps({"title": item.title, "body": item.body, "link": item.link, "tag": item.link})


async def _deliver(db: AsyncSession, sub: PushSubscription, data: str) -> bool:
    s = get_settings()
    info: dict[str, Any] = {
        "endpoint": sub.endpoint,
        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
    }
    try:
        await asyncio.to_thread(
            send,
            info,
            data,
            vapid_private_key=s.vapid_private_key,
            vapid_claims={"sub": s.vapid_subject},
            ttl=PUSH_TTL_SECONDS,
            timeout=10,
        )
        return True
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status in (404, 410):  # the browser unsubscribed or the subscription expired
            await db.delete(sub)
        else:
            logger.warning("Push delivery failed with status %s", status)
    except Exception as exc:  # network error: drop this alert, keep the device
        logger.warning("Push delivery failed: %s", type(exc).__name__)
    return False


async def send_push(now: datetime) -> int:
    """Scheduled job: send queued pushes. Each is tried once; returns devices reached."""
    if not get_settings().push_enabled:
        return 0
    reached = 0
    async with SessionLocal() as db:
        items = list(await db.scalars(select(PushItem).order_by(PushItem.created_at).limit(200)))
        for item in items:
            await db.delete(item)
            fresh = item.created_at >= now - MAX_AGE
            # Someone active in the app already sees it; a push would only be noise.
            if not fresh or (presence.get(item.user_id) == "online" and not item.force):
                continue
            devices = await db.scalars(
                select(PushSubscription).where(PushSubscription.user_id == item.user_id)
            )
            data = _payload(item)
            for sub in list(devices):
                reached += await _deliver(db, sub, data)
        await db.commit()
    return reached
