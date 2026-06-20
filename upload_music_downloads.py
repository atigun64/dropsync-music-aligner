#!/usr/bin/env python3
"""
Batch upload all audio files from music_downloads folder to the Music Matcher backend.
"""

import os
import sys
from pathlib import Path
from typing import List, Tuple
import requests
from requests.exceptions import RequestException
import time

# Configuration
BASE_URL = "http://localhost:8000"
UPLOAD_ENDPOINT = f"{BASE_URL}/api/tracks/upload"
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg"}
MUSIC_DOWNLOADS_DIR = Path(__file__).parent / "music_downloads"
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds


def find_audio_files(root_dir: Path) -> List[Path]:
    """Find all audio files in the directory tree."""
    audio_files = []
    for ext in AUDIO_EXTENSIONS:
        audio_files.extend(root_dir.glob(f"**/*{ext}"))
    return sorted(audio_files)


def upload_file(file_path: Path) -> Tuple[bool, str]:
    """
    Upload a single file to the backend.
    Returns (success: bool, message: str)
    """
    if not file_path.exists():
        return False, f"File not found: {file_path}"

    try:
        with open(file_path, "rb") as f:
            files = {"file": (file_path.name, f, "audio/mpeg")}
            
            for attempt in range(MAX_RETRIES):
                try:
                    response = requests.post(
                        UPLOAD_ENDPOINT,
                        files=files,
                        timeout=60,
                    )
                    response.raise_for_status()
                    
                    data = response.json()
                    track_id = data.get("id", "unknown")
                    return True, f"Uploaded as track ID: {track_id}"
                    
                except RequestException as e:
                    if attempt < MAX_RETRIES - 1:
                        print(f"  ⚠️  Attempt {attempt + 1} failed, retrying in {RETRY_DELAY}s...")
                        time.sleep(RETRY_DELAY)
                    else:
                        return False, f"Upload failed after {MAX_RETRIES} attempts: {str(e)}"
                        
    except Exception as e:
        return False, f"Error reading file: {str(e)}"


def main():
    """Main upload process."""
    if not MUSIC_DOWNLOADS_DIR.exists():
        print(f"❌ Directory not found: {MUSIC_DOWNLOADS_DIR}")
        sys.exit(1)

    # Find all audio files
    audio_files = find_audio_files(MUSIC_DOWNLOADS_DIR)
    
    if not audio_files:
        print("❌ No audio files found in music_downloads/")
        sys.exit(1)

    print(f"📁 Found {len(audio_files)} audio files to upload")
    print(f"🎵 Backend: {UPLOAD_ENDPOINT}\n")

    # Check backend connectivity
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        response.raise_for_status()
        print("✅ Backend is reachable\n")
    except RequestException:
        print("❌ Cannot reach backend at {BASE_URL}")
        print("   Make sure the backend is running (uvicorn app.api.app:app --reload)")
        sys.exit(1)

    # Upload files
    successful = 0
    failed = 0
    failed_files = []

    for idx, file_path in enumerate(audio_files, 1):
        relative_path = file_path.relative_to(MUSIC_DOWNLOADS_DIR)
        print(f"[{idx}/{len(audio_files)}] {relative_path}")
        
        success, message = upload_file(file_path)
        
        if success:
            print(f"  ✅ {message}")
            successful += 1
        else:
            print(f"  ❌ {message}")
            failed += 1
            failed_files.append((relative_path, message))

    # Summary
    print(f"\n{'='*60}")
    print(f"Upload Complete!")
    print(f"  ✅ Successful: {successful}")
    print(f"  ❌ Failed: {failed}")
    print(f"  📊 Total: {len(audio_files)}")
    
    if failed_files:
        print(f"\nFailed files:")
        for file_path, message in failed_files:
            print(f"  • {file_path}: {message}")
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
