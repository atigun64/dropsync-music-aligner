from __future__ import annotations

import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

APP_NAME = "music_matcher"
INITIALIZED_FILENAME = "initialized.json"

# Resolve `app/` directory regardless of current working directory
APP_DIR = Path(__file__).resolve().parent.parent
BUNDLED_DATA_DIR = APP_DIR / "data"


def get_user_data_dir() -> Path:
    """Return the OS-specific user data directory for music_matcher."""
    override = os.environ.get("MUSIC_MATCHER_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()

    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")
        return Path(base) / APP_NAME

    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME

    xdg_data_home = os.environ.get("XDG_DATA_HOME")
    if xdg_data_home:
        return Path(xdg_data_home) / APP_NAME
    return Path.home() / ".local" / "share" / APP_NAME


def _migrate_bundled_data(bundled_dir: Path, target_dir: Path) -> bool:
    """Copy bundled app/data contents into the user data directory."""
    if not bundled_dir.is_dir():
        return False

    migrated = False
    for item in bundled_dir.iterdir():
        dest = target_dir / item.name
        if item.is_dir():
            shutil.copytree(item, dest, dirs_exist_ok=True)
        else:
            shutil.copy2(item, dest)
        migrated = True
    return migrated


def initialize_user_data() -> Path:
    """
    Ensure the user data directory exists.

    On first launch, copy any bundled app/data content into the user data
    directory and write initialized.json so migration runs only once.
    """
    data_dir = get_user_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)

    marker_path = data_dir / INITIALIZED_FILENAME
    if marker_path.exists():
        return data_dir

    migrated = _migrate_bundled_data(BUNDLED_DATA_DIR, data_dir)
    marker = {
        "version": 1,
        "initialized_at": datetime.now(timezone.utc).isoformat(),
        "migrated_from_bundled": migrated,
        "bundled_data_dir": str(BUNDLED_DATA_DIR),
        "user_data_dir": str(data_dir),
    }
    marker_path.write_text(json.dumps(marker, indent=2), encoding="utf-8")
    return data_dir
