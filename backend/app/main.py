from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from .bulk import MAX_BULK_ITEMS, BulkGenerateRequest, render_bulk
from .fonts import list_families
from .models import GenerateGraphicRequest
from .rendering import OUTPUT_FORMATS, render_graphic

logging.basicConfig(level=logging.INFO)

# This backend is deployed as a Vercel Service behind a top-level rewrite
# (see vercel.json) that routes /api/backend/* here. Per Vercel's Services
# routing model the service receives the *full, unstripped* request path —
# GET /api/backend/health arrives as /api/backend/health, not /health — so
# every route below is registered under this same prefix, both locally and
# in production, to keep one consistent set of URLs everywhere.
API_PREFIX = "/api/backend"

# Vercel Functions have a read-only filesystem except /tmp, and /tmp itself
# is ephemeral (wiped between cold starts, not shared across instances) —
# fine for this app's "best-effort" scratch/persist behavior, but writing to
# the project directory (the local-dev default) would crash the function
# outright. VERCEL is set automatically in the deployed runtime.
_ON_VERCEL = bool(os.environ.get("VERCEL"))
_DATA_ROOT = Path("/tmp") if _ON_VERCEL else Path(__file__).resolve().parent.parent

GENERATED_DIR = _DATA_ROOT / "generated"
GENERATED_DIR.mkdir(exist_ok=True)

# Scratch space for source images uploaded from the frontend (backgrounds,
# logos, secondary images). Not meant as permanent storage — files here just
# need to outlive the request that references their URL. Gitignored locally;
# ephemeral /tmp on Vercel.
UPLOADS_DIR = _DATA_ROOT / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

ALLOWED_UPLOAD_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB

app = FastAPI(title="Post Generator API")
api = APIRouter(prefix=API_PREFIX)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(f"{API_PREFIX}/assets/files", StaticFiles(directory=GENERATED_DIR), name="generated-assets")
app.mount(f"{API_PREFIX}/uploads/files", StaticFiles(directory=UPLOADS_DIR), name="uploaded-assets")


@api.get("/health")
def health() -> dict:
    return {"status": "ok"}


@api.get("/fonts")
def get_fonts() -> dict:
    return {
        "fonts": [
            {"id": f.id, "name": f.name, "has_bold": f.has_bold}
            for f in list_families()
        ]
    }


@api.post("/upload")
async def upload_image(request: Request, file: UploadFile = File(...)) -> dict:
    """Save an uploaded image to the temp uploads folder and hand back a URL
    that can be dropped straight into background_image_url / logo.url /
    a secondary image's url — the renderer fetches it like any other URL."""
    if file.content_type not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        suffix = ".jpg"
    filename = f"{uuid.uuid4().hex}{suffix}"
    dest = UPLOADS_DIR / filename

    size = 0
    with dest.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File too large (max 15 MB)")
            out.write(chunk)

    url_path = f"{API_PREFIX}/uploads/files/{filename}"
    return {"filename": filename, "path": url_path, "url": str(request.base_url).rstrip("/") + url_path}


@api.post("/generate-graphic")
def generate_graphic(req: GenerateGraphicRequest) -> Response:
    _pil_format, mime, ext = OUTPUT_FORMATS[req.output_format]
    try:
        image_bytes = render_graphic(req)
    except Exception as exc:  # noqa: BLE001 - surface a clean 500 to the client
        logging.getLogger("post_generator.api").exception("Failed to render graphic")
        raise HTTPException(status_code=500, detail=f"Failed to render graphic: {exc}") from exc

    if req.persist:
        filename = f"{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:8]}.{ext}"
        (GENERATED_DIR / filename).write_bytes(image_bytes)

    return Response(content=image_bytes, media_type=mime)


@api.post("/generate-graphic/bulk")
def generate_graphic_bulk(req: BulkGenerateRequest) -> Response:
    if not req.items:
        raise HTTPException(status_code=400, detail="items must not be empty")
    if len(req.items) > MAX_BULK_ITEMS:
        raise HTTPException(status_code=400, detail=f"Too many items (max {MAX_BULK_ITEMS})")

    try:
        zip_bytes = render_bulk(req, GENERATED_DIR)
    except Exception as exc:  # noqa: BLE001 - surface a clean 500 to the client
        logging.getLogger("post_generator.api").exception("Failed to render bulk graphics")
        raise HTTPException(status_code=500, detail=f"Failed to render bulk graphics: {exc}") from exc

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=bulk-graphics.zip"},
    )


@api.get("/assets")
def list_assets(limit: int = 12) -> dict:
    """Most recent persisted graphics, newest first."""
    extensions = {ext for _fmt, _mime, ext in OUTPUT_FORMATS.values()}
    files = sorted(
        (f for ext in extensions for f in GENERATED_DIR.glob(f"*.{ext}")),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    items = [
        {
            "filename": f.name,
            "url": f"{API_PREFIX}/assets/files/{f.name}",
            "created_at": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
        }
        for f in files[:limit]
    ]
    return {"assets": items}


app.include_router(api)
