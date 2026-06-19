# Architecture

This project is organized into backend, optimizer, and frontend areas.

- `app/`
  - FastAPI application and data-service layer.
  - Handles track uploads, metadata, studio sessions, query editing, and optimizer runs.
  - Uses filesystem-backed persistence under `app/data/`.

- `music_core/`
  - Audio feature extraction and drop candidate scoring.
  - Uses Essentia for beat tracking and Librosa for spectral features.
  - Produces beat-synchronous feature arrays used by the drop detector.

- `music_drop/`
  - Training workflows, dataset helpers, and manual labeling utilities.
  - Contains scripts for collecting examples, training models, and managing labeled data.

- `optimizer/`
  - Search-based alignment engine.
  - Uses track metadata and drop annotations to align tracks to a requested timeline.

- `frontend/`
  - Vite + React application.
  - Provides UI for uploading tracks, editing annotations, creating studio sessions, and running alignments.
