# API

The backend exposes a FastAPI app in `app/api/app.py`.

Important endpoints:

- `GET /api/tracks` — list uploaded tracks.
- `POST /api/tracks/upload` — upload an audio file and create a track record.
- `PUT /api/tracks/{track_id}/annotations` — update track annotations.
- `PUT /api/tracks/{track_id}/metadata` — update track metadata.
- `DELETE /api/tracks/{track_id}` — delete a track.

Studio endpoints:

- `GET /api/studios` — list studio sessions.
- `POST /api/studios` — create a new studio session.
- `GET /api/studios/{studio_id}` — get session metadata.
- `PUT /api/studios/{studio_id}/query` — save studio query data.
- `POST /api/studios/{studio_id}/run-optimizer` — run the alignment optimizer.
- `GET /api/studios/{studio_id}/audio` — download generated audio output.
- `GET /api/studios/{studio_id}/video` — download uploaded studio video.
