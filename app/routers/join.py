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


class JoinRequest(BaseModel):
    files: List[str]   # session IDs in desired order
    output_name: str = "joined"


@router.post("/upload")
async def upload_pdfs(files: List[UploadFile] = File(...)):
    cleanup_old_sessions()

    result = []
    for file in files:
        if not (file.filename or "").lower().endswith(".pdf"):
            raise HTTPException(400, f'"{file.filename}" is not a PDF')

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
            raise HTTPException(400, f'Could not open "{file.filename}"')

        session_id = str(uuid.uuid4())
        sessions[session_id] = {
            "path": tmp.name,
            "created_at": datetime.utcnow(),
            "filename": file.filename or "document.pdf",
        }
        result.append({
            "id": session_id,
            "filename": file.filename,
            "page_count": page_count,
        })

    return JSONResponse(result)


@router.post("/execute")
async def join_pdfs(body: JoinRequest):
    if len(body.files) < 2:
        raise HTTPException(400, "At least 2 files are required")

    for sid in body.files:
        if sid not in sessions:
            raise HTTPException(404, "One or more files have expired — please re-upload")

    try:
        merged = fitz.open()
        for sid in body.files:
            path = Path(sessions[sid]["path"])
            doc = fitz.open(str(path))
            merged.insert_pdf(doc)
            doc.close()

        output = io.BytesIO()
        merged.save(output)
        output.seek(0)
        merged.close()

        download_name = f"{body.output_name}_joined.pdf"
        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Join failed: {e}")
