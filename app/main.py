from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from app.routers import crop, join, split, rotate

app = FastAPI(title="PDF Tools")

app.include_router(crop.router, prefix="/api")
app.include_router(join.router, prefix="/api/join")
app.include_router(split.router, prefix="/api/split")
app.include_router(rotate.router, prefix="/api/rotate")
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/")
async def root():
    response = FileResponse("app/static/index.html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


@app.middleware("http")
async def no_cache_static(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response
