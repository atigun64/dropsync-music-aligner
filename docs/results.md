# Results & Evaluation

This document describes how drop-detection performance is measured so results are defensible in a portfolio or interview.

---

## Drop detection task

**Unit of prediction:** a beat index where a musical drop occurs.  
**Unit of label:** a manually annotated drop time (seconds), converted to the nearest beat index.

A drop is a perceptual event — energy release, breakdown-to-drop transition, “explosion” moment — not merely a loud frame.

---

## Dataset


| Metric                       | Value                                                             |
| ---------------------------- | ----------------------------------------------------------------- |
| Labeled beat regions (total) | **~1,500**                                                        |
| Labeling method              | Manual review in `music_drop` labeling UI                         |
| Labeling strategy            | Heuristic-seeded cold start → active learning → full beat lattice |
| Evaluation tracks            | tracks in held-out eval split                                     |
| Training tracks              | tracks in train split                                             |




Ground-truth drop times for evaluation are stored in `music_drop/data/drop_points.txt` (not committed — local eval artifact).

---

## Model


| Setting               | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Classifier            | **ExtraTreesClassifier** (scikit-learn)                                     |
| Input features        | Flattened beat-synchronous window (energy, onset, centroid, flatness, bass) |
| Inference             | `music_core/drop/drop_ml.py` → `get_ml_candidates()`                        |
| Artifact              | `drop_model.joblib` (project root, included in repo)                      |
| Confidence threshold  | `min_score = 0.60` (tuned on validation)                                    |
| Min gap between drops | `min_gap_sec = 10`                                                          |


Hyperparameter search and final training: `music_drop/scripts/retrain_model.py`, `music_drop/scripts/evaluation.py`.

---

## Metrics

Evaluation implementation: `music_drop/src/score/score.py` → `evaluate_drop_level()`.

For each eval track:

1. Run `get_ml_candidates()` to obtain predicted drop beat indices.
2. Convert ground-truth drop times to beat indices.
3. **Greedy one-to-one matching:** each predicted drop matches at most one real drop within tolerance.
4. Aggregate precision, recall, F1 across all tracks.

### Primary result


| Metric         | Value                                           | Notes                              |
| -------------- | ----------------------------------------------- | ---------------------------------- |
| **F1**         | **0.7847** | Held-out eval tracks               |
| Precision      | **0.7885** |                                    |
| Recall         | **0.7810** |                                    |
| Beat tolerance | **±7 beats** (default in `evaluate_drop_level`) | Configurable via `tolerance_beats` |




### Heuristic baseline (historical)

Before ML training, the hand-tuned heuristic in `music_core/drop/drop_heuristic.py` achieved roughly **~50% subjective accuracy** on informal listening tests. It was used only to bootstrap early labels, not as the final detector.

---

## What this does *not* claim

- Not benchmarked against a public dataset (none exists for this task).
- Not compared to commercial “drop detection” APIs (none expose this).
- F1 is **beat-level drop matching**, not downstream alignment quality.

Alignment quality is evaluated separately via the optimizer score function and manual review in studio sessions.

---

## Reproducing eval

```bash
pip install -r requirements.txt
python music_drop/scripts/evaluation.py
```

Requires local labeled data and `music_drop/data/drop_points.txt`. The drop model is included at the project root as `drop_model.joblib`.

Expected output:

```
Precision: 0.7885, Recall: 0.7810, F1 Score: 0.7847
```

