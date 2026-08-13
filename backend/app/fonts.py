"""Font loading.

Bundled font files live in backend/fonts/, named "<FamilyId>-Regular.ttf" and
(optionally) "<FamilyId>-Bold.ttf". This module scans that folder once, builds
a registry keyed by family id, and hands out cached PIL ImageFont instances.

Falls back to a handful of system font locations, and ultimately to Pillow's
built-in bitmap font, so rendering never hard-fails even if the fonts folder
is empty or a requested family doesn't exist.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

from PIL import ImageFont

FONTS_DIR = Path(__file__).resolve().parent.parent / "fonts"

# Nicer display names for family ids that don't already read well spaced out.
_DISPLAY_NAME_OVERRIDES = {
    "PTSerif": "PT Serif",
    "BebasNeue": "Bebas Neue",
    "DMSerifDisplay": "DM Serif Display",
}

_FILENAME_RE = re.compile(r"^(?P<family>.+)-(?P<weight>Regular|Bold)\.ttf$", re.IGNORECASE)

_SYSTEM_FALLBACK_REGULAR = [
    r"C:\Windows\Fonts\arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]
_SYSTEM_FALLBACK_BOLD = [
    r"C:\Windows\Fonts\arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]

DEFAULT_FAMILY = "Poppins"


@dataclass(frozen=True)
class FontFamily:
    id: str
    name: str
    regular_path: Optional[str]
    bold_path: Optional[str]

    @property
    def has_bold(self) -> bool:
        return self.bold_path is not None


def _display_name(family_id: str) -> str:
    if family_id in _DISPLAY_NAME_OVERRIDES:
        return _DISPLAY_NAME_OVERRIDES[family_id]
    # "PTSerif" -> "PT Serif" style splitting isn't reliable in general, so
    # only apply overrides above; otherwise just use the id as-is.
    return family_id


def _first_existing(paths: list[str]) -> Optional[str]:
    for p in paths:
        if Path(p).is_file():
            return p
    return None


@lru_cache(maxsize=1)
def _registry() -> dict[str, FontFamily]:
    families: dict[str, dict[str, str]] = {}
    if FONTS_DIR.is_dir():
        for path in FONTS_DIR.glob("*.ttf"):
            match = _FILENAME_RE.match(path.name)
            if not match:
                continue
            family_id = match.group("family")
            weight = match.group("weight").lower()
            families.setdefault(family_id, {})[weight] = str(path)

    registry = {
        fid: FontFamily(
            id=fid,
            name=_display_name(fid),
            regular_path=weights.get("regular"),
            bold_path=weights.get("bold"),
        )
        for fid, weights in families.items()
    }

    # Always provide a "System Default" entry backed by whatever system fonts
    # we can find, so rendering still works if backend/fonts/ is empty.
    registry["System Default"] = FontFamily(
        id="System Default",
        name="System Default",
        regular_path=_first_existing(_SYSTEM_FALLBACK_REGULAR),
        bold_path=_first_existing(_SYSTEM_FALLBACK_BOLD),
    )
    return registry


def list_families() -> list[FontFamily]:
    return sorted(_registry().values(), key=lambda f: f.name)


@lru_cache(maxsize=256)
def get_font(size: int, bold: bool = False, family: str = DEFAULT_FAMILY) -> ImageFont.FreeTypeFont:
    registry = _registry()
    fam = registry.get(family) or registry.get(DEFAULT_FAMILY) or registry.get("System Default")

    path = None
    if fam:
        path = (fam.bold_path if bold else fam.regular_path) or fam.regular_path or fam.bold_path

    if path:
        return ImageFont.truetype(path, size)
    # Last-resort fallback: Pillow's default bitmap font (fixed size, not
    # scalable, but keeps the endpoint from ever hard-failing on rendering).
    return ImageFont.load_default()
