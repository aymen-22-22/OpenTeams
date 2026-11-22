"""How emails look: organization name, color, footer, logo and wording overrides."""

from dataclasses import dataclass, field
from typing import Any

DEFAULT_COLOR = "#0F766E"


@dataclass(frozen=True)
class Brand:
    name: str = "OpenTeams"
    color: str = DEFAULT_COLOR
    footer: str = ""  # extra footer line (address, legal notice…)
    logo_url: str = ""  # absolute URL, empty when there is no logo
    texts: dict[str, Any] = field(default_factory=dict)  # kind -> lang -> {subject, intro}

    def text(self, kind: str, lang: str, key: str) -> str:
        value = self.texts.get(kind, {}).get(lang, {}).get(key, "")
        return value.strip() if isinstance(value, str) else ""

    @property
    def on_color(self) -> str:
        """Black or white, whichever reads best on the brand color (WCAG relative luminance)."""
        r, g, b = (int(self.color[i : i + 2], 16) / 255 for i in (1, 3, 5))
        lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, b)]
        luminance = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
        return "#111111" if luminance > 0.4 else "#ffffff"


DEFAULT_BRAND = Brand()
