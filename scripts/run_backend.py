"""PyInstaller entrypoint for the packaged desktop backend."""

from __future__ import annotations

import os

import uvicorn

from app.api.app import app


def main() -> None:
    host = os.environ.get("MUSIC_MATCHER_HOST", "127.0.0.1")
    port = int(os.environ.get("MUSIC_MATCHER_PORT", "47891"))
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
