#!/usr/bin/env python3
"""Bundle the FastAPI backend with PyInstaller for desktop releases."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENTRY = ROOT / "scripts" / "run_backend.py"
DIST = ROOT / "dist-backend"
WORK = ROOT / "build-backend"
NAME = "music-matcher-backend"


def main() -> int:
    if not ENTRY.is_file():
        print(f"Missing entry script: {ENTRY}", file=sys.stderr)
        return 1

    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print(
            "PyInstaller is required. Install build deps with:\n"
            "  pip install -r requirements-build.txt",
            file=sys.stderr,
        )
        return 1

    if DIST.exists():
        shutil.rmtree(DIST)
    WORK.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name",
        NAME,
        "--onedir",
        "--clean",
        "--noconfirm",
        f"--distpath={DIST}",
        f"--workpath={WORK}",
        f"--specpath={WORK}",
        f"--paths={ROOT}",
        "--collect-all",
        "essentia",
        "--collect-all",
        "uvicorn",
        "--collect-all",
        "fastapi",
        "--collect-all",
        "starlette",
        "--collect-all",
        "librosa",
        "--collect-submodules",
        "app",
        "--hidden-import",
        "app.api.app",
        str(ENTRY),
    ]

    print("Running:", " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)

    output_dir = DIST / NAME
    if not output_dir.is_dir():
        print(f"Expected backend bundle at {output_dir}", file=sys.stderr)
        return 1

    print(f"Backend bundle ready: {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
