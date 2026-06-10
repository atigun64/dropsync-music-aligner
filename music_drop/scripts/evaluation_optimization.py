from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List
from collections import Counter
from itertools import product
import csv
import json
import os
import time

from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from music_drop.src.score.score import evaluate_drop_level
from music_drop.src.training.labeling import load_labeled_samples
from music_drop.src.training.train import train_model


LABEL_SPLIT = "train"

# IMPORTANT: use a fresh CSV so old runs do not affect counts/resume logic
RESULTS_CSV = Path("music_drop", "data", "centered_sweep_200.csv")

PRIMARY_TOL = 7
TIE_TOL = 2
EXPECTED_EXPERIMENTS = 200


@dataclass
class Experiment:
    exp_id: str
    family: str
    model_params: Dict[str, Any]
    ml_drop_params: Dict[str, Any]
    model_factory: Callable[..., Any]


# =========================================================
# Model factories
# =========================================================

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
    n_estimators: int,
    min_samples_leaf: int,
    max_features: Any,
    max_depth: Any,
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
    max_iter: int,
    learning_rate: float,
    max_leaf_nodes: int,
    min_samples_leaf: int,
    l2_regularization: float,
) -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        max_iter=max_iter,
        learning_rate=learning_rate,
        max_leaf_nodes=max_leaf_nodes,
        min_samples_leaf=min_samples_leaf,
        l2_regularization=l2_regularization,
        random_state=0,
    )


# =========================================================
# Champion-centered configs
# =========================================================

# Your known-good baseline model
CHAMPION_ET = {
    "n_estimators": 500,
    "min_samples_leaf": 2,
    "max_features": "sqrt",
    "max_depth": None,
}

# Your known-good extraction config
CHAMPION_ML_DROP = {
    "min_score": 0.60,
    "heuristic_threshold": 0.10,
    "min_gap_sec": 10,
}

# We want exactly:
# 32 ExtraTrees configs
# 4 HGB configs
# 4 LogReg configs
# 5 ml_drop configs
# => (32 + 4 + 4) * 5 = 200


def build_extratrees_configs() -> List[Dict[str, Any]]:
    """
    Build exactly 32 ET configs, centered on the champion.
    """

    # 24 base configs around champion, no depth restriction
    base = [
        {
            "n_estimators": n_estimators,
            "min_samples_leaf": min_samples_leaf,
            "max_features": max_features,
            "max_depth": None,
        }
        for n_estimators, min_samples_leaf, max_features in product(
            [300, 500, 800],        # around champion 500
            [1, 2, 4, 6],           # around champion 2
            ["sqrt", 0.5],          # around champion "sqrt"
        )
    ]
    assert len(base) == 24

    # 8 additional depth-constrained variants near champion
    depth_variants = [
        {"n_estimators": 500, "min_samples_leaf": 1, "max_features": "sqrt", "max_depth": 20},
        {"n_estimators": 500, "min_samples_leaf": 2, "max_features": "sqrt", "max_depth": 20},
        {"n_estimators": 500, "min_samples_leaf": 4, "max_features": "sqrt", "max_depth": 20},
        {"n_estimators": 500, "min_samples_leaf": 2, "max_features": 0.5,  "max_depth": 20},
        {"n_estimators": 800, "min_samples_leaf": 2, "max_features": "sqrt", "max_depth": 20},
        {"n_estimators": 800, "min_samples_leaf": 4, "max_features": "sqrt", "max_depth": 20},
        {"n_estimators": 800, "min_samples_leaf": 2, "max_features": 0.5,  "max_depth": 20},
        {"n_estimators": 300, "min_samples_leaf": 2, "max_features": "sqrt", "max_depth": 20},
    ]
    assert len(depth_variants) == 8

    configs = base + depth_variants
    assert len(configs) == 32

    # Ensure uniqueness
    uniq = {
        json.dumps(cfg, sort_keys=True): cfg
        for cfg in configs
    }
    assert len(uniq) == 32, "Duplicate ET configs detected"

    return list(uniq.values())


def build_hgb_configs() -> List[Dict[str, Any]]:
    configs = [
        {"max_iter": 200, "learning_rate": 0.05, "max_leaf_nodes": 15, "min_samples_leaf": 10, "l2_regularization": 0.1},
        {"max_iter": 300, "learning_rate": 0.05, "max_leaf_nodes": 31, "min_samples_leaf": 10, "l2_regularization": 0.1},
        {"max_iter": 300, "learning_rate": 0.03, "max_leaf_nodes": 31, "min_samples_leaf": 10, "l2_regularization": 0.1},
        {"max_iter": 500, "learning_rate": 0.03, "max_leaf_nodes": 31, "min_samples_leaf": 10, "l2_regularization": 0.1},
    ]
    assert len(configs) == 4
    return configs


def build_logreg_configs() -> List[Dict[str, Any]]:
    configs = [
        {"C": 0.005},
        {"C": 0.01},
        {"C": 0.02},
        {"C": 0.05},
    ]
    assert len(configs) == 4
    return configs


def build_ml_drop_configs() -> List[Dict[str, Any]]:
    """
    5 extraction configs:
    - include exact champion
    - a bit more permissive
    - a bit more conservative
    """
    configs = [
        dict(CHAMPION_ML_DROP),  # exact champion
        {"min_score": 0.55, "heuristic_threshold": 0.10, "min_gap_sec": 12},
        {"min_score": 0.50, "heuristic_threshold": 0.10, "min_gap_sec": 16},
        {"min_score": 0.65, "heuristic_threshold": 0.10, "min_gap_sec": 20},
        {"min_score": 0.70, "heuristic_threshold": 0.10, "min_gap_sec": 24},
    ]
    assert len(configs) == 5
    return configs


def build_experiments() -> List[Experiment]:
    et_configs = build_extratrees_configs()
    hgb_configs = build_hgb_configs()
    logreg_configs = build_logreg_configs()
    ml_drop_configs = build_ml_drop_configs()

    experiments: List[Experiment] = []

    def add_family(
        family: str,
        factory: Callable[..., Any],
        configs: List[Dict[str, Any]],
    ):
        for model_params in configs:
            for ml_params in ml_drop_configs:
                exp_id = (
                    f"{family}|"
                    f"{json.dumps(model_params, sort_keys=True)}|"
                    f"{json.dumps(ml_params, sort_keys=True)}"
                )
                experiments.append(
                    Experiment(
                        exp_id=exp_id,
                        family=family,
                        model_params=model_params,
                        ml_drop_params=ml_params,
                        model_factory=factory,
                    )
                )

    add_family("extratrees", make_extratrees, et_configs)
    add_family("hgb", make_hgb, hgb_configs)
    add_family("logreg", make_logreg, logreg_configs)

    # Stable order
    family_order = {"extratrees": 0, "hgb": 1, "logreg": 2}
    experiments.sort(
        key=lambda e: (
            family_order[e.family],
            json.dumps(e.model_params, sort_keys=True),
            json.dumps(e.ml_drop_params, sort_keys=True),
        )
    )

    # Hard assertions so count can never silently drift
    family_counts = Counter(e.family for e in experiments)
    assert family_counts["extratrees"] == 32 * 5
    assert family_counts["hgb"] == 4 * 5
    assert family_counts["logreg"] == 4 * 5
    assert len(experiments) == EXPECTED_EXPERIMENTS, (
        f"Expected {EXPECTED_EXPERIMENTS}, got {len(experiments)}"
    )

    return experiments


# =========================================================
# Utilities
# =========================================================

def normalize_result(result: Any) -> Dict[str, Any]:
    if result is None:
        return {"precision": None, "recall": None, "f1": None}

    if isinstance(result, dict):
        return {
            "precision": result.get("precision"),
            "recall": result.get("recall"),
            "f1": result.get("f1"),
        }

    if isinstance(result, (tuple, list)) and len(result) >= 3:
        return {
            "precision": result[0],
            "recall": result[1],
            "f1": result[2],
        }

    return {"precision": None, "recall": None, "f1": result}


def load_done_experiment_ids(csv_path: Path) -> set[str]:
    if not csv_path.exists():
        return set()

    done = set()
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            exp_id = row.get("exp_id")
            status = row.get("status", "")
            if exp_id and status in ("ok", "failed"):
                done.add(exp_id)
    return done


def load_existing_rows(csv_path: Path) -> List[Dict[str, Any]]:
    if not csv_path.exists():
        return []

    rows = []
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def append_row(csv_path: Path, row: Dict[str, Any], fieldnames: List[str]) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    file_exists = csv_path.exists()

    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)
        f.flush()
        os.fsync(f.fileno())


def format_seconds(sec: float) -> str:
    sec = int(round(sec))
    h = sec // 3600
    m = (sec % 3600) // 60
    s = sec % 60
    if h > 0:
        return f"{h}h {m}m {s}s"
    if m > 0:
        return f"{m}m {s}s"
    return f"{s}s"


def rank_key(row: Dict[str, Any]):
    f1p = row.get("f1_primary")
    f1t = row.get("f1_tie")
    f1p = float(f1p) if f1p not in (None, "", "None") else -1.0
    f1t = float(f1t) if f1t not in (None, "", "None") else -1.0
    return (f1p, f1t)


def print_top_results(rows: List[Dict[str, Any]], top_k: int = 10) -> None:
    cleaned = []
    for r in rows:
        if r.get("status") != "ok":
            continue
        try:
            cleaned.append({
                **r,
                "precision_primary": float(r["precision_primary"]),
                "recall_primary": float(r["recall_primary"]),
                "f1_primary": float(r["f1_primary"]),
                "precision_tie": float(r["precision_tie"]),
                "recall_tie": float(r["recall_tie"]),
                "f1_tie": float(r["f1_tie"]),
            })
        except Exception:
            pass

    cleaned.sort(key=rank_key, reverse=True)

    print("\n" + "=" * 140)
    print(f"Top {min(top_k, len(cleaned))} results so far (sorted by F1@{PRIMARY_TOL}, then F1@{TIE_TOL}):")
    for r in cleaned[:top_k]:
        print(
            f"F1@{PRIMARY_TOL}={r['f1_primary']:.4f}  "
            f"F1@{TIE_TOL}={r['f1_tie']:.4f}  "
            f"P@{PRIMARY_TOL}={r['precision_primary']:.4f}  "
            f"R@{PRIMARY_TOL}={r['recall_primary']:.4f}  "
            f"family={r['family']}  "
            f"model_params={r['model_params']}  "
            f"ml_drop_params={r['ml_drop_params']}"
        )


def evaluate_at_tolerances(ml_drop_params: Dict[str, Any]) -> Dict[str, Any]:
    p1, r1, f1 = evaluate_drop_level(ml_drop_params, tolerance_beats=PRIMARY_TOL)
    p2, r2, f2 = evaluate_drop_level(ml_drop_params, tolerance_beats=TIE_TOL)
    return {
        "precision_primary": p1,
        "recall_primary": r1,
        "f1_primary": f1,
        "precision_tie": p2,
        "recall_tie": r2,
        "f1_tie": f2,
    }


# =========================================================
# Main
# =========================================================

def main():
    labeled_samples = load_labeled_samples(split=LABEL_SPLIT)
    if len(labeled_samples) == 0:
        print(f"No labeled samples found in split='{LABEL_SPLIT}'.")
        return

    experiments = build_experiments()
    done_ids = load_done_experiment_ids(RESULTS_CSV)
    existing_rows = load_existing_rows(RESULTS_CSV)

    family_counts = Counter(e.family for e in experiments)

    print(f"Loaded {len(labeled_samples)} labeled samples.")
    print(f"Built {len(experiments)} experiments.")
    print(f"Breakdown: {dict(family_counts)}")
    print(f"Champion ET config: {CHAMPION_ET}")
    print(f"Champion ml_drop config: {CHAMPION_ML_DROP}")
    print(f"Primary tolerance: {PRIMARY_TOL}")
    print(f"Tie-break tolerance: {TIE_TOL}")
    print(f"Already completed in CSV: {len(done_ids)}")

    fieldnames = [
        "exp_id",
        "status",
        "family",
        "model_params",
        "ml_drop_params",
        "precision_primary",
        "recall_primary",
        "f1_primary",
        "precision_tie",
        "recall_tie",
        "f1_tie",
        "elapsed_sec",
        "error",
    ]

    all_rows = existing_rows[:]
    total_to_run = sum(1 for e in experiments if e.exp_id not in done_ids)

    if total_to_run == 0:
        print("Nothing to run. Existing results:")
        print_top_results(all_rows, top_k=10)
        return

    print(f"Remaining experiments to run: {total_to_run}")

    start_all = time.time()
    completed_this_session = 0

    for exp in experiments:
        if exp.exp_id in done_ids:
            continue

        print("\n" + "=" * 140)
        print(f"Running experiment {completed_this_session + 1}/{total_to_run}")
        print(f"family: {exp.family}")
        print(f"model_params: {exp.model_params}")
        print(f"ml_drop_params: {exp.ml_drop_params}")

        row = {
            "exp_id": exp.exp_id,
            "status": "ok",
            "family": exp.family,
            "model_params": json.dumps(exp.model_params, sort_keys=True),
            "ml_drop_params": json.dumps(exp.ml_drop_params, sort_keys=True),
            "precision_primary": None,
            "recall_primary": None,
            "f1_primary": None,
            "precision_tie": None,
            "recall_tie": None,
            "f1_tie": None,
            "elapsed_sec": None,
            "error": "",
        }

        t0 = time.time()
        try:
            ml_model = exp.model_factory(**exp.model_params)
            train_model(labeled_samples=labeled_samples, ml_model=ml_model)

            scores = evaluate_at_tolerances(exp.ml_drop_params)
            row.update(scores)

            print(
                f"Result -> "
                f"F1@{PRIMARY_TOL}={row['f1_primary']:.4f}, "
                f"F1@{TIE_TOL}={row['f1_tie']:.4f}"
            )

        except Exception as e:
            row["status"] = "failed"
            row["error"] = repr(e)
            print(f"FAILED: {e}")

        row["elapsed_sec"] = round(time.time() - t0, 3)

        append_row(RESULTS_CSV, row, fieldnames)
        all_rows.append(row)
        completed_this_session += 1

        avg_time = (time.time() - start_all) / max(completed_this_session, 1)
        remaining = total_to_run - completed_this_session
        eta = remaining * avg_time

        print(
            f"Elapsed this run: {format_seconds(row['elapsed_sec'])} | "
            f"Avg/run this session: {format_seconds(avg_time)} | "
            f"ETA remaining: {format_seconds(eta)}"
        )

        print_top_results(all_rows, top_k=8)

    print("\n" + "=" * 140)
    print(f"Finished. Results saved to: {RESULTS_CSV}")
    print_top_results(all_rows, top_k=15)


if __name__ == "__main__":
    main()
