from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Tuple
import numpy as np

from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from music_drop.src.training.labeling import load_labeled_samples
from music_drop.src.training.train import train_model
from music_drop.src.training.sampling import build_pool, sample_to_vector
from music_drop.src.cache import AudioFeatureCache


DATASET_ROOT = Path("music_drop", "data")
LABEL_SPLIT = "train"

# Use whatever tracks you want to inspect.
# For a quick test, you can use the same split as training.
def get_track_ids(split="train"):
    split_file = DATASET_ROOT / "split" / split
    if not split_file.exists():
        print(f"Split file {split_file} does not exist.")
        return []

    with open(split_file, "r", encoding="utf-8") as f:
        track_ids = [line.strip() for line in f if line.strip()]

    return sorted(track_ids)


# ----------------------------
# Model factories
# ----------------------------

def make_logreg(C: float) -> Pipeline:
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


def make_hgb(
    max_iter: int = 300,
    learning_rate: float = 0.05,
    max_leaf_nodes: int = 31,
    min_samples_leaf: int = 10,
    l2_regularization: float = 0.1,
) -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        max_iter=max_iter,
        learning_rate=learning_rate,
        max_leaf_nodes=max_leaf_nodes,
        min_samples_leaf=min_samples_leaf,
        l2_regularization=l2_regularization,
        random_state=0,
    )


# ----------------------------
# Helpers
# ----------------------------

def summarize_scores(name: str, scores: np.ndarray):
    print(f"\n{name}:")
    print(f"  min={scores.min():.6f}")
    print(f"  max={scores.max():.6f}")
    print(f"  mean={scores.mean():.6f}")
    print(f"  std={scores.std():.6f}")
    print(f"  p05={np.percentile(scores, 5):.6f}")
    print(f"  p50={np.percentile(scores, 50):.6f}")
    print(f"  p95={np.percentile(scores, 95):.6f}")


def topk_indices(scores: np.ndarray, k: int = 20) -> np.ndarray:
    k = min(k, len(scores))
    return np.argsort(scores)[::-1][:k]


def topk_overlap(a: np.ndarray, b: np.ndarray, k: int = 20) -> float:
    ta = set(topk_indices(a, k))
    tb = set(topk_indices(b, k))
    return len(ta & tb) / float(k)


def pearson_corr(a: np.ndarray, b: np.ndarray) -> float:
    if len(a) < 2:
        return float("nan")
    return float(np.corrcoef(a, b)[0, 1])


def print_top_differences(pool, a_name, a_scores, b_name, b_scores, k=20):
    """
    Show samples where the models disagree most.
    """
    diff = np.abs(a_scores - b_scores)
    idx = np.argsort(diff)[::-1][:k]

    print(f"\nTop {k} disagreements between {a_name} and {b_name}:")
    for i in idx:
        s = pool[i]
        print(
            f"  track={s.track_id} beat={s.beat_idx} "
            f"{a_name}={a_scores[i]:.6f} {b_name}={b_scores[i]:.6f} "
            f"|diff|={diff[i]:.6f}"
        )


def print_top_samples(pool, name: str, scores: np.ndarray, k: int = 20):
    idx = topk_indices(scores, k)
    print(f"\nTop {k} samples for {name}:")
    for i in idx:
        s = pool[i]
        print(
            f"  track={s.track_id} beat={s.beat_idx} score={scores[i]:.6f}"
        )


def score_pool(model, pool):
    X = np.stack([sample_to_vector(s) for s in pool])
    return model.predict_proba(X)[:, 1]


# ----------------------------
# Main diagnostic
# ----------------------------

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

    # Build a pool of candidate beats
    pool = build_pool(track_ids)
    if len(pool) == 0:
        print("Pool is empty.")
        return

    print(f"Pool size: {len(pool)}")

    # Pick two or three models you want to compare
    model_specs = [
        ("logreg_C0.01", make_logreg(C=0.01)),
        ("extratrees", make_extratrees(n_estimators=500, min_samples_leaf=2, max_features="sqrt", max_depth=None)),
        ("hgb", make_hgb(max_iter=300, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=10, l2_regularization=0.1)),
    ]

    trained_models = {}

    # Train each model and score the same pool
    for name, model in model_specs:
        print("\n" + "=" * 100)
        print(f"Training {name} ...")
        trained = train_model(labeled_samples=labeled_samples, ml_model=model)
        trained_models[name] = trained
        print(f"Scoring pool for {name} ...")
        scores = score_pool(trained, pool)
        summarize_scores(name, scores)
        print_top_samples(pool, name, scores, k=15)
        trained_models[name] = (trained, scores)

    # Compare pairwise correlations and top-k overlaps
    names = [n for n, _ in model_specs]

    print("\n" + "=" * 100)
    print("Pairwise score agreement:")

    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a_name = names[i]
            b_name = names[j]
            a_scores = trained_models[a_name][1]
            b_scores = trained_models[b_name][1]

            corr = pearson_corr(a_scores, b_scores)
            overlap10 = topk_overlap(a_scores, b_scores, k=10)
            overlap20 = topk_overlap(a_scores, b_scores, k=20)

            print(
                f"{a_name} vs {b_name}: "
                f"pearson={corr:.6f}, "
                f"top10_overlap={overlap10:.2f}, "
                f"top20_overlap={overlap20:.2f}"
            )

    # Show biggest disagreements
    print("\n" + "=" * 100)
    print("Largest model disagreements:")

    # choose first two as primary comparison
    a_name = names[0]
    b_name = names[1]
    a_scores = trained_models[a_name][1]
    b_scores = trained_models[b_name][1]
    print_top_differences(pool, a_name, a_scores, b_name, b_scores, k=25)

    # optional: show a few exact equalities / near-equalities
    same = np.isclose(a_scores, b_scores, atol=1e-8)
    print(f"\nExact/near-exact equal scores between {a_name} and {b_name}: {same.sum()} / {len(pool)}")


if __name__ == "__main__":
    main()
