import io
import uuid
import tempfile
from pathlib import Path
from datetime import datetime, timedelta
from typing import List

import fitz
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

router = APIRouter()

sessions: dict[str, dict] = {}


def cleanup_old_sessions():
    cutoff = datetime.utcnow() - timedelta(hours=1)
    expired = [sid for sid, data in sessions.items() if data["created_at"] < cutoff]
    for sid in expired:
        path = Path(sessions[sid]["path"])
        if path.exists():
            path.unlink()
        del sessions[sid]


class RotateRequest(BaseModel):
    session_id: str
    pages: List[int]   # 0-indexed page numbers to rotate
    degrees: int       # 90, 180, or 270


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
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
        raise HTTPException(404, "PDF not found")

    def iterfile():
        with open(path, "rb") as f:
            yield from f

    return StreamingResponse(iterfile(), media_type="application/pdf")


@router.post("/execute")
async def rotate_pdf(body: RotateRequest):
    if body.session_id not in sessions:
        raise HTTPException(404, "Session not found")

    if body.degrees not in (90, 180, 270):
        raise HTTPException(400, "degrees must be 90, 180, or 270")

    session = sessions[body.session_id]
    path = Path(session["path"])
    if not path.exists():
        raise HTTPException(404, "PDF not found")

    if not body.pages:
        raise HTTPException(400, "No pages selected")

    try:
        doc = fitz.open(str(path))
        total = len(doc)

        invalid = [p for p in body.pages if p < 0 or p >= total]
        if invalid:
            raise HTTPException(400, f"Invalid page numbers: {invalid}")

        for page_num in body.pages:
            page = doc[page_num]
            page.set_rotation((page.rotation + body.degrees) % 360)

        output = io.BytesIO()
        doc.save(output)
        output.seek(0)
        doc.close()

        stem = Path(session["filename"]).stem
        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{stem}_rotated.pdf"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Rotate failed: {e}")
