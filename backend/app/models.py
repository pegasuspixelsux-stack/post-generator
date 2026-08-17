"""Request/response schemas for the /generate-graphic endpoint."""
from __future__ import annotations

from typing import List, Literal, Optional, Tuple

from pydantic import BaseModel, Field

RGBColor = Tuple[int, int, int]
OverlayDirection = Literal["top", "bottom", "left", "right", "radial", "angle"]
SolidShape = Literal["full", "straight", "angled", "circular"]
SolidPosition = Literal["top", "bottom"]
OutputFormat = Literal["jpeg", "png", "webp"]
AnimationType = Literal["none", "slide-left", "slide-right", "slide-up", "slide-down", "fade"]


class AnimationMixin(BaseModel):
    """Entrance animation for a video export (backend/app/video.py). Ignored
    for static image generation. The element is fully settled (final
    position, full opacity) before `animation_delay` and stays settled
    forever if `animation` is "none"."""

    animation: AnimationType = "none"
    animation_duration: float = 0.6  # seconds; smaller = faster
    animation_delay: float = 0.0  # seconds after video start before this element begins animating


class LogoConfig(AnimationMixin):
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


class WordArtConfig(AnimationMixin):
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


class RichLine(AnimationMixin):
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

    For type="solid", `color`/`opacity` fill the whole canvas uniformly by
    default (`solid_shape="full"`), or a hard-edged partial block when
    `solid_shape` is "straight"/"angled"/"circular" (see those fields below).
    For type="gradient", the overlay blends from `color`/`opacity` (the
    "anchor" end, placed per `direction`) to `color2`/`opacity2` (the fade
    end). direction="radial" anchors at the center, fading to the edges;
    direction="angle" anchors along `angle` degrees (0=right, 90=down,
    clockwise — same convention as LineShape.angle), generalizing the four
    axis-aligned presets (bottom=90, top=270, left=180, right=0).
    """

    type: Literal["solid", "gradient"] = "solid"
    color: RGBColor = (0, 0, 0)
    opacity: float = 0.35
    color2: RGBColor = (0, 0, 0)
    opacity2: float = 0.0
    direction: OverlayDirection = "bottom"
    angle: float = 0.0  # degrees; gradient only, used when direction == "angle"

    # solid-only hard-edged partial block; ignored when type == "gradient"
    solid_shape: SolidShape = "full"
    solid_position: SolidPosition = "bottom"  # which edge the block emanates from
    solid_coverage: float = 50.0  # 0-100, % of canvas covered from that edge
    solid_angle: float = 0.0  # degrees; tilt of the cut line, only for solid_shape == "angled"


class GenerateGraphicRequest(BaseModel):
    canvas_width: int = 1080
    canvas_height: int = 1920
    background_image_url: Optional[str] = None
    background_color: RGBColor = (24, 24, 27)
    overlay: OverlayConfig = Field(default_factory=OverlayConfig)
    # A second, independent overlay layer composited directly on top of
    # `overlay` (same z-order slot). Off by default (opacity 0) so it's a
    # no-op until the user turns it on.
    overlay2: OverlayConfig = Field(default_factory=lambda: OverlayConfig(opacity=0.0))
    logo: Optional[LogoConfig] = None
    secondary_images: List[ImageBlock] = Field(default_factory=list)
    lines: List[LineShape] = Field(default_factory=list)  # optional decorative straight lines
    rich_lines: List[RichLine] = Field(default_factory=list)
    wordart: Optional[WordArtConfig] = None  # optional topmost decorative image overlay
    output_format: OutputFormat = "jpeg"
    persist: bool = False  # if true, save the rendered image under /assets for later retrieval


class VideoRequest(BaseModel):
    """An 'animate in, then hold' MP4 export of a graphic. Per-element
    animation (type/duration/delay) lives on logo/wordart/each rich_line in
    `base` (see AnimationMixin); this wraps the whole-clip settings."""

    base: GenerateGraphicRequest
    fps: int = 30
    duration: float = 3.0  # total clip length, seconds
    fade_in: float = 0.0  # seconds; whole-frame fade from background_color at clip start
    fade_out: float = 0.0  # seconds; whole-frame fade to background_color at clip end
    persist: bool = False  # if true, save the rendered mp4 under /assets for later retrieval

    # Optional uploaded MP4 used as the animated background instead of
    # base.background_image_url — every frame of this video is decoded,
    # cover-resized to the canvas, and composited under the overlay/logo/
    # text layers. When set, `fps` and `duration` above are ignored: the
    # output's frame rate and length match this source video exactly.
    background_video_url: Optional[str] = None
