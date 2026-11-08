"""Punto de entrada de FastAPI."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, ORJSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api.routes_analyze import router as analyze_router
from .api.routes_clips import router as clips_router
from .api.routes_files import router as files_router
from .api.routes_jobs import router as jobs_router
from .api.routes_lyrics import router as lyrics_router
from .api.routes_project import router as project_router
from .api.routes_render import router as render_router
from .api.routes_system import router as system_router
from .api.routes_upload import router as upload_router
from .core.config import APP_NAME, APP_VERSION, settings
from .core.errors import (
    AppError,
    app_error_handler,
    http_error_handler,
    unexpected_error_handler,
    validation_error_handler,
)
from .core.paths import FRONTEND_DIST, ensure_dirs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("music-clip-studio")

app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    default_response_class=ORJSONResponse,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        *settings.dev_origins,
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(StarletteHTTPException, http_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(Exception, unexpected_error_handler)

for router in (
    system_router,
    project_router,
    upload_router,
    analyze_router,
    clips_router,
    jobs_router,
    lyrics_router,
    render_router,
    files_router,
):
    app.include_router(router)


@app.on_event("startup")
async def on_startup() -> None:
    ensure_dirs()
    logger.info("%s %s listo", APP_NAME, APP_VERSION)
    logger.info("FFmpeg: %s", "disponible" if settings else "?")


# Servido del frontend compilado (modo producción) con fallback SPA.
if FRONTEND_DIST.exists():
    assets = FRONTEND_DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"error": {"code": "not_found", "message": "Endpoint no encontrado"}})
        candidate = (FRONTEND_DIST / full_path).resolve()
        if FRONTEND_DIST.resolve() in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(index)
        return JSONResponse(status_code=404, content={"error": {"code": "not_found", "message": "Frontend no compilado"}})
else:

    @app.get("/")
    async def dev_root() -> dict:
        return {
            "app": APP_NAME,
            "version": APP_VERSION,
            "mode": "development",
            "frontend": "Ejecuta `npm run dev` en frontend/ (Vite :5173).",
            "docs": "/api/docs",
        }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level="info",
    )
