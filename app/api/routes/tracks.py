from __future__ import annotations

import re
import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile, status

from app.api.deps import get_track_service
from app.models import AnnotationPoint, TrackMeta
from app.schemas import (
    TrackRecordSchema,
    TrackListItemSchema,
    TrackMetaCreateSchema,
    AnnotationPointCreateSchema,
)
from app.services.track_service import TrackService
from app.storage.config import AUDIO_UPLOADS_DIR

router = APIRouter(prefix="/api/tracks", tags=["tracks"])


def _safe_filename(name: str) -> str:
    name = Path(name).name
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", name) or "track"


def _save_uploaded_file_permanently(file: UploadFile) -> Path:
    AUDIO_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    original = _safe_filename(file.filename or "track.bin")
    final_path = AUDIO_UPLOADS_DIR / f"{uuid4().hex}_{original}"

    with final_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    return final_path


@router.get("", response_model=list[TrackListItemSchema])
def list_tracks(service: TrackService = Depends(get_track_service)):
    try:
        tracks = service.list_tracks()
        return [TrackListItemSchema.model_validate(t) for t in tracks]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{track_id}", response_model=TrackRecordSchema)
def get_track(track_id: str, service: TrackService = Depends(get_track_service)):
    try:
        track = service.load_track(track_id)
        return TrackRecordSchema.model_validate(track)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Track not found: {track_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload", response_model=TrackRecordSchema)
async def upload_track(
    file: UploadFile = File(...),
    service: TrackService = Depends(get_track_service),
):
    try:
        permanent_path = _save_uploaded_file_permanently(file)
        track_record = service.upload_track(permanent_path)
        return TrackRecordSchema.model_validate(track_record)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to upload track: {str(e)}")


@router.put("/{track_id}/annotations", response_model=TrackRecordSchema)
def update_track_annotations(
    track_id: str,
    annotations: list[AnnotationPointCreateSchema] = Body(...),
    service: TrackService = Depends(get_track_service),
):
    try:
        annotation_points = [
            AnnotationPoint(
                label=a.label,
                time_seconds=a.time_seconds,
                strength=a.strength,
            )
            for a in annotations
        ]
        service.edit_track_annotations(track_id, annotation_points)
        track = service.load_track(track_id)
        return TrackRecordSchema.model_validate(track)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Track not found: {track_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{track_id}/metadata", response_model=TrackRecordSchema)
def update_track_metadata(
    track_id: str,
    meta: TrackMetaCreateSchema = Body(...),
    service: TrackService = Depends(get_track_service),
):
    try:
        track_meta = TrackMeta(
            length_seconds=meta.length_seconds,
            bpm=meta.bpm,
            signature=meta.signature,
            preference=meta.preference,
            min_speed=meta.min_speed,
            max_speed=meta.max_speed,
        )
        service.edit_track_meta(track_id, track_meta)
        track = service.load_track(track_id)
        return TrackRecordSchema.model_validate(track)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Track not found: {track_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{track_id}")
def delete_track(track_id: str, service: TrackService = Depends(get_track_service)):
    try:
        service.delete_track(track_id)
        return {"message": f"Track {track_id} deleted successfully"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Track not found: {track_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
