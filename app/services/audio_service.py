import hashlib
import json
from pathlib import Path

from pydub import AudioSegment

from app.models import AlignmentSpec
from app.services.track_service import TrackService
from app.storage.config import STUDIO_AUDIOS_DIR


def _studio_audio_path(studio_id: str) -> Path:
    STUDIO_AUDIOS_DIR.mkdir(parents=True, exist_ok=True)
    return STUDIO_AUDIOS_DIR / f"{studio_id}.mp3"


def _studio_audio_stamp_path(studio_id: str) -> Path:
    return STUDIO_AUDIOS_DIR / f"{studio_id}.audio_stamp"


def _alignment_audio_fingerprint(alignment: AlignmentSpec) -> str:
    """Hash only fields that affect rendered studio audio."""
    payload = [
        {
            "track_id": t.track_id,
            "start_time_seconds": float(t.start_time_seconds),
            "speed": float(t.speed),
        }
        for t in alignment.tracks
    ]
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

def _make_music_file_from_alignment_spec(alignment: AlignmentSpec, studio_id: str) -> Path:
    out_path = _studio_audio_path(studio_id)

    ts = TrackService()

    segments: list[tuple[AudioSegment, int]] = []

    for t in alignment.tracks:
        try:
            rec = ts.load_track(t.track_id)
        except FileNotFoundError:
            continue

        if not rec.audio_path:
            continue

        src = AudioSegment.from_file(rec.audio_path)

        if t.speed and abs(t.speed - 1.0) > 1e-6:
            new_frame_rate = int(src.frame_rate * float(t.speed))
            src = src._spawn(src.raw_data, overrides={"frame_rate": new_frame_rate}).set_frame_rate(src.frame_rate)

        start_ms = max(0, int(t.start_time_seconds * 1000))

        segments.append((src, start_ms))

    if not segments:
        silent = AudioSegment.silent(duration=1000)
        silent.export(out_path, format="mp3", bitrate="192k")
        return out_path

    total_ms = max(start_ms + len(seg) for seg, start_ms in segments)
    master = AudioSegment.silent(duration=total_ms)

    for seg, start_ms in segments:
        master = master.overlay(seg, position=start_ms)

    master.export(out_path, format="mp3", bitrate="320k")
    return out_path


def ensure_studio_audio_for_alignment(alignment: AlignmentSpec, studio_id: str) -> Path:
    audio_path = _studio_audio_path(studio_id)
    stamp_path = _studio_audio_stamp_path(studio_id)
    fingerprint = _alignment_audio_fingerprint(alignment)

    stamp_matches = (
        stamp_path.exists()
        and stamp_path.read_text(encoding="utf-8").strip() == fingerprint
    )

    if not audio_path.exists() or not stamp_matches:
        _make_music_file_from_alignment_spec(alignment, studio_id)
        stamp_path.write_text(fingerprint, encoding="utf-8")

    return audio_path
