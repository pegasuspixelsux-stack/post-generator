"""Compositing engine: turns a GenerateGraphicRequest into a rendered JPEG."""
from __future__ import annotations

import io
import logging
import math

import requests
from PIL import Image, ImageDraw, ImageOps

from .fonts import get_font
from .models import (
    GenerateGraphicRequest,
    ImageBlock,
    LineShape,
    LogoConfig,
    OverlayConfig,
    RichLine,
    TextSpan,
    WordArtConfig,
)

logger = logging.getLogger("post_generator.rendering")

_FETCH_TIMEOUT = 10  # seconds

# output_format -> (Pillow format name, MIME type, file extension)
OUTPUT_FORMATS = {
    "jpeg": ("JPEG", "image/jpeg", "jpg"),
    "png": ("PNG", "image/png", "png"),
    "webp": ("WEBP", "image/webp", "webp"),
}


def _fetch_image(url: str) -> Image.Image:
    resp = requests.get(url, timeout=_FETCH_TIMEOUT)
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGBA")


def _cover_resize(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Resize + center-crop `img` so it fully covers a target_w x target_h box
    (aspect-fill), matching typical CSS `background-size: cover` behavior."""
    src_w, src_h = img.size
    if src_w == 0 or src_h == 0:
        return Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))

    scale = max(target_w / src_w, target_h / src_h)
    new_w, new_h = max(1, round(src_w * scale)), max(1, round(src_h * scale))
    resized = img.resize((new_w, new_h), Image.LANCZOS)

    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def _paste_background(canvas: Image.Image, req: GenerateGraphicRequest) -> None:
    if not req.background_image_url:
        return
    try:
        bg = _fetch_image(req.background_image_url)
        bg = _cover_resize(bg, req.canvas_width, req.canvas_height)
        canvas.alpha_composite(bg)
    except Exception:
        logger.warning("Failed to fetch/paste background image %r", req.background_image_url, exc_info=True)


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def _gradient_mask(direction: str, size: tuple[int, int]) -> Image.Image:
    """A grayscale mask where 255 = the overlay's anchor end (per `direction`)
    and 0 = the fade end. Built from Pillow's 256x256 gradient primitives and
    stretched to the canvas size."""
    if direction == "radial":
        # radial_gradient is 0 at center, 255 at the edge; invert so the
        # anchor (255) sits at the center, fading out to the edges.
        base = ImageOps.invert(Image.radial_gradient("L"))
    else:
        # linear_gradient is 0 at top, 255 at bottom.
        base = Image.linear_gradient("L")
        if direction == "top":
            base = ImageOps.flip(base)
        elif direction == "left":
            base = base.transpose(Image.ROTATE_270)
        elif direction == "right":
            base = base.transpose(Image.ROTATE_90)
        # direction == "bottom" uses the base gradient as-is.
    return base.resize(size, Image.BILINEAR)


def _apply_overlay(canvas: Image.Image, overlay: OverlayConfig) -> None:
    opacity = _clamp01(overlay.opacity)

    if overlay.type == "solid":
        if opacity <= 0:
            return
        scrim = Image.new("RGBA", canvas.size, (*overlay.color, round(255 * opacity)))
        canvas.alpha_composite(scrim)
        return

    # gradient: blend from color/opacity (anchor) to color2/opacity2 (fade)
    opacity2 = _clamp01(overlay.opacity2)
    if opacity <= 0 and opacity2 <= 0:
        return
    layer_anchor = Image.new("RGBA", canvas.size, (*overlay.color, round(255 * opacity)))
    layer_fade = Image.new("RGBA", canvas.size, (*overlay.color2, round(255 * opacity2)))
    mask = _gradient_mask(overlay.direction, canvas.size)
    gradient_layer = Image.composite(layer_anchor, layer_fade, mask)
    canvas.alpha_composite(gradient_layer)


def _paste_block(canvas: Image.Image, url: str, x: int, y: int, width: int, height: int) -> None:
    try:
        img = _fetch_image(url)
        if width > 0 and height > 0:
            # Cover-fill + center-crop (same as the background) rather than a
            # plain resize, so mismatched aspect ratios crop instead of
            # stretching/squashing the image.
            img = _cover_resize(img, width, height)
        canvas.alpha_composite(img, (x, y))
    except Exception:
        logger.warning("Failed to fetch/paste image %r at (%s, %s)", url, x, y, exc_info=True)


def _paste_logo(canvas: Image.Image, logo: LogoConfig | None) -> None:
    if not logo or not logo.url:
        return
    _paste_block(canvas, logo.url, logo.x, logo.y, logo.width, logo.height)


def _paste_secondary_images(canvas: Image.Image, blocks: list[ImageBlock]) -> None:
    for block in blocks:
        _paste_block(canvas, block.url, block.x, block.y, block.width, block.height)


def _paste_wordart(canvas: Image.Image, wordart: WordArtConfig | None) -> None:
    if not wordart or not wordart.url:
        return
    _paste_block(canvas, wordart.url, wordart.x, wordart.y, wordart.width, wordart.height)


def _draw_line_shape(draw: ImageDraw.ImageDraw, line: LineShape) -> None:
    if line.length <= 0 or line.thickness <= 0:
        return
    opacity = _clamp01(line.opacity)
    if opacity <= 0:
        return
    angle_rad = math.radians(line.angle)
    end_x = line.x + line.length * math.cos(angle_rad)
    end_y = line.y + line.length * math.sin(angle_rad)
    fill = (*line.color, round(255 * opacity))
    draw.line([(line.x, line.y), (end_x, end_y)], fill=fill, width=line.thickness)


def _draw_lines(draw: ImageDraw.ImageDraw, lines: list[LineShape]) -> None:
    for line in lines:
        _draw_line_shape(draw, line)


def _draw_wrapped_line(
    draw: ImageDraw.ImageDraw,
    line: RichLine,
    *,
    x: int | None = None,
    y: int | None = None,
    opacity: float = 1.0,
) -> None:
    """Greedy word-wrap: tokenize every span's text into words (each word
    keeping its own span's style) and pack them left-to-right, wrapping to
    a new row whenever the next word would cross origin_x + max_width.

    `x`/`y` optionally override line.x/line.y (used by video.py to animate
    position without mutating the request); `opacity` optionally scales
    alpha (used by video.py for fade animations)."""
    origin_x = line.x if x is None else x
    origin_y = line.y if y is None else y

    words: list[tuple[str, TextSpan]] = []
    for span in line.spans:
        for word in span.text.split(" "):
            if word:
                words.append((word, span))
    if not words:
        return

    row_height = line.line_spacing if line.line_spacing > 0 else round(max(s.font_size for s in line.spans) * 1.2)

    space_width_cache: dict[tuple, int] = {}

    def space_width(span: TextSpan) -> int:
        key = (span.font_size, span.bold, span.font_family)
        if key not in space_width_cache:
            font = get_font(span.font_size, bold=span.bold, family=span.font_family)
            bbox = draw.textbbox((0, 0), " ", font=font)
            space_width_cache[key] = bbox[2] - bbox[0]
        return space_width_cache[key]

    cursor_x = origin_x
    cursor_y = origin_y
    row_start = True

    for word, span in words:
        font = get_font(span.font_size, bold=span.bold, family=span.font_family)
        bbox = draw.textbbox((0, 0), word, font=font)
        word_width = bbox[2] - bbox[0]

        if not row_start and cursor_x + word_width > origin_x + line.max_width:
            cursor_y += row_height
            cursor_x = origin_x
            row_start = True

        fill = _with_opacity(span.color, opacity)
        draw.text((cursor_x, cursor_y), word, font=font, fill=fill)
        cursor_x += word_width + space_width(span)
        row_start = False


def _with_opacity(color: tuple, opacity: float) -> tuple:
    """RGB tuple -> RGBA tuple with alpha scaled by opacity (for video fades)."""
    if opacity >= 1.0:
        return tuple(color)
    return (*color, round(255 * _clamp01(opacity)))


def _draw_rich_line(
    draw: ImageDraw.ImageDraw,
    line: RichLine,
    *,
    x: int | None = None,
    y: int | None = None,
    opacity: float = 1.0,
) -> None:
    """`x`/`y` optionally override line.x/line.y and `opacity` optionally
    scales alpha — both used by video.py to animate this line without
    mutating the request."""
    if line.max_width > 0:
        _draw_wrapped_line(draw, line, x=x, y=y, opacity=opacity)
        return

    origin_x = line.x if x is None else x
    origin_y = line.y if y is None else y

    if line.line_spacing > 0:
        # Vertical stack: each span gets its own row, line_spacing px apart,
        # all left-aligned at origin_x (no horizontal cursor advance).
        for i, span in enumerate(line.spans):
            if not span.text:
                continue
            font = get_font(span.font_size, bold=span.bold, family=span.font_family)
            fill = _with_opacity(span.color, opacity)
            draw.text((origin_x, origin_y + i * line.line_spacing), span.text, font=font, fill=fill)
        return

    # Default: spans render inline on one row, left-to-right.
    cursor_x = origin_x
    for span in line.spans:
        if not span.text:
            continue
        font = get_font(span.font_size, bold=span.bold, family=span.font_family)
        fill = _with_opacity(span.color, opacity)
        draw.text((cursor_x, origin_y), span.text, font=font, fill=fill)
        bbox = draw.textbbox((cursor_x, origin_y), span.text, font=font)
        cursor_x += bbox[2] - bbox[0]


def render_graphic(req: GenerateGraphicRequest) -> bytes:
    """Composite background, logo, secondary images, decorative line shapes,
    rich text lines, and an optional topmost word-art image into a single
    canvas, returning encoded image bytes in the requested output format."""
    canvas = Image.new("RGBA", (req.canvas_width, req.canvas_height), (*req.background_color, 255))

    _paste_background(canvas, req)
    _apply_overlay(canvas, req.overlay)
    _paste_logo(canvas, req.logo)
    _paste_secondary_images(canvas, req.secondary_images)

    draw = ImageDraw.Draw(canvas)
    _draw_lines(draw, req.lines)
    for line in req.rich_lines:
        _draw_rich_line(draw, line)

    # Word art renders last so it always sits on top of everything, including text.
    _paste_wordart(canvas, req.wordart)

    pil_format, _mime, _ext = OUTPUT_FORMATS[req.output_format]
    if pil_format == "JPEG":
        # JPEG has no alpha channel; flatten onto the canvas's own background.
        output_image = canvas.convert("RGB")
    else:
        output_image = canvas

    buf = io.BytesIO()
    save_kwargs = {"quality": 92} if pil_format in ("JPEG", "WEBP") else {}
    output_image.save(buf, format=pil_format, **save_kwargs)
    return buf.getvalue()
