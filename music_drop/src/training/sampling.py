from typing import List
import numpy as np

from .data import Sample

from music_drop.src.cache import AudioFeatureCache

from music_core import detect_candidates, build_feature_window_ml, score_drops
from .utils import sample_to_vector


_cache = AudioFeatureCache()


def make_sample(track_id, beat_idx, source, hscore, mscore=0.0, payload=None):
    if payload is None:
        payload = _cache.get_by_id(track_id)
        if payload is None:
            raise ValueError(f"No payload for track_id={track_id}")

    return Sample(
        track_id=track_id,
        beat_idx=beat_idx,
        x=build_feature_window_ml(payload["E"], payload["O"], payload["C"], payload["F"], payload["B"], beat_idx),
        source=source,
        hscore=hscore,
        mscore=mscore,
    )



def heuristic_candidates(payload):
    return detect_candidates(
        payload["E"],
        payload["O"],
        payload["C"],
        payload["B"],
        payload["beat_times"],
        threshold=0.64,
        max_candidates=7,
    )

def build_pool(track_ids):
    pool = []

    for track_id in track_ids:
        payload = _cache.get_by_id(track_id)

        if payload is None:
            print(f"WARNING: no payload for track_id={track_id}, skipping")
            continue
            
        if len(payload["E"]) > 1000:   # sanity check to avoid loading huge files
            print(f"WARNING: payload for track_id={track_id} has {len(payload['E'])} frames, skipping")
            continue
        
        scores = score_drops(
            payload["E"],
            payload["O"],
            payload["C"],
            payload["B"],
        )

        print(f"Track {track_id}: found {len(scores)} scored candidates")

        for beat_idx, hscore in enumerate(scores):
            if hscore > 0.6:   # heuristic threshold for pool inclusion
                pool.append(
                    make_sample(
                        track_id=track_id,
                        beat_idx=beat_idx,
                        source="heuristic",
                        hscore=hscore,
                        payload=payload,
                    )
                )

    return pool

def pool_filter(pool, labeled_samples):
    """
        Filter out samples from the pool which are near already labeled samples.
        This is to avoid showing the same or very similar samples to the annotator multiple times.
        If a label is positive we filter [-4, +4] beat indices around it.
        Otherwise we filter [-5, +5] beat indices around it.
    """
    filtered = []

    for sample in pool:
        too_close = False
        for labeled in labeled_samples:
            if sample.track_id == labeled.track_id:
                dist = abs(sample.beat_idx - labeled.beat_idx)
                if labeled.y == 1 and dist <= 4:
                    too_close = True
                    break
                elif labeled.y == 0 and dist <= 5:
                    too_close = True
                    break

        if not too_close:
            filtered.append(sample)

    return filtered

from typing import List
from collections import defaultdict
import numpy as np

def _allocate_quotas(weights, total):
    weights = np.asarray(weights, dtype=float)
    raw = weights / weights.sum() * total
    q = np.floor(raw).astype(int)
    remainder = total - q.sum()

    # distribute remainder by largest fractional parts
    frac_order = np.argsort(raw - q)[::-1]
    for i in frac_order[:remainder]:
        q[i] += 1
    return q.tolist()


def select_queries(
    model,
    pool: List[Sample],
    batch_size=20,
    seed=None,
    per_track_radius=2,
    max_per_track=2,
):
    """
    Stratified active learning selection:
    - samples from the whole probability range
    - does NOT over-focus only on 0.5 / highest / lowest
    - uses mild per-track suppression to avoid duplicate neighborhoods
    """
    if len(pool) == 0:
        return []

    rng = np.random.default_rng(seed)

    X = np.stack([sample_to_vector(s) for s in pool])
    p = model.predict_proba(X)[:, 1]

    for s, ms in zip(pool, p):
        s.mscore = float(ms)

    # Probability bins with symmetric coverage.
    # Weights are the "attention" each bin gets.
    bins = [
        (0.00, 0.15, 1.0),
        (0.15, 0.30, 2.0),
        (0.30, 0.45, 3.0),
        (0.45, 0.55, 5.0),
        (0.55, 0.70, 3.0),
        (0.70, 0.85, 2.0),
        (0.85, 1.01, 1.0),
    ]

    weights = [w for _, _, w in bins]
    quotas = _allocate_quotas(weights, batch_size)

    idx_all = np.arange(len(pool), dtype=int)

    chosen = []
    chosen_set = set()
    per_track_counts = defaultdict(int)

    def accept(i):
        """Check per-track constraints and radius suppression."""
        if i in chosen_set:
            return False

        s = pool[i]

        if per_track_counts[s.track_id] >= max_per_track:
            return False

        for j in chosen:
            sj = pool[j]
            if sj.track_id == s.track_id and abs(sj.beat_idx - s.beat_idx) <= per_track_radius:
                return False

        chosen.append(i)
        chosen_set.add(i)
        per_track_counts[s.track_id] += 1
        return True

    # 1) Sample each probability bin
    for (lo, hi, _w), q in zip(bins, quotas):
        if q <= 0:
            continue

        idx = idx_all[(p >= lo) & (p < hi)]
        if len(idx) == 0:
            continue

        # Representative examples around the bin center,
        # but not always the exact same one.
        center = (lo + hi) / 2.0
        closeness = np.abs(p[idx] - center)
        order = np.argsort(closeness)

        # Take a top pool from the bin, then shuffle it to avoid determinism.
        top_pool_size = min(len(idx), max(q * 4, q + 4))
        top_pool = idx[order[:top_pool_size]].copy()
        rng.shuffle(top_pool)

        taken = 0
        for i in top_pool:
            if accept(int(i)):
                taken += 1
                if taken >= q:
                    break

        # If bin quota wasn't filled, try the rest of the bin
        if taken < q:
            rest = idx[order[top_pool_size:]].copy()
            rng.shuffle(rest)
            for i in rest:
                if accept(int(i)):
                    taken += 1
                    if taken >= q:
                        break

    # 2) Final fill from the remaining pool, randomized
    if len(chosen) < batch_size:
        remaining = [i for i in idx_all if i not in chosen_set]
        rng.shuffle(remaining)

        for i in remaining:
            if len(chosen) >= batch_size:
                break
            accept(int(i))

    # Optional: keep output order randomized, not score-sorted.
    rng.shuffle(chosen)

    return [pool[i] for i in chosen[:batch_size]]
