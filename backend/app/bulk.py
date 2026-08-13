"""Bulk generation: one template config (the current form/preset), varying
the background image and a single target text span per item, packaged into
a single downloadable zip."""
from __future__ import annotations

import io
import logging
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field

from .models import GenerateGraphicRequest
from .rendering import OUTPUT_FORMATS, render_graphic

logger = logging.getLogger("post_generator.bulk")

MAX_BULK_ITEMS = 200


class BulkItem(BaseModel):
    background_image_url: Optional[str] = None
    text: Optional[str] = None


class BulkGenerateRequest(BaseModel):
    base: GenerateGraphicRequest
    items: List[BulkItem] = Field(default_factory=list)
    target_line: int = 0  # index into base.rich_lines whose span gets item.text
    target_span: int = 0  # index into that line's spans


def _build_item_request(
    base: GenerateGraphicRequest, item: BulkItem, target_line: int, target_span: int
) -> GenerateGraphicRequest:
    req = base.model_copy(deep=True)
    if item.background_image_url:
        req.background_image_url = item.background_image_url
    if item.text is not None:
        try:
            req.rich_lines[target_line].spans[target_span].text = item.text
        except IndexError:
            logger.warning(
                "target_line=%d/target_span=%d out of range; text override skipped",
                target_line,
                target_span,
            )
    return req


def render_bulk(req: BulkGenerateRequest, generated_dir: Path) -> bytes:
    """Render every item and return a zip archive of the encoded images.
    Individual item failures are logged and skipped rather than aborting
    the whole batch."""
    _pil_format, _mime, ext = OUTPUT_FORMATS[req.base.output_format]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, item in enumerate(req.items, start=1):
            item_req = _build_item_request(req.base, item, req.target_line, req.target_span)
            try:
                image_bytes = render_graphic(item_req)
            except Exception:
                logger.warning("Failed to render bulk item %d", idx, exc_info=True)
                continue

            filename = f"{idx:03d}.{ext}"
            zf.writestr(filename, image_bytes)

            if req.base.persist:
                persisted_name = f"{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-bulk{idx:03d}.{ext}"
                (generated_dir / persisted_name).write_bytes(image_bytes)

    return buf.getvalue()
