"""Bulk generation: one template config (the current form/preset) — logo,
images, colors, overlay, positions all stay identical across every item —
varying only the background image and the text of one or more rich-text
spans per item, packaged into a single downloadable zip."""
from __future__ import annotations

import io
import logging
import zipfile
from pathlib import Path
from typing import List, Optional, Tuple

from pydantic import BaseModel, Field

from .models import GenerateGraphicRequest
from .persist import persist_generated
from .rendering import OUTPUT_FORMATS, render_graphic

logger = logging.getLogger("post_generator.bulk")

MAX_BULK_ITEMS = 200


class BulkItem(BaseModel):
    background_image_url: Optional[str] = None
    # Positionally aligned with BulkGenerateRequest.target_fields: texts[i]
    # overrides the span at target_fields[i]. A shorter list (or a null
    # entry) just leaves the remaining/omitted fields at their preset text.
    texts: List[Optional[str]] = Field(default_factory=list)


class BulkGenerateRequest(BaseModel):
    base: GenerateGraphicRequest
    items: List[BulkItem] = Field(default_factory=list)
    # Each (line_index, span_index) pair into base.rich_lines that this
    # batch's item texts can override, in order. Empty (the default) means
    # "every span of every rich line" — i.e. only the text changes per item,
    # everything else (logo, images, colors, positions) stays the preset's.
    target_fields: List[Tuple[int, int]] = Field(default_factory=list)


def _resolve_target_fields(req: BulkGenerateRequest) -> List[Tuple[int, int]]:
    if req.target_fields:
        return req.target_fields
    return [(li, si) for li, line in enumerate(req.base.rich_lines) for si in range(len(line.spans))]


def _build_item_request(
    base: GenerateGraphicRequest, item: BulkItem, target_fields: List[Tuple[int, int]]
) -> GenerateGraphicRequest:
    req = base.model_copy(deep=True)
    if item.background_image_url:
        req.background_image_url = item.background_image_url
    for (line_idx, span_idx), text in zip(target_fields, item.texts):
        if text is None:
            continue
        try:
            req.rich_lines[line_idx].spans[span_idx].text = text
        except IndexError:
            logger.warning(
                "target field line=%d/span=%d out of range; text override skipped", line_idx, span_idx
            )
    return req


def render_bulk(req: BulkGenerateRequest, generated_dir: Path) -> bytes:
    """Render every item and return a zip archive of the encoded images.
    Individual item failures are logged and skipped rather than aborting
    the whole batch."""
    _pil_format, mime, ext = OUTPUT_FORMATS[req.base.output_format]
    target_fields = _resolve_target_fields(req)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, item in enumerate(req.items, start=1):
            item_req = _build_item_request(req.base, item, target_fields)
            try:
                image_bytes = render_graphic(item_req)
            except Exception:
                logger.warning("Failed to render bulk item %d", idx, exc_info=True)
                continue

            filename = f"{idx:03d}.{ext}"
            zf.writestr(filename, image_bytes)

            if req.base.persist:
                persist_generated(image_bytes, mime, ext, generated_dir, suffix=f"bulk{idx:03d}-")

    return buf.getvalue()
