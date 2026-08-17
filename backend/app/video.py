"""Video export: renders an 'animate in, then hold' MP4 clip from a
GenerateGraphicRequest plus per-element AnimationMixin settings.

Scope (per product decision): only the logo, word-art image, and rich text
lines animate. The background, overlay, secondary images, and decorative
line shapes are static and are pre-rendered once into a base frame that
every video frame starts from (cheap: no re-fetching/re-compositing per
frame).

Shape: each animated element is fully off-screen/transparent at t=0, then
eases into its final resting position/opacity by `animation_delay +
animation_duration` seconds, and holds there (its normal static position)
for the rest of the clip. animation="none" means "always at rest". An
optional global fade_in/fade_out additionally ramps the *whole frame's*
opacity at the start/end of the clip, composited over `background_color`
so there's no flicker to black.
"""
from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw

from .models import GenerateGraphicRequest, LogoConfig, RichLine, VideoRequest, WordArtConfig
from .rendering import (
    _apply_overlay,
    _draw_lines,
    _draw_rich_line,
    _paste_background,
    _paste_secondary_images,
)

logger = logging.getLogger("post_generator.video")

SLIDE_DISTANCE = 260  # px an element travels in from, for slide-* animations


def ease_out_cubic(t: float) -> float:
    """Standard "decelerate into place" easing; t and the result are both 0..1."""
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def _progress(t: float, delay: float, duration: float) -> float:
    """0..1 animation progress at time `t` (seconds), given this element's
    own delay/duration. Before the delay: 0 (not yet started). After
    delay+duration: 1 (settled). duration<=0 means "instant" (settles the
    moment the delay elapses)."""
    if duration <= 0:
        return 0.0 if t < delay else 1.0
    raw = (t - delay) / duration
    return max(0.0, min(1.0, raw))


def _offset_for(animation: str, eased: float) -> tuple[int, int, float]:
    """Given an eased 0..1 progress value, return (dx, dy, opacity) to apply
    on top of the element's resting (x, y) — dx/dy are added to resting
    position, opacity multiplies the element's normal opacity. At eased=1
    this always resolves to (0, 0, 1.0) i.e. fully settled."""
    remaining = 1.0 - eased  # 1 at the very start, 0 once settled
    if animation == "slide-left":
        return round(SLIDE_DISTANCE * remaining), 0, eased
    if animation == "slide-right":
        return round(-SLIDE_DISTANCE * remaining), 0, eased
    if animation == "slide-up":
        return 0, round(SLIDE_DISTANCE * remaining), eased
    if animation == "slide-down":
        return 0, round(-SLIDE_DISTANCE * remaining), eased
    if animation == "fade":
        return 0, 0, eased
    return 0, 0, 1.0  # "none": always fully settled


def _animated_state(mixin, t: float, x: int, y: int) -> tuple[int, int, float]:
    """Resolve an AnimationMixin-bearing element's (x, y, opacity) at time
    t, given its resting (x, y)."""
    if mixin.animation == "none":
        return x, y, 1.0
    progress = _progress(t, mixin.animation_delay, mixin.animation_duration)
    eased = ease_out_cubic(progress)
    dx, dy, opacity = _offset_for(mixin.animation, eased)
    return x + dx, y + dy, opacity


def _scale_alpha(img: Image.Image, opacity: float) -> Image.Image:
    if opacity >= 1.0:
        return img
    if opacity <= 0.0:
        return Image.new("RGBA", img.size, (0, 0, 0, 0))
    r, g, b, a = img.split()
    a = a.point(lambda v: round(v * opacity))
    return Image.merge("RGBA", (r, g, b, a))


def _paste_with_opacity(canvas: Image.Image, img: Image.Image, x: int, y: int, opacity: float) -> None:
    if opacity <= 0.0:
        return
    if opacity < 1.0:
        img = _scale_alpha(img, opacity)
    canvas.alpha_composite(img, (x, y))


def _draw_rich_line_layer(canvas: Image.Image, line: RichLine, x: int, y: int, opacity: float) -> None:
    """Draw one rich text line at an animated (x, y)/opacity onto `canvas`
    via a transparent scratch layer, so partial opacity alpha-blends
    correctly against whatever is already on the canvas (as opposed to
    overwriting the canvas's own alpha channel in place)."""
    if opacity <= 0.0:
        return
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    _draw_rich_line(draw, line, x=x, y=y, opacity=1.0)
    if opacity < 1.0:
        layer = _scale_alpha(layer, opacity)
    canvas.alpha_composite(layer)


class VideoRenderContext:
    """Pre-fetched images and the static base frame, computed once and
    reused across every output frame."""

    def __init__(self, req: GenerateGraphicRequest):
        self.req = req
        self.base = self._build_base()
        self.logo_img = self._fetch_optional(req.logo)
        self.wordart_img = self._fetch_optional(req.wordart)

    def _fetch_optional(self, block: LogoConfig | WordArtConfig | None) -> Image.Image | None:
        if not block or not block.url:
            return None
        from .rendering import _cover_resize, _fetch_image

        try:
            img = _fetch_image(block.url)
            if block.width > 0 and block.height > 0:
                img = _cover_resize(img, block.width, block.height)
            return img
        except Exception:
            logger.warning("Failed to fetch image %r for video", block.url, exc_info=True)
            return None

    def _build_base(self) -> Image.Image:
        req = self.req
        canvas = Image.new("RGBA", (req.canvas_width, req.canvas_height), (*req.background_color, 255))
        _paste_background(canvas, req)
        _apply_overlay(canvas, req.overlay)
        _apply_overlay(canvas, req.overlay2)
        _paste_secondary_images(canvas, req.secondary_images)
        draw = ImageDraw.Draw(canvas)
        _draw_lines(draw, req.lines)
        return canvas


def _render_frame(ctx: VideoRenderContext, t: float) -> Image.Image:
    req = ctx.req
    frame = ctx.base.copy()

    if ctx.logo_img is not None and req.logo is not None:
        x, y, opacity = _animated_state(req.logo, t, req.logo.x, req.logo.y)
        _paste_with_opacity(frame, ctx.logo_img, x, y, opacity)

    for line in req.rich_lines:
        x, y, opacity = _animated_state(line, t, line.x, line.y)
        _draw_rich_line_layer(frame, line, x, y, opacity)

    # Word art renders last so it always sits on top, matching render_graphic.
    if ctx.wordart_img is not None and req.wordart is not None:
        x, y, opacity = _animated_state(req.wordart, t, req.wordart.x, req.wordart.y)
        _paste_with_opacity(frame, ctx.wordart_img, x, y, opacity)

    return frame


def _global_fade_multiplier(t: float, duration: float, fade_in: float, fade_out: float) -> float:
    mult = 1.0
    if fade_in > 0 and t < fade_in:
        mult = min(mult, t / fade_in)
    if fade_out > 0 and t > duration - fade_out:
        mult = min(mult, max(0.0, (duration - t) / fade_out))
    return max(0.0, min(1.0, mult))


def render_video(video_req: VideoRequest) -> bytes:
    """Render an animate-in-then-hold MP4 clip. Returns raw MP4 bytes.

    The FFMPEG imageio plugin shells out to a real ffmpeg process and can't
    write to an in-memory buffer, so we render to a temp file and read the
    bytes back."""
    req = video_req.base
    fps = max(1, video_req.fps)
    duration = max(0.1, video_req.duration)
    frame_count = max(1, round(fps * duration))

    ctx = VideoRenderContext(req)
    bg_rgb = req.background_color

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        writer = imageio.get_writer(
            tmp_path,
            format="FFMPEG",
            fps=fps,
            codec="libx264",
            quality=8,
            macro_block_size=1,
            output_params=["-pix_fmt", "yuv420p"],
        )
        try:
            for i in range(frame_count):
                t = i / fps
                frame = _render_frame(ctx, t)

                fade_mult = _global_fade_multiplier(t, duration, video_req.fade_in, video_req.fade_out)
                if fade_mult < 1.0:
                    bg = Image.new("RGBA", frame.size, (*bg_rgb, 255))
                    frame = Image.composite(frame, bg, Image.new("L", frame.size, round(255 * fade_mult)))

                rgb = frame.convert("RGB")
                writer.append_data(np.array(rgb))
        finally:
            writer.close()

        return Path(tmp_path).read_bytes()
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
