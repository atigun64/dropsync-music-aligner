# Training Workflow

The training workflow is designed around manual labels and candidate windows.

1. Generate candidate drop windows with the heuristic detector.
2. Inspect candidates and label them as drop / not drop.
3. Save labeled examples to disk in the `music_drop/data/` structure.
4. Train a classifier using the candidate window features and heuristic score.
5. Save the trained model for later inference.

The repository includes scripts under `music_drop/scripts/` for dataset management,
active learning, and retraining. Use these scripts to generate new training data and
update the model.
