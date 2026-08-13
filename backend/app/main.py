from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from .bulk import MAX_BULK_ITEMS, BulkGenerateRequest, render_bulk
from .fonts import list_families
from .models import GenerateGraphicRequest
from .rendering import OUTPUT_FORMATS, render_graphic

logging.basicConfig(level=logging.INFO)

GENERATED_DIR = Path(__file__).resolve().parent.parent / "generated"
GENERATED_DIR.mkdir(exist_ok=True)

# Scratch space for source images uploaded from the frontend (backgrounds,
# logos, secondary images). Not meant as permanent storage — files here just
# need to outlive the request that references their URL. Gitignored.
UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

ALLOWED_UPLOAD_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB

app = FastAPI(title="Post Generator API")

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

app.mount("/assets/files", StaticFiles(directory=GENERATED_DIR), name="generated-assets")
app.mount("/uploads/files", StaticFiles(directory=UPLOADS_DIR), name="uploaded-assets")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/fonts")
def get_fonts() -> dict:
    return {
        "fonts": [
            {"id": f.id, "name": f.name, "has_bold": f.has_bold}
            for f in list_families()
        ]
    }


@app.post("/upload")
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

    url_path = f"/uploads/files/{filename}"
    return {"filename": filename, "path": url_path, "url": str(request.base_url).rstrip("/") + url_path}


@app.post("/generate-graphic")
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


@app.post("/generate-graphic/bulk")
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


@app.get("/assets")
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
            "url": f"/assets/files/{f.name}",
            "created_at": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
        }
        for f in files[:limit]
    ]
    return {"assets": items}
