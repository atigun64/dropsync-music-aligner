# This script runs a curated set of experiments with different ML models and ml_drop parameters,

# 06.06.2026: Unfortunately, initial model I had was already very close to optimal, so the curated sweep didn't yield significant improvements. 
# I will freeze the current model and try to improve it by adding more training data and/or features, rather than by tuning hyperparameters.

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List
import csv
import json
import os
import time

from sklearn.ensemble import (
    ExtraTreesClassifier,
    RandomForestClassifier,
    HistGradientBoostingClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from music_drop.src.score.score import evaluate_drop_level
from music_drop.src.training.labeling import load_labeled_samples
from music_drop.src.training.train import train_model


LABEL_SPLIT = "train"
RESULTS_CSV = Path("music_drop", "data", "curated_model_sweep.csv")


@dataclass
class Experiment:
    exp_id: str
    family: str
    model_params: Dict[str, Any]
    ml_drop_params: Dict[str, Any]
    model_factory: Callable[..., Any]


# =========================
# Model factories
# =========================

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


def make_random_forest(
    n_estimators: int,
    min_samples_leaf: int,
    max_features: Any,
    max_depth: Any,
) -> RandomForestClassifier:
    return RandomForestClassifier(
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


# =========================
# Curated model configs
# =========================

LOGREG_CONFIGS = [
    {"C": 0.005},
    {"C": 0.01},
    {"C": 0.02},
    {"C": 0.05},
    {"C": 0.1},
]

EXTRATREES_CONFIGS = [
    {"n_estimators": 400, "min_samples_leaf": 1, "max_features": "sqrt", "max_depth": None},
    {"n_estimators": 800, "min_samples_leaf": 1, "max_features": "sqrt", "max_depth": None},
    {"n_estimators": 400, "min_samples_leaf": 2, "max_features": "sqrt", "max_depth": None},
    {"n_estimators": 800, "min_samples_leaf": 2, "max_features": "sqrt", "max_depth": None},
    {"n_estimators": 400, "min_samples_leaf": 4, "max_features": "sqrt", "max_depth": None},
    {"n_estimators": 800, "min_samples_leaf": 4, "max_features": "sqrt", "max_depth": None},
    {"n_estimators": 500, "min_samples_leaf": 2, "max_features": 0.5, "max_depth": None},
    {"n_estimators": 500, "min_samples_leaf": 2, "max_features": "sqrt", "max_depth": 20},
]

HGB_CONFIGS = [
    {"max_iter": 300, "learning_rate": 0.05, "max_leaf_nodes": 15, "min_samples_leaf": 10, "l2_regularization": 0.1},
    {"max_iter": 300, "learning_rate": 0.05, "max_leaf_nodes": 31, "min_samples_leaf": 10, "l2_regularization": 0.1},
    {"max_iter": 300, "learning_rate": 0.03, "max_leaf_nodes": 31, "min_samples_leaf": 10, "l2_regularization": 0.1},
    {"max_iter": 500, "learning_rate": 0.03, "max_leaf_nodes": 31, "min_samples_leaf": 10, "l2_regularization": 0.1},
    {"max_iter": 300, "learning_rate": 0.05, "max_leaf_nodes": 15, "min_samples_leaf": 5, "l2_regularization": 0.0},
    {"max_iter": 500, "learning_rate": 0.05, "max_leaf_nodes": 31, "min_samples_leaf": 5, "l2_regularization": 0.0},
]

RANDOM_FOREST_CONFIGS = [
    {"n_estimators": 500, "min_samples_leaf": 1, "max_features": "sqrt", "max_depth": None},
    {"n_estimators": 500, "min_samples_leaf": 2, "max_features": "sqrt", "max_depth": None},
    {"n_estimators": 800, "min_samples_leaf": 2, "max_features": "sqrt", "max_depth": None},
    {"n_estimators": 500, "min_samples_leaf": 2, "max_features": 0.5, "max_depth": None},
]


# =========================
# Curated ml_drop params
# =========================
LOGREG_ML_DROP_CONFIGS = [
    {"min_score": 0.60, "heuristic_threshold": 0.10, "min_gap_sec": 16},
    {"min_score": 0.65, "heuristic_threshold": 0.10, "min_gap_sec": 20},
    {"min_score": 0.70, "heuristic_threshold": 0.10, "min_gap_sec": 20},
    {"min_score": 0.75, "heuristic_threshold": 0.10, "min_gap_sec": 24},
]

TREE_ML_DROP_CONFIGS = [
    {"min_score": 0.50, "heuristic_threshold": 0.10, "min_gap_sec": 16},
    {"min_score": 0.55, "heuristic_threshold": 0.10, "min_gap_sec": 20},
    {"min_score": 0.60, "heuristic_threshold": 0.10, "min_gap_sec": 20},
    {"min_score": 0.65, "heuristic_threshold": 0.10, "min_gap_sec": 24},
    {"min_score": 0.70, "heuristic_threshold": 0.10, "min_gap_sec": 24},
]



def build_experiments() -> List[Experiment]:
    experiments: List[Experiment] = []

    def add_family(family: str, factory: Callable[..., Any], configs: List[Dict[str, Any]], ml_configs: List[Dict[str, Any]]):
        for model_params in configs:
            for ml_params in ml_configs:
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

    add_family("logreg", make_logreg, LOGREG_CONFIGS, LOGREG_ML_DROP_CONFIGS)
    add_family("extratrees", make_extratrees, EXTRATREES_CONFIGS, TREE_ML_DROP_CONFIGS)
    add_family("hgb", make_hgb, HGB_CONFIGS, TREE_ML_DROP_CONFIGS)
    add_family("random_forest", make_random_forest, RANDOM_FOREST_CONFIGS, TREE_ML_DROP_CONFIGS)

    return experiments



def normalize_result(result: Any) -> Dict[str, Any]:
    """
    Supports:
    - dict with precision/recall/f1
    - tuple/list (precision, recall, f1)
    """
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


def print_top_results(rows: List[Dict[str, Any]], top_k: int = 8) -> None:
    cleaned = []
    for r in rows:
        try:
            if r.get("status") == "ok" and r.get("f1") not in ("", None):
                cleaned.append({
                    **r,
                    "precision": float(r["precision"]),
                    "recall": float(r["recall"]),
                    "f1": float(r["f1"]),
                })
        except Exception:
            pass

    cleaned.sort(key=lambda r: r["f1"], reverse=True)

    print("\n" + "=" * 130)
    print(f"Top {min(top_k, len(cleaned))} results so far:")
    for r in cleaned[:top_k]:
        print(
            f"F1={r['f1']:.4f}  "
            f"P={r['precision']:.4f}  "
            f"R={r['recall']:.4f}  "
            f"family={r['family']}  "
            f"model_params={r['model_params']}  "
            f"ml_drop_params={r['ml_drop_params']}"
        )


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


def main():
    labeled_samples = load_labeled_samples(split=LABEL_SPLIT)
    if len(labeled_samples) == 0:
        print(f"No labeled samples found in split='{LABEL_SPLIT}'.")
        return

    experiments = build_experiments()
    done_ids = load_done_experiment_ids(RESULTS_CSV)
    existing_rows = load_existing_rows(RESULTS_CSV)

    print(f"Loaded {len(labeled_samples)} labeled samples.")
    print(f"Built {len(experiments)} curated experiments.")
    print(f"Already completed: {len(done_ids)}")

    fieldnames = [
        "exp_id",
        "status",
        "family",
        "model_params",
        "ml_drop_params",
        "precision",
        "recall",
        "f1",
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

    for idx, exp in enumerate(experiments, 1):
        if exp.exp_id in done_ids:
            continue

        print("\n" + "=" * 130)
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
            "precision": None,
            "recall": None,
            "f1": None,
            "elapsed_sec": None,
            "error": "",
        }

        t0 = time.time()
        try:
            ml_model = exp.model_factory(**exp.model_params)
            train_model(labeled_samples=labeled_samples, ml_model=ml_model)

            result = evaluate_drop_level(exp.ml_drop_params)
            norm = normalize_result(result)

            row["precision"] = norm["precision"]
            row["recall"] = norm["recall"]
            row["f1"] = norm["f1"]

            print(
                f"Result -> "
                f"P={row['precision']} "
                f"R={row['recall']} "
                f"F1={row['f1']}"
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

    print("\n" + "=" * 130)
    print(f"Finished. Results saved to: {RESULTS_CSV}")
    print_top_results(all_rows, top_k=15)


if __name__ == "__main__":
    main()
