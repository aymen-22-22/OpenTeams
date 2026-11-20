"""Allowed file types and safe names. Anything not listed here is rejected."""

import re
import unicodedata
from pathlib import PurePosixPath

KINDS: dict[str, set[str]] = {
    "pdf": {"pdf"},
    "spreadsheet": {"xls", "xlsx", "ods", "csv"},
    "document": {"doc", "docx", "odt", "rtf", "txt", "md", "ppt", "pptx", "odp"},
    "image": {"png", "jpg", "jpeg", "gif", "webp"},
    "other": {"zip", "7z", "mp3", "mp4", "mov", "wav"},
}
_KIND_BY_EXT = {ext: kind for kind, exts in KINDS.items() for ext in exts}


def safe_name(raw: str) -> str | None:
    """Keep only the base name, drop control and path characters. None if nothing is left."""
    name = unicodedata.normalize("NFC", PurePosixPath(raw.replace("\\", "/")).name)
    name = re.sub(r"[\x00-\x1f\x7f<>:\"|?*]", "", name).strip(" .")
    return name[:255] or None


def kind_of(name: str) -> str | None:
    """File kind from the extension, or None if the type is not allowed."""
    ext = PurePosixPath(name).suffix.lower().lstrip(".")
    return _KIND_BY_EXT.get(ext)
