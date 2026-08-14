"""Request/response schemas for the /generate-graphic endpoint."""
from __future__ import annotations

from typing import List, Literal, Optional, Tuple

from pydantic import BaseModel, Field

RGBColor = Tuple[int, int, int]
OverlayDirection = Literal["top", "bottom", "left", "right", "radial"]
OutputFormat = Literal["jpeg", "png", "webp"]


class LogoConfig(BaseModel):
    url: str
    x: int = 0
    y: int = 0
    width: int = 200
    height: int = 100


class ImageBlock(BaseModel):
    """A secondary image placed at an explicit location on the canvas."""

    url: str
    x: int = 0
    y: int = 0
    width: int = 200
    height: int = 200


class WordArtConfig(BaseModel):
    """An optional decorative image (e.g. a word-art PNG) placed on top of
    everything else — background, logo, secondary images, and text."""

    url: str
    x: int = 0
    y: int = 0
    width: int = 300
    height: int = 300


class TextSpan(BaseModel):
    text: str
    font_size: int = 40
    color: RGBColor = (255, 255, 255)
    bold: bool = False
    font_family: str = "Poppins"  # id from GET /fonts; falls back to default if unknown


class RichLine(BaseModel):
    """A block of styled text spans starting at (x, y).

    Three layout modes, in priority order:
    - max_width > 0: word-wrap. All spans' text is tokenized into words
      (each keeping its own span's font/color/bold) and greedily packed
      across multiple rows so no row exceeds max_width px, wrapping to a
      new row (line_spacing px lower, or an auto default) as needed —
      like a normal paragraph.
    - else, line_spacing > 0: each span gets its own row, line_spacing px
      apart, all left-aligned at x.
    - else (both 0, the default): spans render inline, left-to-right, each
      one advancing the cursor — e.g. two differently-colored words on one
      headline."""

    x: int
    y: int
    spans: List[TextSpan] = Field(default_factory=list)
    line_spacing: int = 0
    max_width: int = 0


class LineShape(BaseModel):
    """A straight decorative line: starts at (x, y), runs `length` px at
    `angle` degrees (0 = horizontal pointing right, 90 = vertical pointing
    down, measured clockwise — standard image-coordinate convention), drawn
    `thickness` px wide."""

    x: int = 0
    y: int = 0
    length: int = 200
    thickness: int = 2
    angle: float = 0.0
    color: RGBColor = (255, 255, 255)
    opacity: float = 1.0


class OverlayConfig(BaseModel):
    """The scrim drawn over the background for text legibility.

    For type="solid", `color`/`opacity` fill the whole canvas uniformly.
    For type="gradient", the overlay blends from `color`/`opacity` (the
    "anchor" end, placed per `direction`) to `color2`/`opacity2` (the fade
    end). direction="radial" anchors at the center, fading to the edges.
    """

    type: Literal["solid", "gradient"] = "solid"
    color: RGBColor = (0, 0, 0)
    opacity: float = 0.35
    color2: RGBColor = (0, 0, 0)
    opacity2: float = 0.0
    direction: OverlayDirection = "bottom"


class GenerateGraphicRequest(BaseModel):
    canvas_width: int = 1080
    canvas_height: int = 1920
    background_image_url: Optional[str] = None
    background_color: RGBColor = (24, 24, 27)
    overlay: OverlayConfig = Field(default_factory=OverlayConfig)
    logo: Optional[LogoConfig] = None
    secondary_images: List[ImageBlock] = Field(default_factory=list)
    lines: List[LineShape] = Field(default_factory=list)  # optional decorative straight lines
    rich_lines: List[RichLine] = Field(default_factory=list)
    wordart: Optional[WordArtConfig] = None  # optional topmost decorative image overlay
    output_format: OutputFormat = "jpeg"
    persist: bool = False  # if true, save the rendered image under /assets for later retrieval
