from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.routers import crop, join, split

app = FastAPI(title="PDF Tools")

app.include_router(crop.router, prefix="/api")
app.include_router(join.router, prefix="/api/join")
app.include_router(split.router, prefix="/api/split")
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/")
async def root():
    return FileResponse("app/static/index.html")
