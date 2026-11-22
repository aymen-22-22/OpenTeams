"""Turn a raw email into what the bridge needs: sender, recipients, text and attachments.

Emails are untrusted input: nothing here executes or renders their content.
"""

import hashlib
import re
from dataclasses import dataclass, field
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import getaddresses, parseaddr
from html.parser import HTMLParser


@dataclass
class Attachment:
    name: str
    data: bytes


@dataclass
class ParsedEmail:
    key: str  # SHA-256 of the Message-ID (or of the raw bytes)
    sender: str  # lower-cased address from the From header
    recipients: list[str]  # lower-cased To, Cc, Delivered-To and X-Original-To addresses
    subject: str
    text: str
    dmarc_pass: bool
    attachments: list[Attachment] = field(default_factory=list)


# --- HTML to text ----------------------------------------------------------------------

_BLOCK_TAGS = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0  # inside <script>, <style> or <head>
        self._quote = 0  # inside a quoted reply (<blockquote>, Gmail's "gmail_quote")

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "head", "title"}:
            self._skip += 1
        classes = dict(attrs).get("class") or ""
        quoting = self._quote or tag == "blockquote" or "gmail_quote" in classes
        if quoting and tag in {"blockquote", "div"}:
            self._quote += 1
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "head", "title"} and self._skip:
            self._skip -= 1
        if self._quote and tag in {"blockquote", "div"}:
            self._quote -= 1
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip and not self._quote:
            self.parts.append(data)


def html_to_text(html: str) -> str:
    extractor = _TextExtractor()
    extractor.feed(html)
    extractor.close()
    lines = [
        re.sub(r"[ \t ]+", " ", line).strip() for line in "".join(extractor.parts).splitlines()
    ]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


# --- quoted replies and signatures -----------------------------------------------------

_CUT = re.compile(
    r"^("
    r"On .+wrote:|"  # Gmail / Apple Mail (en)
    r"Le .+a écrit\s?:|"  # fr
    r"في .+كتب.*:|"  # ar
    r"-{2,}\s*(Original Message|Message d'origine|Forwarded message|Message transféré)\s*-{2,}|"
    r"_{10,}|"  # Outlook separator line
    r"-- ?"  # signature delimiter
    r")\s*$",
    re.IGNORECASE,
)


def strip_quoted(text: str) -> str:
    """Keep only the new part of a reply: drop '>' lines, quoted history and the signature."""
    kept = []
    for line in text.replace("\r\n", "\n").split("\n"):
        if _CUT.match(line.strip()):
            break
        if line.lstrip().startswith(">"):
            continue
        kept.append(line.rstrip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip()


# --- parsing ---------------------------------------------------------------------------


def _part_text(part: EmailMessage) -> str:
    try:
        content = str(part.get_content())
    except (LookupError, ValueError):  # unknown charset or broken encoding
        payload = part.get_payload(decode=True)
        content = payload.decode("utf-8", "replace") if isinstance(payload, bytes) else ""
    return html_to_text(content) if part.get_content_subtype() == "html" else content


def _body_text(msg: EmailMessage) -> str:
    """The plain-text part, or the HTML part when the text one is missing or empty."""
    for kind in ("plain", "html"):
        part = msg.get_body(preferencelist=(kind,))
        if isinstance(part, EmailMessage) and (text := strip_quoted(_part_text(part))):
            return text
    return ""


def _attachments(msg: EmailMessage) -> list[Attachment]:
    found = []
    for part in msg.iter_attachments():
        name = part.get_filename()
        data = part.get_payload(decode=True)
        if name and isinstance(data, bytes):
            found.append(Attachment(name=name, data=data))
    return found


def _dmarc_pass(msg: EmailMessage) -> bool:
    """Only the topmost Authentication-Results counts: it is added by our own mail server.

    Lower ones may come from the sender and cannot be trusted.
    """
    results = msg.get_all("Authentication-Results") or []
    return (
        bool(results) and re.search(r"\bdmarc=pass\b", str(results[0]), re.IGNORECASE) is not None
    )


def parse_email(raw: bytes) -> ParsedEmail:
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    assert isinstance(msg, EmailMessage)
    message_id = str(msg.get("Message-ID") or "").strip()
    key = hashlib.sha256(message_id.encode() if message_id else raw).hexdigest()
    headers = [
        str(h)
        for name in ("To", "Cc", "Delivered-To", "X-Original-To")
        for h in msg.get_all(name) or []
    ]
    return ParsedEmail(
        key=key,
        sender=parseaddr(str(msg.get("From") or ""))[1].lower(),
        recipients=[addr.lower() for _, addr in getaddresses(headers) if addr],
        subject=str(msg.get("Subject") or "").strip(),
        text=_body_text(msg),
        dmarc_pass=_dmarc_pass(msg),
        attachments=_attachments(msg),
    )
