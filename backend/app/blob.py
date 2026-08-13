"""Minimal Vercel Blob REST client (server-side put/list).

There's no official Python SDK for Vercel Blob, so this talks directly to
the same control-plane REST API the official @vercel/blob JS SDK uses
under the hood (https://vercel.com/api/blob), authenticated with
BLOB_READ_WRITE_TOKEN.

Used for durable image storage in production, where Vercel Functions only
have a read-only filesystem outside /tmp and /tmp itself isn't shared or
persistent across instances. See main.py: every call here is guarded by
`is_configured()`, so local development without the token falls back to
plain local-disk storage unchanged.
"""
from __future__ import annotations

import os
from typing import Optional

import requests

_API_BASE = "https://vercel.com/api/blob"
_API_VERSION = "12"
_TIMEOUT = 20  # seconds


def is_configured() -> bool:
    return bool(os.environ.get("BLOB_READ_WRITE_TOKEN"))


def _headers(extra: Optional[dict] = None) -> dict:
    token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN is not set")
    headers = {"authorization": f"Bearer {token}", "x-api-version": _API_VERSION}
    if extra:
        headers.update(extra)
    return headers


def upload(pathname: str, data: bytes, content_type: str) -> dict:
    """Upload bytes to a public blob at `pathname` (no random suffix — the
    caller is expected to pass an already-unique name). Returns the API
    response dict: {url, downloadUrl, pathname, contentType, ...}."""
    resp = requests.put(
        f"{_API_BASE}/",
        params={"pathname": pathname},
        headers=_headers(
            {
                "x-vercel-blob-access": "public",
                "x-add-random-suffix": "0",
                "x-content-type": content_type,
            }
        ),
        data=data,
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def list_blobs(prefix: str, limit: int = 100) -> list[dict]:
    """List blobs under `prefix`. Returns raw API items:
    [{url, downloadUrl, pathname, size, uploadedAt, etag}, ...]."""
    resp = requests.get(
        f"{_API_BASE}/",
        headers=_headers(),
        params={"prefix": prefix, "limit": limit},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("blobs", [])
