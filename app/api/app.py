from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.frontend import mount_frontend, resolve_static_dir
from app.api.routes.tracks import router as track_router
from app.api.routes.studios import router as studio_router


def create_app(*, serve_frontend: bool | None = None) -> FastAPI:
    app = FastAPI(
        title="Music Matcher API",
        description="API for managing music tracks, studios, and alignments",
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(track_router)
    app.include_router(studio_router)

    @app.get("/health")
    def health_check():
        return {"status": "ok"}

    if serve_frontend is None:
        serve_frontend = os.environ.get("MUSIC_MATCHER_SERVE_FRONTEND", "1") == "1"

    if serve_frontend:
        static_dir = resolve_static_dir()
        if static_dir is not None:
            mount_frontend(app, static_dir)

    return app


app = create_app()
