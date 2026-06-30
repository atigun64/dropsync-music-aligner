# Training Workflow

How `drop_model.joblib` is produced. This is an **offline** workflow — the API loads the finished model at runtime.

---

## Problem constraints at the start

- No public “drop detection” dataset
- No pretrained model
- No labeled data
- Need enough signal to start optimizing alignments

Solution: **bootstrap with heuristics, then active learning, then full labeling.**

---

## Phase 1 — Heuristic cold start

1. Run heuristic detector on unlabeled tracks (`music_core/drop/drop_heuristic.py`)
2. Label only beats above a heuristic threshold as candidate positives/negatives
3. Train an initial classifier on these noisy windows
4. Iterate until the model beats the heuristic on spot checks

At this stage labels are cheap but biased toward “obvious” drops.

---

## Phase 2 — Active learning expansion

Scripts: `music_drop/scripts/run_active_learning.py`, labeling UI in `music_drop/src/ui/`

1. Model suggests beats across the full lattice (not just high-heuristic)
2. Human confirms or rejects in the labeling UI
3. Retrain (`retrain_model.py`) on growing labeled set
4. Repeat until marginal label value drops

**~1,500 beat regions** labeled in total across this phase.

---

## Phase 3 — Evaluation & hyperparameters

Scripts: `music_drop/scripts/evaluation.py`, `music_drop/src/score/score.py`

- Held-out track split (`music_drop/data/split/eval`)
- Ground truth: `music_drop/data/drop_points.txt` (local)
- Metrics: precision, recall, F1 with greedy ±N beat matching
- Tune: `min_score`, `min_gap_sec`, classifier hyperparameters

**Best result: F1 0.7847** (precision 0.7885, recall 0.7810) — see [results.md](results.md).

---

## On-disk data layout (local, gitignored)

```
music_drop/data/
  split/
    train
    eval
  labeled_samples/
  drop_points.txt        # eval ground truth
  ...
```

---

## Typical commands

```bash
# Label / active learning (interactive)
python music_drop/scripts/run_active_learning.py

# Retrain model
python music_drop/scripts/retrain_model.py

# Evaluate on held-out set
python music_drop/scripts/evaluation.py
```

Retraining overwrites `drop_model.joblib` at the project root for API inference.