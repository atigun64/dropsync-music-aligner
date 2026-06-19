from pathlib import Path
from pydub import AudioSegment
from app.services.track_service import TrackService
from app.storage.config import STUDIO_AUDIOS_DIR, STUDIOS_ROOT
from app.models import AlignmentSpec
from app.storage.studio_store import StudioStore


def _studio_audio_path(studio_id: str) -> Path:
    STUDIO_AUDIOS_DIR.mkdir(parents=True, exist_ok=True)
    return STUDIO_AUDIOS_DIR / f"{studio_id}.mp3"

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

    studio_store = StudioStore()

    if not audio_path.exists() or (
        studio_store.alignment_path(studio_id).exists() and studio_store.alignment_mtime(studio_id) > audio_path.stat().st_mtime
    ):
        print("changed!")
        _make_music_file_from_alignment_spec(alignment, studio_id)
    else:
        print("unchanged!")

    return audio_path
