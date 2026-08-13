"""Shared 'save a generated image for the Recent Generations gallery' logic,
used by both the single and bulk generate endpoints."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from . import blob as blob_store

logger = logging.getLogger("post_generator.persist")


def persist_generated(image_bytes: bytes, mime: str, ext: str, generated_dir: Path, suffix: str = "") -> None:
    """Best-effort persistence: Vercel Blob when configured (durable, works
    across serverless instances), local disk otherwise. Never raises —
    losing the persisted copy shouldn't fail a request that already has its
    rendered image."""
    filename = f"{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-{suffix}{uuid.uuid4().hex[:8]}.{ext}"
    try:
        if blob_store.is_configured():
            blob_store.upload(f"generated/{filename}", image_bytes, mime)
        else:
            (generated_dir / filename).write_bytes(image_bytes)
    except Exception:
        logger.warning("Failed to persist generated image", exc_info=True)
