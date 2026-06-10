# Remove tracks longer than 10 minutes from the dataset.
# This deletes the track directory, cached feature files, split references, labeled samples, and download/drop manifest entries.
import argparse
import json
import shutil
import sys
from pathlib import Path

SCRIPT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_ROOT.parent.parent))

from music_drop.src.cache.feature_cache import AudioFeatureCache, collect_audio_files

DATA_ROOT = SCRIPT_ROOT.parent / "data"
DATASET_ROOT = DATA_ROOT / "music_dataset"
SPLIT_DIR = DATA_ROOT / "split"
LABELED_DIR = DATA_ROOT / "labeled_samples"
DOWNLOADS_FILE = DATASET_ROOT / "downloaded.txt"
DROP_POINTS_FILE = DATA_ROOT / "drop_points.txt"
FEATURE_CACHE_ROOT = DATA_ROOT / "feature_cache"
AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".opus"}
DEFAULT_THRESHOLD_MINUTES = 10.0


def get_track_ids() -> list[str]:
    return sorted([
        p.name
        for p in DATASET_ROOT.iterdir()
        if p.is_dir()
    ])


def find_audio_file(track_dir: Path) -> Path | None:
    for file in track_dir.iterdir():
        if file.is_file() and file.suffix.lower() in AUDIO_EXTS:
            return file
    return None


def get_track_duration_seconds(audio_path: Path) -> float:
    try:
        from mutagen import File as MutagenFile

        audio = MutagenFile(audio_path)
        if audio is not None and hasattr(audio, "info") and hasattr(audio.info, "length"):
            return float(audio.info.length)
    except Exception:
        pass

    return audio_path.stat().st_size * 8 / 128_000


def filter_lines(lines: list[str], track_ids: set[str]) -> list[str]:
    return [line for line in lines if line.strip() not in track_ids]


def read_text_file(path: Path) -> list[str]:
    if not path.exists():
        return []
    return path.read_text(encoding="utf-8").splitlines(keepends=True)


def write_text_file(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(lines), encoding="utf-8")


def update_split_files(long_tracks: set[str], dry_run: bool) -> None:
    for filename in ["train", "eval"]:
        path = SPLIT_DIR / filename
        if not path.exists():
            continue
        lines = read_text_file(path)
        filtered = filter_lines(lines, long_tracks)
        if len(filtered) != len(lines):
            print(f"Updating split file: {path} ({len(lines) - len(filtered)} removed)")
            if not dry_run:
                write_text_file(path, filtered)


def update_labeled_samples(long_tracks: set[str], dry_run: bool) -> None:
    for path in sorted(LABELED_DIR.glob("*.jsonl")):
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8") as f:
            records = [json.loads(line) for line in f if line.strip()]
        filtered = [rec for rec in records if rec.get("track_id") not in long_tracks]
        if len(filtered) != len(records):
            print(f"Updating labeled samples file: {path} ({len(records) - len(filtered)} removed)")
            if not dry_run:
                with path.open("w", encoding="utf-8") as f:
                    for rec in filtered:
                        f.write(json.dumps(rec) + "\n")


def update_downloaded_file(long_tracks: set[str], dry_run: bool) -> None:
    if not DOWNLOADS_FILE.exists():
        return
    lines = read_text_file(DOWNLOADS_FILE)
    filtered = []
    removed = 0
    for line in lines:
        stripped = line.strip()
        if not stripped:
            filtered.append(line)
            continue
        parts = stripped.split(None, 1)
        if len(parts) == 2 and parts[1] in long_tracks:
            removed += 1
            continue
        filtered.append(line)

    if removed:
        print(f"Updating downloaded manifest: {DOWNLOADS_FILE} ({removed} removed)")
        if not dry_run:
            write_text_file(DOWNLOADS_FILE, filtered)


def update_drop_points(long_tracks: set[str], dry_run: bool) -> None:
    if not DROP_POINTS_FILE.exists():
        return
    lines = read_text_file(DROP_POINTS_FILE)
    filtered = []
    removed = 0
    for line in lines:
        stripped = line.strip()
        if not stripped:
            filtered.append(line)
            continue
        track_id = stripped.split(":", 1)[0].strip()
        if track_id in long_tracks:
            removed += 1
            continue
        filtered.append(line)

    if removed:
        print(f"Updating drop points file: {DROP_POINTS_FILE} ({removed} removed)")
        if not dry_run:
            write_text_file(DROP_POINTS_FILE, filtered)


def remove_feature_cache(track_dir: Path, dry_run: bool) -> int:
    cache = AudioFeatureCache(dataset_root=DATASET_ROOT, cache_root=FEATURE_CACHE_ROOT)
    removed = 0
    for audio_path in collect_audio_files(track_dir):
        cache_path = cache.cache_path(audio_path)
        if cache_path.exists():
            removed += 1
            print(f"Removing cache file: {cache_path}")
            if not dry_run:
                cache_path.unlink()
    return removed


def remove_track_directory(track_dir: Path, dry_run: bool) -> None:
    if not track_dir.exists():
        return
    if dry_run:
        print(f"Would remove track directory: {track_dir}")
    else:
        shutil.rmtree(track_dir)


def main(threshold_minutes: float, dry_run: bool) -> None:
    track_ids = get_track_ids()
    print(f"Found {len(track_ids)} tracks in dataset.")

    long_tracks: list[str] = []
    for track_id in track_ids:
        track_dir = DATASET_ROOT / track_id
        audio_path = find_audio_file(track_dir)
        if audio_path is None:
            print(f"Skipping track {track_id}: no supported audio file found")
            continue

        duration_sec = get_track_duration_seconds(audio_path)
        if duration_sec > threshold_minutes * 60:
            long_tracks.append(track_id)
            print(f"Marked long track: {track_id} ({duration_sec:.1f}s)")

    if not long_tracks:
        print("No tracks over threshold found.")
        return

    long_track_set = set(long_tracks)
    print(f"Found {len(long_tracks)} tracks longer than {threshold_minutes} minutes.")

    total_cache_removed = 0
    for track_id in long_tracks:
        track_dir = DATASET_ROOT / track_id
        total_cache_removed += remove_feature_cache(track_dir, dry_run)
        remove_track_directory(track_dir, dry_run)

    update_split_files(long_track_set, dry_run)
    update_labeled_samples(long_track_set, dry_run)
    update_downloaded_file(long_track_set, dry_run)
    update_drop_points(long_track_set, dry_run)

    print(f"Finished removing {len(long_tracks)} long tracks.")
    print(f"Feature cache files removed: {total_cache_removed}")
    if dry_run:
        print("Dry run only: no files were actually deleted.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Remove tracks longer than a threshold from the music dataset.")
    parser.add_argument(
        "--threshold-minutes",
        type=float,
        default=DEFAULT_THRESHOLD_MINUTES,
        help="Only remove tracks longer than this duration.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be removed without deleting files.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    main(threshold_minutes=args.threshold_minutes, dry_run=args.dry_run)
