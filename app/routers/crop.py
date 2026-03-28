import io
import uuid
import tempfile
from pathlib import Path
from datetime import datetime, timedelta

import fitz  # PyMuPDF
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

router = APIRouter()

# In-memory session store: {session_id: {path, created_at, filename}}
sessions: dict[str, dict] = {}


def cleanup_old_sessions():
    cutoff = datetime.utcnow() - timedelta(hours=1)
    expired = [sid for sid, data in sessions.items() if data["created_at"] < cutoff]
    for sid in expired:
        path = Path(sessions[sid]["path"])
        if path.exists():
            path.unlink()
        del sessions[sid]


class CropRequest(BaseModel):
    session_id: str
    page: int
    x0: float
    y0: float
    x1: float
    y1: float


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        # Some browsers send octet-stream, check extension too
        if not (file.filename or "").lower().endswith(".pdf"):
            raise HTTPException(400, "File must be a PDF")

    cleanup_old_sessions()

    content = await file.read()

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.write(content)
    tmp.close()

    try:
        doc = fitz.open(tmp.name)
        page_count = len(doc)
        doc.close()
    except Exception:
        Path(tmp.name).unlink(missing_ok=True)
        raise HTTPException(400, "Could not open PDF — file may be corrupt")

    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "path": tmp.name,
        "created_at": datetime.utcnow(),
        "filename": file.filename or "document.pdf",
    }

    return JSONResponse({"session_id": session_id, "page_count": page_count})


@router.get("/pdf/{session_id}")
async def get_pdf(session_id: str):
    if session_id not in sessions:
        raise HTTPException(404, "Session not found")
    path = Path(sessions[session_id]["path"])
    if not path.exists():
        raise HTTPException(404, "PDF file not found")

    def iterfile():
        with open(path, "rb") as f:
            yield from f

    return StreamingResponse(iterfile(), media_type="application/pdf")


@router.post("/crop")
async def crop_pdf(body: CropRequest):
    if body.session_id not in sessions:
        raise HTTPException(404, "Session not found")

    session = sessions[body.session_id]
    path = Path(session["path"])
    if not path.exists():
        raise HTTPException(404, "PDF file not found")

    try:
        doc = fitz.open(str(path))

        if body.page < 0 or body.page >= len(doc):
            raise HTTPException(400, f"Page {body.page} is out of range")

        page = doc[body.page]
        page_rect = page.rect
        crop_rect = fitz.Rect(body.x0, body.y0, body.x1, body.y1)

        # Clamp to page bounds
        crop_rect = crop_rect & page_rect
        if crop_rect.is_empty:
            raise HTTPException(400, "Crop area is outside the page bounds")

        # Build a new single-page PDF with exactly the cropped dimensions
        new_doc = fitz.open()
        new_page = new_doc.new_page(width=crop_rect.width, height=crop_rect.height)
        new_page.show_pdf_page(new_page.rect, doc, body.page, clip=crop_rect)

        output = io.BytesIO()
        new_doc.save(output)
        output.seek(0)

        doc.close()
        new_doc.close()

        stem = Path(session["filename"]).stem
        download_name = f"{stem}_cropped.pdf"

        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Crop failed: {e}")
