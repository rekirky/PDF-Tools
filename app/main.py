from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.routers import crop, join

app = FastAPI(title="PDF Tools")

app.include_router(crop.router, prefix="/api")
app.include_router(join.router, prefix="/api/join")
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/")
async def root():
    return FileResponse("app/static/index.html")
