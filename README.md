# Music Matcher

A prototype project for detecting musical "drop" regions in audio tracks and aligning tracks to a requested timeline.

## What this repository contains

- `app/` — FastAPI backend, track/studio services, and API routes.
- `music_core/` — audio feature extraction and heuristic drop scoring.
- `music_drop/` — dataset utilities, labeling helpers, and training scripts.
- `optimizer/` — search-based alignment engine for placing tracks against a query.
- `frontend/` — Vite + React user interface.
- `docs/` — architecture and workflow documentation.

## High-level flow

1. Audio is processed into beat-synchronous feature arrays.
2. A heuristic identifies likely drop regions from the feature sequence.
3. Track metadata and drop annotations are stored by the backend.
4. An optimizer uses requested query points and track annotations to build an alignment.
5. The frontend can drive uploads, annotation edits, and optimizer runs.

## Cleanup status

This repository has been cleaned for sharing:

- tracked generated model and data artifacts were removed
- local absolute paths were removed from committed files
- copyrighted audio data was removed from the repository
- documentation and project-level config files were added

## Backend setup

Install Python dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Run the backend API:

```bash
uvicorn app.api.app:app --reload --host 0.0.0.0 --port 8000
```

## Frontend setup

Install frontend dependencies from `frontend/`:

```bash
cd frontend
npm install
npm run dev
```

The frontend is configured as a Vite React app and expects the backend to be available on the same host or via the base API path.

## Documentation

See the `docs/` folder for detailed architecture, drop-detection, training workflow, optimizer, and API information.

## Notes

- `drop_model.joblib` is no longer included in the repository.
- The repository is focused on backend and algorithmic prototype work.
- `app/data/` and `music_drop/data/` are intentionally excluded from the shared repo.

## License

This repository is distributed under the MIT License. See `LICENSE` for details.
