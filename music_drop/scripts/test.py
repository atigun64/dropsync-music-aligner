from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Tuple
import numpy as np

from sklearn.ensemble import ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from music_drop.src.training.labeling import load_labeled_samples
from music_drop.src.training.train import train_model
from music_drop.src.training.sampling import build_pool, sample_to_vector
from music_drop.src.cache import AudioFeatureCache

# CHANGE THIS IMPORT IF NEEDED:
# from music_drop.src.score.score import ml_predict_drops
from music_drop.src.score.score import ml_predict_drops


DATASET_ROOT = Path("music_drop", "data")
LABEL_SPLIT = "train"

ML_DROP_PARAMS = {
    "min_score": 0.65,
    "heuristic_threshold": 0.1,
    "min_gap_sec": 20,
}


def get_track_ids(split="train"):
    split_file = DATASET_ROOT / "split" / split
    if not split_file.exists():
        print(f"Split file {split_file} does not exist.")
        return []

    with open(split_file, "r", encoding="utf-8") as f:
        track_ids = [line.strip() for line in f if line.strip()]

    return sorted(track_ids)


def make_logreg(C: float = 0.01) -> Pipeline:
    return Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(
            C=C,
            max_iter=5000,
            class_weight="balanced",
        ))
    ])


def make_extratrees(
    n_estimators: int = 500,
    min_samples_leaf: int = 2,
    max_features: Any = "sqrt",
    max_depth: Any = None,
) -> ExtraTreesClassifier:
    return ExtraTreesClassifier(
        n_estimators=n_estimators,
        min_samples_leaf=min_samples_leaf,
        max_features=max_features,
        max_depth=max_depth,
        class_weight="balanced",
        random_state=0,
        n_jobs=-1,
    )


def score_pool(model, pool) -> np.ndarray:
    X = np.stack([sample_to_vector(s) for s in pool])
    return model.predict_proba(X)[:, 1]


def summarize_scores(name: str, scores: np.ndarray):
    print(f"\n{name} score summary:")
    print(f"  min={scores.min():.6f}")
    print(f"  max={scores.max():.6f}")
    print(f"  mean={scores.mean():.6f}")
    print(f"  std={scores.std():.6f}")
    print(f"  p05={np.percentile(scores, 5):.6f}")
    print(f"  p50={np.percentile(scores, 50):.6f}")
    print(f"  p95={np.percentile(scores, 95):.6f}")


def print_top_samples(pool, scores, name: str, k: int = 20):
    idx = np.argsort(scores)[::-1][:k]
    print(f"\nTop {k} samples for {name}:")
    for i in idx:
        s = pool[i]
        print(
            f"  track={s.track_id} beat={s.beat_idx} score={scores[i]:.6f}"
        )


def score_corr(a: np.ndarray, b: np.ndarray) -> float:
    if len(a) < 2:
        return float("nan")
    return float(np.corrcoef(a, b)[0, 1])


def topk_overlap(a: np.ndarray, b: np.ndarray, k: int = 20) -> float:
    ka = set(np.argsort(a)[::-1][:k])
    kb = set(np.argsort(b)[::-1][:k])
    return len(ka & kb) / float(k)


def normalize_events(events):
    """
    Convert whatever ml_predict_drops returns into a list of:
      (track_id, beat_idx, score)
    """
    out = []

    if events is None:
        return out

    for e in events:
        # Sample-like object
        if hasattr(e, "track_id") and hasattr(e, "beat_idx"):
            score = getattr(e, "mscore", getattr(e, "score", None))
            out.append((e.track_id, int(e.beat_idx), None if score is None else float(score)))
            continue

        # dict-like
        if isinstance(e, dict):
            track_id = e.get("track_id")
            beat_idx = e.get("beat_idx")
            score = e.get("mscore", e.get("score"))
            if track_id is not None and beat_idx is not None:
                out.append((track_id, int(beat_idx), None if score is None else float(score)))
            continue

        # tuple-like fallback
        if isinstance(e, (tuple, list)) and len(e) >= 2:
            # try common shapes:
            # (track_id, beat_idx)
            # (track_id, beat_idx, score)
            track_id = e[0]
            beat_idx = e[1]
            score = e[2] if len(e) >= 3 else None
            out.append((track_id, int(beat_idx), None if score is None else float(score)))

    return out


def event_set(events):
    return {(t, b) for t, b, _ in events}


def print_events(name: str, events, k: int = 50):
    norm = normalize_events(events)
    print(f"\n{name} extracted events: {len(norm)}")
    for t, b, s in norm[:k]:
        if s is None:
            print(f"  track={t} beat={b}")
        else:
            print(f"  track={t} beat={b} score={s:.6f}")


def compare_event_lists(name_a: str, ev_a, name_b: str, ev_b):
    a = normalize_events(ev_a)
    b = normalize_events(ev_b)

    set_a = event_set(a)
    set_b = event_set(b)

    inter = len(set_a & set_b)
    only_a = len(set_a - set_b)
    only_b = len(set_b - set_a)

    print("\nEvent overlap:")
    print(f"  {name_a} count={len(set_a)}")
    print(f"  {name_b} count={len(set_b)}")
    print(f"  overlap={inter}")
    print(f"  only_{name_a}={only_a}")
    print(f"  only_{name_b}={only_b}")

    if len(set_a) > 0:
        print(f"  overlap/{name_a}={inter/len(set_a):.3f}")
    if len(set_b) > 0:
        print(f"  overlap/{name_b}={inter/len(set_b):.3f}")


def run_one_model(name: str, model, labeled_samples, pool, ml_drop_params):
    print("\n" + "=" * 120)
    print(f"Training {name} ...")

    trained = train_model(labeled_samples=labeled_samples, ml_model=model)

    print(f"Scoring pool for {name} ...")
    scores = score_pool(trained, pool)
    summarize_scores(name, scores)
    print_top_samples(pool, scores, name, k=15)

    print(f"Running ml_predict_drops for {name} ...")
    events = ml_predict_drops(trained, pool, ml_drop_params)

    print_events(name, events, k=50)

    return trained, scores, events


def main():
    labeled_samples = load_labeled_samples(split=LABEL_SPLIT)
    if len(labeled_samples) == 0:
        print(f"No labeled samples found in split='{LABEL_SPLIT}'.")
        return

    print(f"Loaded {len(labeled_samples)} labeled samples.")

    track_ids = get_track_ids(split=LABEL_SPLIT)
    if not track_ids:
        print("No track ids found.")
        return

    pool = build_pool(track_ids)
    if len(pool) == 0:
        print("Pool is empty.")
        return

    print(f"Pool size: {len(pool)}")
    print(f"Using ml_drop_params: {ML_DROP_PARAMS}")

    # Compare two clearly different models
    models = [
        ("logreg_C0.01", make_logreg(C=0.01)),
        ("extratrees", make_extratrees(n_estimators=500, min_samples_leaf=2, max_features="sqrt", max_depth=None)),
    ]

    results = {}

    for name, model in models:
        trained, scores, events = run_one_model(name, model, labeled_samples, pool, ML_DROP_PARAMS)
        results[name] = {
            "model": trained,
            "scores": scores,
            "events": events,
        }

    a_name, b_name = models[0][0], models[1][0]
    a_scores = results[a_name]["scores"]
    b_scores = results[b_name]["scores"]

    print("\n" + "=" * 120)
    print("Raw score comparison:")
    print(f"Pearson corr {a_name} vs {b_name}: {score_corr(a_scores, b_scores):.6f}")
    print(f"Top20 overlap {a_name} vs {b_name}: {topk_overlap(a_scores, b_scores, k=20):.3f}")
    print(f"Top50 overlap {a_name} vs {b_name}: {topk_overlap(a_scores, b_scores, k=50):.3f}")

    compare_event_lists(a_name, results[a_name]["events"], b_name, results[b_name]["events"])

    print("\n" + "=" * 120)
    print("Done.")


if __name__ == "__main__":
    main()
