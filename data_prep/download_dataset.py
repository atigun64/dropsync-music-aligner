# download_ncs_dataset.py
#
# Requirements:
#   pip install yt-dlp
#
# Optional (recommended):
#   Install ffmpeg and make sure it's in PATH
#
# Usage:
#   python download_ncs_dataset.py
#
# This script:
#   - downloads many NCS songs
#   - extracts audio as mp3
#   - saves metadata
#   - creates a clean dataset structure

import os
import json
from pathlib import Path
from yt_dlp import YoutubeDL

# =========================
# CONFIG
# =========================

OUTPUT_DIR = "ncs_dataset"

# Official NCS uploads playlist/channel
NCS_URL = "https://www.youtube.com/@NoCopyrightSounds/videos"

# Max number of songs to download
MAX_DOWNLOADS = 300

# =========================
# SETUP
# =========================

Path(OUTPUT_DIR).mkdir(exist_ok=True)

# =========================
# YT-DLP OPTIONS
# =========================

ydl_opts = {
    "format": "bestaudio/best",
    "extractaudio": True,
    "audioformat": "mp3",
    "outtmpl": f"{OUTPUT_DIR}/%(id)s/%(title)s.%(ext)s",
    "ignoreerrors": True,
    "quiet": False,
    "playlistend": MAX_DOWNLOADS,

    # Extract audio
    "postprocessors": [
        {
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }
    ],
}

# =========================
# DOWNLOAD
# =========================

with YoutubeDL(ydl_opts) as ydl:

    info = ydl.extract_info(NCS_URL, download=True)

    entries = info.get("entries", [])

    for entry in entries:

        if entry is None:
            continue

        video_id = entry.get("id", "unknown")

        track_dir = Path(OUTPUT_DIR) / video_id
        track_dir.mkdir(exist_ok=True)

        metadata = {
            "title": entry.get("title"),
            "uploader": entry.get("uploader"),
            "duration": entry.get("duration"),
            "view_count": entry.get("view_count"),
            "upload_date": entry.get("upload_date"),
            "youtube_url": f"https://youtube.com/watch?v={video_id}",
            "description": entry.get("description"),
            "tags": entry.get("tags"),
        }

        metadata_path = track_dir / "metadata.json"

        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

print("\nDone.")