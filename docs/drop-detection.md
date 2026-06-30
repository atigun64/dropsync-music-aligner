# Drop Detection

Detecting musical **drops** at beat resolution — there is no standard library API for this. Music Matcher uses a custom pipeline: feature extraction → (optional heuristic) → ML classifier.

---

## Pipeline stages

### 1. Feature extraction

`music_core/features/extract_features.py`

- Loads audio
- Beat tracking via **Essentia**
- Spectral / energy features via **Librosa**, resampled to beat grid

**Beat-synchronous channels:**

| Feature | Description |
|---------|-------------|
| Energy | Per-beat loudness |
| Onset strength | Transient activity |
| Spectral centroid | Brightness |
| Spectral flatness | Noise vs tonal content |
| Bass ratio | Low-frequency energy share |

Output: arrays `E, O, C, F, B` aligned to `beat_times`.

### 2. Heuristic scoring (bootstrap / legacy)

`music_core/drop/drop_heuristic.py`

- Sliding window over beat indices
- Compares pre-drop, buildup, and drop regions
- Combines energy, onset, centroid, and bass into a single heuristic score

Used historically to:

- Explore the problem before labels existed (~50% informal accuracy)
- Seed the first training examples (high-heuristic beats only)

**Not used as the final production detector** after the ML model was trained.

### 3. ML inference (production)

`music_core/drop/drop_ml.py` → `get_ml_candidates()`

1. Consider beats (initially heuristic-filtered during training era; production uses model over candidate beats)
2. Build feature window per beat → flatten to classifier input vector
3. Predict drop probability with `drop_model.joblib` (ExtraTreesClassifier, trained in `music_drop/`)
4. Filter by `min_score`, enforce `min_gap_sec`, suppress nearby duplicates
5. Return `(beat_idx, beat_time, ml_score, ...)` tuples

Loaded via joblib from `drop_model.joblib` at the project root. Override with `MUSIC_MATCHER_MODEL_PATH`.

---

## Beat-level granularity

Drops are **events anchored to beats**, not arbitrary sample indices. This matches:

- How DJs and editors reason about drops
- How the optimizer aligns track annotations to query pinpoints
- How labels were collected in the active-learning UI

---

## Training (offline)

See [training-workflow.md](training-workflow.md) and [results.md](results.md).

Summary:

- ~1.5k manually labeled beat regions
- Heuristic-seeded cold start → active learning → full corpus labeling
- **F1 0.7847** on held-out eval tracks (±7 beat matching tolerance)

---

## Key files

| File | Role |
|------|------|
| `music_core/features/extract_features.py` | Audio → beat features |
| `music_core/drop/drop_heuristic.py` | Hand-tuned baseline |
| `music_core/drop/drop_ml.py` | Model inference |
| `music_core/drop/window.py` | Local feature windows for ML |
| `music_drop/src/training/` | Training loop |
| `music_drop/src/score/score.py` | F1 evaluation |
---

## Demo placeholder

<!-- Record: upload track, show drop markers on timeline, edit one annotation -->

**[Drop detection demo video]()** <!-- link to README demo row 2 -->

