from pathlib import Path
import re
import shutil
import subprocess
from fastapi import UploadFile
from app.storage.config import VIDEO_UPLOADS_DIR

def _safe_filename(name: str) -> str:
    name = Path(name).name
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", name) or "video"


def _video_extension_from_filename(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if re.fullmatch(r"\.[a-z0-9]+", ext):
        return ext
    return ".mp4"


def _strip_audio_from_video(video_path: Path) -> None:
    ffmpeg_exe = shutil.which("ffmpeg")
    if ffmpeg_exe is None:
        raise RuntimeError("ffmpeg is required to remove audio from uploaded video")

    temp_path = video_path.with_name(video_path.stem + ".noaudio" + video_path.suffix)
    command = [
        ffmpeg_exe,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(video_path),
        "-c:v",
        "copy",
        "-an",
        str(temp_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed to strip audio from video: {result.stderr.strip() or result.stdout.strip()}"
        )

    temp_path.replace(video_path)


def save_uploaded_video_file_permanently(file: UploadFile, studio_id: str) -> Path:
    VIDEO_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    extension = _video_extension_from_filename(file.filename)
    final_path = VIDEO_UPLOADS_DIR / f"{studio_id}{extension}"

    with final_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    _strip_audio_from_video(final_path)
    return final_path
