# Architecture

Music Matcher is a monorepo organized by concern. Each module can be understood independently, but the product value is the **full pipeline** from audio upload to alignment result.

---

## System overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  frontend   │────▶│  app (API)   │────▶│  optimizer  │
│  React UI   │◀────│  services    │◀────│ beam search │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
                    ┌──────▼───────┐
                    │  music_core  │
                    │ features+ML  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  music_drop  │  (offline: train / label / eval)
                    └──────────────┘
```

---

## `app/` — Application & API

FastAPI application and persistence layer.

**Responsibilities**

- REST endpoints for tracks, studios, uploads, optimizer runs
- Service layer coordinating `music_core`, `optimizer`, and storage
- Filesystem-backed stores (`TrackStore`, `StudioStore`)
- User data in OS-specific directory (see `app/storage/user_data.py`)

**Key paths**

| Path | Role |
|------|------|
| `app/api/routes/` | HTTP routers |
| `app/services/` | Business logic |
| `app/storage/` | Config + on-disk persistence |
| `app/models.py` | Domain types shared with optimizer |

**Optional:** when `frontend/dist` exists (or `MUSIC_MATCHER_STATIC_DIR` is set), FastAPI also serves the built React app for single-port / desktop deployments.

---

## `music_core/` — Audio analysis & inference

Runtime audio pipeline used by the API on upload.

**Responsibilities**

- Load audio, extract beat-synchronous features (Essentia beat tracker + Librosa spectral features)
- Heuristic drop scoring (`drop_heuristic.py`) — legacy bootstrap / fallback
- ML drop inference (`drop_ml.py`) — loads `drop_model.joblib`, returns beat-level candidates

**Feature channels (beat-aligned)**

- Energy, onset strength, spectral centroid, spectral flatness, bass ratio

Output feeds track annotations stored by `app/`.

---

## `music_drop/` — Training & labeling (offline)

Not required at API runtime. Used to build and evaluate `drop_model.joblib`.

**Responsibilities**

- Labeling UI for beat-level drop / not-drop
- Active learning loop (`run_active_learning.py`)
- Train / retrain scripts, dataset splits, evaluation (`evaluation.py`, `score.py`)
- Feature cache for fast iteration

Data artifacts (`music_drop/data/`) are gitignored.

---

## `optimizer/` — Alignment engine

**Audio-agnostic.** Consumes typed objects (`Query`, `TrackLibrary`, `Alignment`) defined in `optimizer/models.py` and mirrored in `app/models.py`.

**Responsibilities**

- Beam search over track placements (`optimizer/core/beam_search.py`)
- Composite score: drop match, gaps, overlap, BPM, style, preference (`optimizer/scores/`)

The optimizer does not know about MP3 files or Essentia — only segments and annotation points. This separation keeps the search logic testable and domain-clean.

---

## `frontend/` — Studio UI

Vite + React single-page app.

**Screens**

- Track library: upload, timeline, annotation editing
- Studio: video panel, query pinpoints, alignment view, optimizer trigger

Calls `/api/*` on the backend. In dev, Vite proxies to uvicorn; in desktop builds, UI is served from the same origin as the API.

---

## `electron/` — Desktop packaging

Spawns the Python backend and opens a `BrowserWindow` on the studio UI. A **Linux AppImage (v0.1.0)** has been built; packaging bundles PyInstaller backend + `frontend/dist` via electron-builder.

---

## Data flow (happy path)

1. User uploads audio → `app` saves file, calls `music_core` → drop candidates → stored as track annotations.
2. User creates a studio, uploads video, places query pinpoints.
3. User runs optimizer → `app` builds `Query` + `TrackLibrary` → `optimizer` beam search → `AlignmentSpec` saved.
4. Frontend renders alignment; user reviews and optionally re-runs.

---

## Storage layout (runtime)

User data directory (e.g. `~/.local/share/music_matcher`):

```
music_matcher/
  initialized.json
  track_library/
    _index.json
    <track_id>/
      meta.json
      annotations.json
      audio_path.txt
  studios/
    <studio_id>/
      meta.json
      query.json
      alignment.json
  audio_uploads/
  video_uploads/
  studio_audios/
```

Bundled `app/data/` is copied once on first launch if present; thereafter all reads/writes use the user directory.
