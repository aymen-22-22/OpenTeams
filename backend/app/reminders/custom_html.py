"""Admin-written HTML email templates.

Only plain {{variable}} replacement: the admin's code is never executed as a template
(a template engine would let it run code on the server). Values are HTML-escaped,
except {{items}} which is HTML built by us.
"""

import re
from html import escape
from pathlib import Path

VARIABLES = (
    "subject",
    "title",
    "body",
    "intro",
    "link",
    "brand_name",
    "brand_color",
    "on_color",
    "logo_url",
    "preferences_url",
    "app_url",
    "count",
    "items",
)
RAW = {"items"}  # already safe HTML
_PLACEHOLDER = re.compile(r"\{\{\s*([a-z_]+)\s*\}\}")
MAX_SIZE = 100_000

# Starting point offered in the Administration page.
STARTER = (Path(__file__).parent / "templates" / "custom_starter.html").read_text()


def fill(template: str, values: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in VARIABLES:
            return match.group(0)  # unknown: left as typed, visible in the preview
        value = values.get(name, "")
        return value if name in RAW else escape(value)

    return _PLACEHOLDER.sub(replace, template)


def problems(template: str) -> list[str]:
    """Why a template cannot be saved (empty list: fine)."""
    found = []
    if len(template) > MAX_SIZE:
        found.append("too_large")
    if re.search(r"<\s*script", template, re.IGNORECASE):
        found.append("script")
    if not re.search(r"\{\{\s*preferences_url\s*\}\}", template):
        found.append("preferences_link")  # every email links to the preferences
    return found
