from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def resolve_static_dir() -> Path | None:
    env = os.environ.get("MUSIC_MATCHER_STATIC_DIR")
    if env:
        path = Path(env).expanduser().resolve()
        return path if path.is_dir() else None

    dist = PROJECT_ROOT / "frontend" / "dist"
    return dist if dist.is_dir() else None


def mount_frontend(app: FastAPI, static_dir: Path) -> None:
    static_dir = static_dir.resolve()
    index_path = static_dir / "index.html"
    if not index_path.is_file():
        return

    assets_dir = static_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_handler(full_path: str = "") -> FileResponse:
        if full_path.startswith("api/") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not found")

        if full_path:
            candidate = static_dir / full_path
            if candidate.is_file():
                return FileResponse(candidate)

        return FileResponse(index_path)
