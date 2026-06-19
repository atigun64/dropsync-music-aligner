# Drop Detection

The drop-detection pipeline works in two stages:

1. Feature extraction
   - `music_core/features/extract_features.py` loads audio and computes beat-synchronous vectors.
   - Features include energy, onset strength, spectral centroid, spectral flatness, and bass ratio.
   - The output is a set of arrays aligned to detected beat times.

2. Heuristic scoring
   - `music_core/drop/drop_heuristic.py` slides a fixed window across beat-synchronous features.
   - For each candidate beat, it compares pre-drop, buildup, and drop regions.
   - The heuristic computes separate scores for energy, onset, centroid, and bass, then combines them.

Optional ML refinement
- The repository previously stored a model artifact as `drop_model.joblib`.
- The intended design is to use model scores to refine or rerank heuristic proposals.
- The model input is typically the heuristic score plus a flattened local feature window.
