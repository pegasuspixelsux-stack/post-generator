"""Video export: renders an 'animate in, then hold' MP4 clip from a
GenerateGraphicRequest plus per-element AnimationMixin settings.

Scope (per product decision): only the logo, word-art image, and rich text
lines animate. The overlay, secondary images, and decorative line shapes are
static and are pre-rendered once into a transparent layer reused on every
output frame (cheap: no re-compositing per frame). The background is
normally static too (a single fetched image, or just background_color) — but
`VideoRequest.background_video_url` lets it instead be an uploaded MP4,
decoded and cover-resized frame-by-frame, with everything else composited on
top of each of *its* frames.

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
import math
import os
import tempfile
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
import requests
from PIL import Image, ImageDraw

from .models import GenerateGraphicRequest, LogoConfig, RichLine, VideoRequest, WordArtConfig
from .rendering import (
    _FETCH_TIMEOUT,
    _apply_overlay,
    _cover_resize,
    _draw_lines,
    _draw_rich_line,
    _paste_background,
    _paste_secondary_images,
)

logger = logging.getLogger("post_generator.video")

SLIDE_DISTANCE = 260  # px an element travels in from, for slide-* animations

# Safety cap on how much of an uploaded background video gets rendered, so a
# huge upload fails fast with a clear error instead of hanging the request
# for minutes. 60s covers every realistic social-post use case.
MAX_BACKGROUND_VIDEO_SECONDS = 60


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
    """Pre-fetched images and the static layers, computed once and reused
    across every output frame. `background` is the final static
    background+overlay+secondary-images+lines composite, used directly when
    there's no background video. `static_layer` is just overlay+secondary-
    images+lines on transparent — used instead when a background video is
    set, so each of *its* frames can be composited underneath it."""

    def __init__(self, req: GenerateGraphicRequest):
        self.req = req
        self.static_layer = self._build_static_layer()
        self.background = self._build_static_background()
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

    def _build_static_layer(self) -> Image.Image:
        """Overlay/overlay2 + secondary images + decorative lines, on an
        otherwise transparent canvas — independent of what the background
        ends up being (a static image/color, or an uploaded video's frames)."""
        req = self.req
        layer = Image.new("RGBA", (req.canvas_width, req.canvas_height), (0, 0, 0, 0))
        _apply_overlay(layer, req.overlay)
        _apply_overlay(layer, req.overlay2)
        _paste_secondary_images(layer, req.secondary_images)
        draw = ImageDraw.Draw(layer)
        _draw_lines(draw, req.lines)
        return layer

    def _build_static_background(self) -> Image.Image:
        """background_color + background_image_url, with the static layer
        composited on top — the complete base frame for the (default)
        no-background-video case, matching the pre-video-background
        behavior exactly."""
        req = self.req
        canvas = Image.new("RGBA", (req.canvas_width, req.canvas_height), (*req.background_color, 255))
        _paste_background(canvas, req)
        canvas.alpha_composite(self.static_layer)
        return canvas


def _render_frame(ctx: VideoRenderContext, t: float, background_frame: Image.Image | None = None) -> Image.Image:
    """Render one output frame at time `t`. `background_frame` is a
    already-cover-resized RGBA frame decoded from the background video, for
    the frame-varies-every-time case; omitted, `ctx.background` (static) is
    used instead."""
    req = ctx.req
    if background_frame is not None:
        frame = background_frame.copy()
        frame.alpha_composite(ctx.static_layer)
    else:
        frame = ctx.background.copy()

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


def _sane_fps(value: object, fallback: float) -> float:
    """Coerce a video's reported fps into something usable — some
    codecs/containers report None, 0, or an unreasonable/infinite value."""
    try:
        value = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(value) or value <= 0:
        return fallback
    return max(1.0, min(120.0, value))


def _open_background_video(url: str) -> tuple[imageio.plugins.ffmpeg.FfmpegFormat.Reader, float, int, str]:
    """Download `url` to a temp file and open it as an imageio video reader.
    Returns (reader, fps, frame_count, tmp_path); frame_count is capped at
    MAX_BACKGROUND_VIDEO_SECONDS worth of frames — if the source's own
    duration is unknown, frame reads simply stop early once it's exhausted
    (see render_video). Caller must reader.close() and os.unlink(tmp_path)."""
    resp = requests.get(url, timeout=_FETCH_TIMEOUT)
    resp.raise_for_status()

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(resp.content)
        tmp_path = tmp.name

    reader = imageio.get_reader(tmp_path, format="FFMPEG")
    meta = reader.get_meta_data()
    fps = _sane_fps(meta.get("fps"), fallback=30.0)

    cap = max(1, round(fps * MAX_BACKGROUND_VIDEO_SECONDS))
    duration = meta.get("duration")
    if isinstance(duration, (int, float)) and math.isfinite(duration) and duration > 0:
        frame_count = min(cap, max(1, round(fps * duration)))
    else:
        frame_count = cap

    return reader, fps, frame_count, tmp_path


def render_video(video_req: VideoRequest) -> bytes:
    """Render an animate-in-then-hold MP4 clip. Returns raw MP4 bytes.

    The FFMPEG imageio plugin shells out to a real ffmpeg process and can't
    write to an in-memory buffer, so both the output and (when fetching a
    background video) the input are staged through temp files."""
    req = video_req.base
    ctx = VideoRenderContext(req)
    bg_rgb = req.background_color

    reader = None
    source_tmp_path = None
    try:
        if video_req.background_video_url:
            reader, fps, frame_count, source_tmp_path = _open_background_video(video_req.background_video_url)
        else:
            fps = max(1, video_req.fps)
            frame_count = max(1, round(fps * max(0.1, video_req.duration)))
        duration = frame_count / fps

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

                    background_frame = None
                    if reader is not None:
                        try:
                            raw = reader.get_data(i)
                        except (IndexError, StopIteration):
                            break  # source video ran out before the estimated frame_count

                        background_frame = _cover_resize(
                            Image.fromarray(raw).convert("RGBA"), req.canvas_width, req.canvas_height
                        )

                    frame = _render_frame(ctx, t, background_frame)

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
    finally:
        if reader is not None:
            reader.close()
        if source_tmp_path is not None:
            try:
                os.unlink(source_tmp_path)
            except OSError:
                pass
