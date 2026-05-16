from typing import List
import numpy as np
from music_drop.src.cache import AudioFeatureCache

from .data import Sample
from music_core import detect_candidates, score_drops, get_window


_cache = AudioFeatureCache()


def build_feature_window(payload, beat_idx):
    E = np.asarray(payload["E"])
    O = np.asarray(payload["O"])
    C = np.asarray(payload["C"])
    B = np.asarray(payload["B"])

    w = get_window(beat_idx)
    window_size = w.stop - w.start

    x = np.zeros((window_size, 4), dtype=np.float32)

    src_start = max(0, w.start)
    src_stop = min(len(E), w.stop)

    if src_start < src_stop:
        dst_start = src_start - w.start
        dst_stop = dst_start + (src_stop - src_start)

        x[dst_start:dst_stop, 0] = E[src_start:src_stop]
        x[dst_start:dst_stop, 1] = O[src_start:src_stop]
        x[dst_start:dst_stop, 2] = C[src_start:src_stop]
        x[dst_start:dst_stop, 3] = B[src_start:src_stop]

    return x


def make_sample(track_id, payload, beat_idx, source, hscore):
    return Sample(
        track_id=track_id,
        beat_idx=beat_idx,
        x=build_feature_window(payload, beat_idx),
        source=source,
        hscore=hscore,
    )


def heuristic_candidates(payload):
    return detect_candidates(
        payload["E"],
        payload["O"],
        payload["C"],
        payload["B"],
        payload["beat_times"],
    )


def sample_background_beats(payload, background_per_track, avoid):
    scores = np.asarray(score_drops(payload["E"], payload["O"], payload["C"], payload["B"]))

    all_indices = np.arange(len(scores))
    avoid = set(avoid or [])
    candidates = np.array([i for i in all_indices if i not in avoid])

    if len(candidates) == 0:
        return []

    candidate_scores = np.maximum(scores[candidates].astype(float), 0.0)
    weights = np.sqrt(candidate_scores + 1e-9)

    if weights.sum() == 0:
        weights = np.ones_like(weights, dtype=float)

    weights /= weights.sum()

    k = min(background_per_track, len(candidates))
    chosen = np.random.choice(candidates, size=k, replace=False, p=weights)
    return chosen.tolist()


def build_pool(track_ids, heuristic_per_track=10, background_per_track=10):
    pool = []

    for track_id in track_ids:
        payload = _cache.get_by_id(track_id)

        cand = heuristic_candidates(payload)[:heuristic_per_track]
        cand_beats = set()

        for beat_idx, _, hscore in cand:
            pool.append(make_sample(track_id, payload, beat_idx, source="heuristic", hscore=hscore))
            cand_beats.add(beat_idx)

        bg_beats = sample_background_beats(payload, background_per_track, avoid=cand_beats)
        for beat_idx in bg_beats:
            pool.append(make_sample(track_id, payload, beat_idx, source="background", hscore=0.0))

    return pool


def select_queries(model, pool: List[Sample], batch_size=20):
    if len(pool) == 0:
        return []

    # sklearn-style tabular input
    X = np.stack([s.x.reshape(-1) for s in pool])
    p = model.predict_proba(X)[:, 1]

    uncertainty = 1.0 - np.abs(p - 0.5) * 2.0

    heuristic_idx = [i for i, s in enumerate(pool) if s.source == "heuristic"]
    background_idx = [i for i, s in enumerate(pool) if s.source == "background"]

    k_h = int(batch_size * 0.7)
    k_b = batch_size - k_h

    heuristic_idx = sorted(heuristic_idx, key=lambda i: uncertainty[i], reverse=True)
    background_idx = sorted(background_idx, key=lambda i: uncertainty[i], reverse=True)

    chosen_idx = heuristic_idx[:k_h] + background_idx[:k_b]

    if len(chosen_idx) < batch_size:
        remaining = [i for i in range(len(pool)) if i not in chosen_idx]
        remaining = sorted(remaining, key=lambda i: uncertainty[i], reverse=True)
        chosen_idx += remaining[: batch_size - len(chosen_idx)]

    return [pool[i] for i in chosen_idx]
