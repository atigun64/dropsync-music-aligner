from collections import defaultdict
from pathlib import Path
import random
import numpy as np

from pydub import AudioSegment

from music_drop.src.training.labeling import load_labeled_samples
from music_drop.src.training.sampling import build_pool, sample_to_vector
from music_drop.src.training.train import train_model
from music_drop.src.cache import AudioFeatureCache


DATASET_ROOT = Path("music_drop", "data")
LABEL_SPLIT = "train"

# Candidate score range
MODEL_THRESHOLD = (0.6, 1.0)

# Compilation settings
OUTPUT_DIR = Path("music_drop", "data", "compilations")
OUTPUT_BASENAME = "edm_explosion_points"

# Bigger windows than before
PRE_BEATS = 6
POST_BEATS = 10

# Small fades, not huge
FADE_MS = 250
CROSSFADE_MS = 500

# Safety: clip length cap
MAX_CLIP_MS = 18000

# Keep variety
SUPPRESS_RADIUS = 2
MAX_PER_TRACK = 5

# Random mixed order, but avoid same-track adjacency
AVOID_ADJACENT_SAME_TRACK = True

# Max clips in final compilation (for sanity)
MAX_COMPILED_CLIPS = 50


def get_track_ids(split="train"):
    split_file = DATASET_ROOT / "split" / split
    if not split_file.exists():
        print(f"Split file {split_file} does not exist.")
        return []

    with open(split_file, "r", encoding="utf-8") as f:
        track_ids = [line.strip() for line in f if line.strip()]

    return sorted(track_ids)


def suppress_nearby_same_track(samples, radius=2, max_per_track=None):
    """
    Keep representative samples from a scored list.
    Greedy local NMS per track.
    """
    by_track = defaultdict(list)
    for s in samples:
        by_track[s.track_id].append(s)

    kept = []

    for track_id, track_samples in by_track.items():
        # highest score first
        track_samples = sorted(track_samples, key=lambda s: s.mscore, reverse=True)

        selected_beats = []
        count = 0

        for s in track_samples:
            if max_per_track is not None and count >= max_per_track:
                break

            too_close = any(abs(s.beat_idx - b) <= radius for b in selected_beats)
            if not too_close:
                kept.append(s)
                selected_beats.append(s.beat_idx)
                count += 1

    kept.sort(key=lambda s: (s.track_id, s.beat_idx))
    return kept


def random_mix_no_adjacent_same_track(samples):
    """
    Randomly interleave samples while avoiding back-to-back clips from same track.
    """
    if not samples:
        return []

    by_track = defaultdict(list)
    for s in samples:
        by_track[s.track_id].append(s)

    # shuffle inside each track
    for t in by_track:
        random.shuffle(by_track[t])

    active_tracks = list(by_track.keys())
    random.shuffle(active_tracks)

    out = []
    last_track = None

    while active_tracks:
        # prefer a track different from last_track
        candidates = [t for t in active_tracks if t != last_track]
        if not candidates:
            candidates = active_tracks[:]

        t = random.choice(candidates)
        out.append(by_track[t].pop())
        last_track = t

        if not by_track[t]:
            active_tracks.remove(t)

    return out


def beat_window_to_times(beat_times, beat_idx, pre_beats=6, post_beats=10):
    """
    Convert a beat-centered window to time bounds.
    Returns start_s, end_s.
    """
    beat_times = np.asarray(beat_times, dtype=float)

    start_idx = max(0, beat_idx - pre_beats)
    end_idx = min(len(beat_times) - 1, beat_idx + post_beats)

    start_time = float(beat_times[start_idx])

    # End at the next beat after the window if possible
    if end_idx < len(beat_times) - 1:
        end_time = float(beat_times[end_idx + 1])
    else:
        if len(beat_times) >= 2:
            beat_dur = float(np.median(np.diff(beat_times)))
        else:
            beat_dur = 0.5
        end_time = float(beat_times[end_idx] + beat_dur)

    return start_time, end_time


def extract_clip(audio_path, start_s, end_s, fade_ms=250, max_clip_ms=18000):
    """
    Extract and lightly fade a clip.
    No per-clip normalization here.
    """
    audio = AudioSegment.from_file(audio_path)

    start_ms = max(0, int(start_s * 1000))
    end_ms = min(len(audio), int(end_s * 1000))

    if end_ms <= start_ms:
        return None

    clip = audio[start_ms:end_ms]

    if len(clip) > max_clip_ms:
        clip = clip[:max_clip_ms]

    # Short fades only
    fade_ms = min(fade_ms, max(1, len(clip) // 4))
    clip = clip.fade_in(fade_ms).fade_out(fade_ms)

    return clip


def build_compilation(samples, cache: AudioFeatureCache, output_dir: Path, basename: str):
    """
    Build WAV + MP3 compilation from selected samples.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    if not samples:
        print("No samples to compile.")
        return

    master = None
    used = 0

    for i, sample in enumerate(samples, 1):
        payload = cache.get_by_id(sample.track_id)
        if payload is None:
            print(f"Skipping {sample.track_id}: no payload")
            continue

        beat_times = payload["beat_times"]
        audio_path = cache.audio_path_from_id(sample.track_id)

        start_s, end_s = beat_window_to_times(
            beat_times,
            sample.beat_idx,
            pre_beats=PRE_BEATS,
            post_beats=POST_BEATS,
        )

        clip = extract_clip(
            audio_path,
            start_s,
            end_s,
            fade_ms=FADE_MS,
            max_clip_ms=MAX_CLIP_MS,
        )

        if clip is None or len(clip) == 0:
            print(f"Skipping {sample.track_id} beat {sample.beat_idx}: empty clip")
            continue

        # Append with crossfade, but keep it modest
        if master is None:
            master = clip
        else:
            crossfade = min(CROSSFADE_MS, len(master) // 4, len(clip) // 4)
            crossfade = max(0, int(crossfade))
            master = master.append(clip, crossfade=crossfade)

        used += 1
        print(f"[{i}/{len(samples)}] Added {sample.track_id} @ beat {sample.beat_idx} (score={sample.mscore:.3f})")

    if master is None or used == 0:
        print("No audio was added to compilation.")
        return

    # Optional tiny headroom to avoid harshness.
    # This is NOT per-clip normalization.
    # If you truly want none at all, set to 0.0.
    MASTER_HEADROOM_DB = -4.0
    if MASTER_HEADROOM_DB != 0.0:
        master = master.apply_gain(MASTER_HEADROOM_DB)

    wav_path = output_dir / f"{basename}.wav"
    mp3_path = output_dir / f"{basename}.mp3"

    # Export WAV master first
    master.export(wav_path, format="wav")
    print(f"Saved WAV to {wav_path}")

    # Then MP3 for upload
    master.export(mp3_path, format="mp3", bitrate="320k")
    print(f"Saved MP3 to {mp3_path} ({used} clips)")


def main():
    cache = AudioFeatureCache()

    labeled_samples = load_labeled_samples(split=LABEL_SPLIT)
    if len(labeled_samples) == 0:
        print(f"No labeled samples found in split='{LABEL_SPLIT}'.")
        return

    labeled_keys = {(s.track_id, s.beat_idx) for s in labeled_samples}
    print(f"Loaded {len(labeled_samples)} labeled samples.")

    model = train_model(labeled_samples)
    print("Model trained.")

    track_ids = get_track_ids(split=LABEL_SPLIT)
    if not track_ids:
        print("No track ids found.")
        return

    pool = build_pool(track_ids)

    # Remove already labeled points
    pool = [
        s for s in pool
        if (s.track_id, s.beat_idx) not in labeled_keys
    ]

    if not pool:
        print("No unlabeled samples in the pool.")
        return

    X = np.stack([sample_to_vector(s) for s in pool])
    probs = model.predict_proba(X)[:, 1]

    for s, p in zip(pool, probs):
        s.mscore = float(p)

    # Score band
    selected_samples = [
        s for s in pool
        if MODEL_THRESHOLD[0] <= s.mscore < MODEL_THRESHOLD[1]
    ]

    # Collapse nearby same-track duplicates
    selected_samples = suppress_nearby_same_track(
        selected_samples,
        radius=SUPPRESS_RADIUS,
        max_per_track=MAX_PER_TRACK,
    )

    # Random mixed ordering
    if AVOID_ADJACENT_SAME_TRACK:
        selected_samples = random_mix_no_adjacent_same_track(selected_samples)
    else:
        random.shuffle(selected_samples)

    print(f"Selected {len(selected_samples)} samples with model_score in range {MODEL_THRESHOLD}")

    if not selected_samples:
        print("No samples passed threshold.")
        return

    build_compilation(
        selected_samples[:MAX_COMPILED_CLIPS],
        cache=cache,
        output_dir=OUTPUT_DIR,
        basename=OUTPUT_BASENAME,
    )


if __name__ == "__main__":
    main()
