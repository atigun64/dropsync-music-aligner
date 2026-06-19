from pathlib import Path

# Resolve `app/` directory regardless of current working directory
APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / "data"

TRACKS_ROOT = DATA_DIR / "track_library"
STUDIOS_ROOT = DATA_DIR / "studios"
AUDIO_UPLOADS_DIR = DATA_DIR / "audio_uploads"
VIDEO_UPLOADS_DIR = DATA_DIR / "video_uploads"
STUDIO_AUDIOS_DIR = DATA_DIR / "studio_audios"

# Ensure upload directories exist
AUDIO_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
VIDEO_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
STUDIO_AUDIOS_DIR.mkdir(parents=True, exist_ok=True)