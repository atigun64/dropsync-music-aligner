from __future__ import annotations

from pathlib import Path
import json
import numpy as np
import pandas as pd

ROOT = Path("drop_labels")
OUT_CSV = Path("drop_summary.csv")
OUT_CLASS_CSV = Path("drop_class_stats.csv")


def safe_get(arr, idx, default=np.nan):
    try:
        return float(arr[idx])
    except Exception:
        return default


def summarize_one(npz_path: Path):
    data = np.load(npz_path, allow_pickle=True)

    label = int(data["label"])
    song_path = str(data["song_path"])
    rel_path = str(data["rel_path"])
    beat_idx = int(data["beat_idx"])
    time_sec = float(data["time_sec"])
    heuristic_score = float(data["heuristic_score"])
    bpm = float(data["bpm"])

    # window shape: (31, 5)
    window = data["window"]
    offsets = data["offsets"]

    # feature columns:
    # 0 energy, 1 onset, 2 centroid, 3 flatness, 4 bass
    energy = window[:, 0].astype(float)
    onset = window[:, 1].astype(float)
    centroid = window[:, 2].astype(float)
    flatness = window[:, 3].astype(float)
    bass = window[:, 4].astype(float)

    # offsets expected: -20 .. +10
    # Define regions:
    # pre:   -20 .. -10
    # build: -10 .. -1
    # drop:   0 .. +2
    # post:  +1 .. +10
    idx_pre = np.where((offsets >= -20) & (offsets <= -10))[0]
    idx_build = np.where((offsets >= -10) & (offsets <= -1))[0]
    idx_drop = np.where((offsets >= 0) & (offsets <= 2))[0]
    idx_post = np.where((offsets >= 1) & (offsets <= 10))[0]

    def stat(x, idx):
        if len(idx) == 0:
            return np.nan
        return float(np.mean(x[idx]))

    def mx(x, idx):
        if len(idx) == 0:
            return np.nan
        return float(np.max(x[idx]))

    row = {
        "file": str(npz_path),
        "label": label,
        "song_path": song_path,
        "rel_path": rel_path,
        "beat_idx": beat_idx,
        "time_sec": time_sec,
        "heuristic_score": heuristic_score,
        "bpm": bpm,

        "energy_pre": stat(energy, idx_pre),
        "energy_build": stat(energy, idx_build),
        "energy_drop": stat(energy, idx_drop),
        "energy_post": stat(energy, idx_post),
        "energy_delta_build_to_drop": stat(energy, idx_drop) - stat(energy, idx_build),
        "energy_delta_pre_to_drop": stat(energy, idx_drop) - stat(energy, idx_pre),

        "onset_pre": stat(onset, idx_pre),
        "onset_build": stat(onset, idx_build),
        "onset_drop": stat(onset, idx_drop),
        "onset_post": stat(onset, idx_post),
        "onset_delta_build_to_drop": stat(onset, idx_drop) - stat(onset, idx_build),
        "onset_delta_pre_to_drop": stat(onset, idx_drop) - stat(onset, idx_pre),

        "bass_pre": stat(bass, idx_pre),
        "bass_build": stat(bass, idx_build),
        "bass_drop": stat(bass, idx_drop),
        "bass_post": stat(bass, idx_post),
        "bass_delta_build_to_drop": stat(bass, idx_drop) - stat(bass, idx_build),
        "bass_delta_pre_to_drop": stat(bass, idx_drop) - stat(bass, idx_pre),

        "centroid_pre": stat(centroid, idx_pre),
        "centroid_build": stat(centroid, idx_build),
        "centroid_drop": stat(centroid, idx_drop),
        "centroid_post": stat(centroid, idx_post),

        "flatness_pre": stat(flatness, idx_pre),
        "flatness_build": stat(flatness, idx_build),
        "flatness_drop": stat(flatness, idx_drop),
        "flatness_post": stat(flatness, idx_post),

        "energy_drop_peak": mx(energy, idx_drop),
        "onset_drop_peak": mx(onset, idx_drop),
        "bass_drop_peak": mx(bass, idx_drop),
    }

    return row


def main():
    files = sorted(ROOT.glob("class_*/*.npz"))
    if not files:
        raise RuntimeError(f"No npz files found under {ROOT}")

    rows = []
    for p in files:
        try:
            rows.append(summarize_one(p))
        except Exception as e:
            print(f"FAILED {p}: {e}")

    df = pd.DataFrame(rows)
    df.to_csv(OUT_CSV, index=False)
    print(f"Saved {len(df)} rows -> {OUT_CSV}")

    # class-wise summary
    class_stats = (
        df.groupby("label")[[
            "energy_pre", "energy_build", "energy_drop", "energy_post",
            "onset_pre", "onset_build", "onset_drop", "onset_post",
            "bass_pre", "bass_build", "bass_drop", "bass_post",
            "centroid_pre", "centroid_build", "centroid_drop", "centroid_post",
            "flatness_pre", "flatness_build", "flatness_drop", "flatness_post",
            "heuristic_score", "bpm"
        ]]
        .agg(["mean", "std", "count"])
    )

    class_stats.to_csv(OUT_CLASS_CSV)
    print(f"Saved class stats -> {OUT_CLASS_CSV}")

    print("\nCounts per label:")
    print(df["label"].value_counts().sort_index())


if __name__ == "__main__":
    main()
