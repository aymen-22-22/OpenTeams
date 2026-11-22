"""Email bridge: emails to a conversation's address are posted there, by team members only."""

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from email.message import EmailMessage
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.admin.models import AuditLog
from app.bridge import mailbox as mailbox_module
from app.bridge import service
from app.bridge.models import InboundEmail
from app.bridge.parse import html_to_text, parse_email, strip_quoted
from app.core.db import SessionLocal
from app.core.settings import get_settings
from app.users.models import User
from tests.conftest import logged_in

TRUSTED = "mx.example.com; spf=pass smtp.mailfrom=example.com; dkim=pass; dmarc=pass"


# --- helpers ---------------------------------------------------------------------------


@dataclass
class FakeMailbox:
    emails: list[tuple[str, bytes | None]] = field(default_factory=list)
    seen: list[str] = field(default_factory=list)

    async def fetch_unseen(self, max_bytes: int) -> list[tuple[str, bytes | None]]:
        return [e for e in self.emails if e[0] not in self.seen]

    async def mark_seen(self, uids: list[str]) -> None:
        self.seen += uids


@dataclass
class Team:
    amina: AsyncClient
    lucas: AsyncClient
    karim: AsyncClient
    conv: str
    address: str
    box: FakeMailbox


def email(
    to: str,
    sender: str = "amina@example.com",
    subject: str = "Devis fournisseur",
    text: str = "Voici le devis.",
    html: str | None = None,
    auth: str | None = TRUSTED,
    message_id: str | None = None,
    attachments: list[tuple[str, bytes]] | None = None,
    **headers: str,
) -> bytes:
    msg = EmailMessage()
    if auth:
        msg["Authentication-Results"] = auth
    msg["From"] = f"Sender <{sender}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = message_id or f"<{abs(hash((to, sender, subject, text)))}@example.com>"
    for name, value in headers.items():
        msg[name.replace("_", "-")] = value
    msg.set_content(text)
    if html is not None:
        msg.add_alternative(html, subtype="html")
    for name, data in attachments or []:
        msg.add_attachment(data, maintype="application", subtype="octet-stream", filename=name)
    return msg.as_bytes()


async def deliver(team: Team, *raws: bytes) -> int:
    team.box.emails += [(str(len(team.box.emails) + i), raw) for i, raw in enumerate(raws)]
    return await service.poll_mailbox(None)  # type: ignore[arg-type]


async def messages(client: AsyncClient, conv: str) -> list[dict[str, Any]]:
    return (await client.get(f"/api/v1/conversations/{conv}/messages")).json()["items"]


async def records() -> list[InboundEmail]:
    async with SessionLocal() as db:
        return list(await db.scalars(select(InboundEmail).order_by(InboundEmail.created_at)))


@pytest.fixture
def bridge_on(monkeypatch: pytest.MonkeyPatch) -> FakeMailbox:
    s = get_settings()
    monkeypatch.setattr(s, "bridge_address", "team@example.com")
    monkeypatch.setattr(s, "bridge_imap_host", "imap.example.com")
    monkeypatch.setattr(s, "bridge_require_dmarc", True)
    box = FakeMailbox()
    monkeypatch.setattr(service, "get_mailbox", lambda: box)
    return box


@pytest.fixture
async def team(bridge_on: FakeMailbox) -> AsyncIterator[Team]:
    amina, _ = await logged_in("amina@example.com")
    lucas, lucas_user = await logged_in("lucas@example.com")
    karim, _ = await logged_in("karim@example.com")
    r = await amina.post("/api/v1/conversations/direct", json={"user_id": str(lucas_user.id)})
    conv = r.json()["id"]
    assert (await amina.get(f"/api/v1/conversations/{conv}/email-address")).json() == {
        "address": None
    }
    address = (await amina.post(f"/api/v1/conversations/{conv}/email-address")).json()["address"]
    yield Team(amina, lucas, karim, conv, address, bridge_on)
    for c in (amina, lucas, karim):
        await c.aclose()


# --- parsing ---------------------------------------------------------------------------


def test_html_to_text_keeps_text_and_drops_scripts_and_quotes() -> None:
    html = (
        "<html><head><style>p{color:red}</style></head><body>"
        "<p>Bonjour&nbsp;Lucas,</p><div>Le devis est prêt.<br>Merci</div>"
        "<script>alert(1)</script>"
        '<div class="gmail_quote"><div>Le lun., X a écrit :</div>'
        "<blockquote>vieux</blockquote></div>"
        "</body></html>"
    )
    assert html_to_text(html) == "Bonjour Lucas,\n\nLe devis est prêt.\nMerci"


@pytest.mark.parametrize(
    "quote",
    [
        "On Mon, 5 Jan 2026 at 09:00, Lucas <lucas@example.com> wrote:",
        "Le lun. 5 janv. 2026 à 09:00, Lucas <lucas@example.com> a écrit :",
        "في الاثنين، 5 يناير 2026، كتب Lucas <lucas@example.com>:",
        "-----Original Message-----",
        "________________________________",
        "-- ",
    ],
)
def test_strip_quoted_keeps_only_the_new_part(quote: str) -> None:
    text = f"Ma réponse\n> une ligne citée\nsuite\n\n{quote}\nancien message"
    assert strip_quoted(text) == "Ma réponse\nsuite"


def test_only_the_topmost_authentication_header_counts() -> None:
    forged = email("team+c-x@example.com", auth="mx.example.com; dmarc=fail")
    # The attacker's own header sits below the one our server added on top.
    raw = forged.replace(
        b"Authentication-Results: mx.example.com; dmarc=fail",
        b"Authentication-Results: mx.example.com; dmarc=fail\n"
        b"Authentication-Results: evil; dmarc=pass",
    )
    assert parse_email(raw).dmarc_pass is False
    assert parse_email(email("team+c-x@example.com")).dmarc_pass is True


def test_parse_reads_recipients_and_message_key() -> None:
    raw = email(
        "Someone <a@example.com>", Cc="Team <TEAM+c-abc@Example.com>", message_id="<id-1@x>"
    )
    parsed = parse_email(raw)
    assert "team+c-abc@example.com" in parsed.recipients
    assert parsed.key == parse_email(email("other@example.com", message_id="<id-1@x>")).key


# --- address endpoints -----------------------------------------------------------------


async def test_member_gets_a_stable_address_and_can_rotate_it(team: Team) -> None:
    assert team.address.startswith("team+c-") and team.address.endswith("@example.com")
    again = (await team.lucas.get(f"/api/v1/conversations/{team.conv}/email-address")).json()
    assert again["address"] == team.address  # same for every member
    r = await team.lucas.post(f"/api/v1/conversations/{team.conv}/email-address")
    assert r.status_code == 200 and r.json()["address"] != team.address
    # The old address no longer works.
    await deliver(team, email(team.address))
    assert (await records())[0].reason == "unknown_address"
    async with SessionLocal() as db:
        actions = set(await db.scalars(select(AuditLog.action)))
    assert {"email_bridge.address_created", "email_bridge.address_replaced"} <= actions


async def test_address_is_for_members_only(team: Team, client: AsyncClient) -> None:
    url = f"/api/v1/conversations/{team.conv}/email-address"
    assert (await team.karim.get(url)).status_code == 404
    assert (await team.karim.post(url)).status_code == 404
    assert (await client.get(url)).status_code == 401
    assert (
        await team.amina.get("/api/v1/conversations/not-a-uuid/email-address")
    ).status_code == 422


async def test_address_unavailable_when_bridge_is_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "bridge_address", "")
    amina, _ = await logged_in("amina@example.com")
    r = await amina.post(
        "/api/v1/conversations/direct",
        json={"user_id": str((await logged_in("lucas@example.com"))[1].id)},
    )
    r = await amina.get(f"/api/v1/conversations/{r.json()['id']}/email-address")
    assert r.status_code == 404 and r.json()["error"]["code"] == "bridge_disabled"
    assert await service.poll_mailbox(None) == 0  # type: ignore[arg-type]
    await amina.aclose()


# --- posting ---------------------------------------------------------------------------


async def test_member_email_is_posted_with_attachments(team: Team) -> None:
    raw = email(
        f"Lucas <lucas@example.com>, {team.address}",
        text="Voici le devis.\n\nLe 5 janv., Lucas a écrit :\n> ancien",
        attachments=[("devis.pdf", b"%PDF-1.4 devis"), ("virus.exe", b"MZ")],
    )
    assert await deliver(team, raw) == 1
    [msg] = await messages(team.lucas, team.conv)
    assert msg["via_email"] is True
    assert msg["body"] == "Devis fournisseur\n\nVoici le devis.\n\n📎 devis.pdf"
    files = (await team.lucas.get(f"/api/v1/conversations/{team.conv}/files")).json()
    assert [f["name"] for f in files] == ["devis.pdf"]  # .exe refused by the upload rules
    [record] = await records()
    assert (record.status, record.attachments, record.skipped_attachments) == ("posted", 1, 1)
    notes = (await team.lucas.get("/api/v1/notifications")).json()
    assert notes["unread"] >= 1 and notes["items"][0]["type"] in ("message", "file")
    assert team.box.seen == ["0"]
    async with SessionLocal() as db:
        actions = list(await db.scalars(select(AuditLog.action)))
    assert "email_bridge.posted" in actions


async def test_html_only_arabic_email(team: Team) -> None:
    raw = email(team.address, subject="", text="", html="<p dir='rtl'>مرحبا، التقرير جاهز</p>")
    await deliver(team, raw)
    [msg] = await messages(team.amina, team.conv)
    assert msg["body"] == "مرحبا، التقرير جاهز"


async def test_same_email_is_posted_once(team: Team) -> None:
    raw = email(team.address, message_id="<same@example.com>")
    assert await deliver(team, raw) == 1
    assert await deliver(team, raw) == 0  # fetched again (e.g. flag lost): ignored
    assert len(await messages(team.amina, team.conv)) == 1


async def test_works_for_a_task_chat(team: Team) -> None:
    task = (await team.amina.post("/api/v1/tasks", json={"title": "Budget"})).json()
    conv = task["conversation_id"]
    address = (await team.amina.post(f"/api/v1/conversations/{conv}/email-address")).json()[
        "address"
    ]
    await deliver(team, email(address, subject="Budget 2027"))
    assert [m["body"] for m in await messages(team.amina, conv)] == [
        "Budget 2027\n\nVoici le devis."
    ]


async def test_dmarc_check_can_be_turned_off(team: Team, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "bridge_require_dmarc", False)
    assert await deliver(team, email(team.address, auth=None)) == 1


# --- rejections ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("kwargs", "reason"),
    [
        ({"sender": "stranger@evil.example"}, "unknown_sender"),
        ({"sender": "karim@example.com"}, "not_member"),
        ({"auth": None}, "not_authenticated"),
        ({"auth": "mx.example.com; spf=pass; dmarc=fail"}, "not_authenticated"),
        ({"subject": "", "text": ""}, "empty"),
    ],
)
async def test_rejected_emails_are_recorded_not_posted(
    team: Team, kwargs: dict[str, Any], reason: str
) -> None:
    assert await deliver(team, email(team.address, **kwargs)) == 0
    assert await messages(team.amina, team.conv) == []
    [record] = await records()
    assert (record.status, record.reason) == ("rejected", reason)
    assert str(record.conversation_id) == team.conv
    assert team.box.seen == ["0"]
    async with SessionLocal() as db:
        audit = await db.scalar(select(AuditLog).where(AuditLog.action == "email_bridge.rejected"))
    assert audit is not None and audit.details == {"reason": reason}


async def test_unrouted_emails_are_rejected(team: Team) -> None:
    await deliver(
        team,
        email("team@example.com"),  # no tag
        email("team+c-doesnotexist99@example.com"),
        email("other+c-" + team.address.split("+c-")[1]),  # right token, wrong mailbox
    )
    assert [r.reason for r in await records()] == ["no_address", "unknown_address", "no_address"]


async def test_inactive_user_cannot_post(team: Team) -> None:
    async with SessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == "amina@example.com"))
        assert user is not None
        user.is_active = False
        await db.commit()
    await deliver(team, email(team.address))
    assert (await records())[0].reason == "unknown_sender"


async def test_oversized_and_broken_emails_are_skipped(
    team: Team, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    team.box.emails.append(("big", None))
    assert await service.poll_mailbox(None) == 0  # type: ignore[arg-type]
    assert team.box.seen == ["big"]

    async def boom(*_: Any) -> None:
        raise RuntimeError("secret content")

    monkeypatch.setattr(service, "process_email", boom)
    assert await deliver(team, email(team.address)) == 0
    assert team.box.seen == ["big", "1"]  # marked read: never processed in a loop
    assert "RuntimeError" in caplog.text and "secret content" not in caplog.text


# --- IMAP adapter ----------------------------------------------------------------------


class FakeIMAP:
    log: list[tuple[str, ...]] = []

    def __init__(self, host: str, port: int, timeout: int) -> None:
        self.log.append(("connect", host, str(port)))

    def login(self, user: str, password: str) -> None:
        self.log.append(("login", user))

    def select(self, folder: str) -> None:
        self.log.append(("select", folder))

    def uid(self, command: str, *args: str) -> tuple[str, list[Any]]:
        self.log.append((command, *args))
        if command == "SEARCH":
            return "OK", [b"7 8"]
        if command == "FETCH" and args[1] == "(RFC822.SIZE)":
            size = b"100" if args[0] == "7" else b"999999"
            return "OK", [b"7 (UID 7 RFC822.SIZE " + size + b")"]
        if command == "FETCH":
            return "OK", [(b"7 (BODY[] {5}", b"hello"), b")"]
        return "OK", [b""]

    def logout(self) -> None:
        self.log.append(("logout",))


async def test_imap_mailbox(monkeypatch: pytest.MonkeyPatch, bridge_on: FakeMailbox) -> None:
    monkeypatch.setattr(mailbox_module.imaplib, "IMAP4_SSL", FakeIMAP)
    monkeypatch.setattr(get_settings(), "bridge_imap_user", "team")
    FakeIMAP.log = []
    box = mailbox_module.ImapMailbox()
    assert await box.fetch_unseen(1000) == [("7", b"hello"), ("8", None)]
    await box.mark_seen(["7", "8"])
    assert ("FETCH", "7", "(BODY.PEEK[])") in FakeIMAP.log  # reading does not mark as read
    assert ("STORE", "7,8", "+FLAGS", "(\\Seen)") in FakeIMAP.log
    assert FakeIMAP.log.count(("logout",)) == 2
