import io

import fitz
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import StreamingResponse

router = APIRouter()

SUPPORTED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/bmp"}
FITZ_TYPE_MAP   = {
    "image/jpeg": "jpeg",
    "image/png":  "png",
    "image/webp": "webp",
    "image/bmp":  "bmp",
}


def _detect_filetype(data: bytes, content_type: str) -> str:
    """Derive fitz filetype from magic bytes, falling back to content-type."""
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return FITZ_TYPE_MAP.get(content_type, "jpeg")


@router.post("/convert")
async def image_to_pdf(
    file: UploadFile = File(...),
    filename: str = Form(default="receipt"),
):
    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file received")

    filetype = _detect_filetype(content, file.content_type or "image/jpeg")

    try:
        img_doc   = fitz.open(stream=content, filetype=filetype)
        pdf_bytes = img_doc.convert_to_pdf()
        img_doc.close()
    except Exception as e:
        raise HTTPException(500, f"Could not convert image to PDF: {e}")

    stem = filename.removesuffix(".pdf").removesuffix(".jpg").removesuffix(".jpeg").removesuffix(".png")
    download_name = f"{stem}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )
