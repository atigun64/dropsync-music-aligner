from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.tracks import router as track_router
from app.api.routes.studios import router as studio_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="Music Matcher API",
        description="API for managing music tracks, studios, and alignments",
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # tighten later
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(track_router)
    app.include_router(studio_router)

    @app.get("/health")
    def health_check():
        return {"status": "ok"}

    return app


app = create_app()
