from __future__ import annotations

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import get_studio_service
from app.models import (
    AlignmentSpec,
    AlignmentTrack,
    AnnotationPoint,
    QuerySpec,
    StudioMeta,
)
from pathlib import Path
import re
import shutil
from uuid import uuid4
from pydub import AudioSegment
from app.services.track_service import TrackService
from app.storage.config import VIDEO_UPLOADS_DIR
from app.schemas import (
    StudioSessionSchema,
    QuerySpecCreateSchema,
    QuerySpecSchema,
    AlignmentSpecSchema,
    StudioMetaCreateSchema,
    StudioMetaSchema,
    AlignmentTrackSchema,
    AnnotationPointCreateSchema,
)
from app.services.studio_service import StudioService

router = APIRouter(prefix="/api/studios", tags=["studios"])


def _annotation_create_to_model(a: AnnotationPointCreateSchema) -> AnnotationPoint:
    return AnnotationPoint(
        label=a.label,
        time_seconds=a.time_seconds,
        strength=a.strength,
    )


def _query_create_to_model(q: QuerySpecCreateSchema) -> QuerySpec:
    return QuerySpec(
        length_seconds=q.length_seconds,
        signature=q.signature,
        requested_points=[_annotation_create_to_model(p) for p in q.requested_points],
    )


def _alignment_to_model(al: AlignmentSpecSchema) -> AlignmentSpec:
    return AlignmentSpec(
        score=al.score,
        tracks=[
            AlignmentTrack(
                track_id=t.track_id,
                start_time_seconds=t.start_time_seconds,
                speed=t.speed,
                placed_points=[
                    AnnotationPoint(
                        label=p.label,
                        time_seconds=p.time_seconds,
                        strength=p.strength,
                    )
                    for p in t.placed_points
                ],
            )
            for t in al.tracks
        ],
    )


def _safe_filename(name: str) -> str:
    name = Path(name).name
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", name) or "video"


def _save_uploaded_video_file_permanently(file: UploadFile) -> Path:
    VIDEO_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    original = _safe_filename(file.filename or "video.mp4")
    final_path = VIDEO_UPLOADS_DIR / f"{uuid4().hex}_{original}"

    with final_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    return final_path


def _make_music_file_from_alignment_spec(alignment: AlignmentSpec, studio_id: str) -> Path:
    """
    Render an audio file from an AlignmentSpec and save it to `data/studio_audios`.
    Overwrites an existing file for the same studio.
    Returns the Path to the saved MP3 file.
    """
    out_dir = Path("data") / "studio_audios"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Use TrackService to resolve track audio paths
    ts = TrackService()

    segments: list[tuple[AudioSegment, int]] = []

    for t in alignment.tracks:
        try:
            rec = ts.load_track(t.track_id)
        except FileNotFoundError:
            # skip missing tracks
            continue

        if not rec.audio_path:
            continue

        src = AudioSegment.from_file(rec.audio_path)

        # apply speed change by altering frame rate
        if t.speed and abs(t.speed - 1.0) > 1e-6:
            new_frame_rate = int(src.frame_rate * float(t.speed))
            src = src._spawn(src.raw_data, overrides={"frame_rate": new_frame_rate}).set_frame_rate(src.frame_rate)

        start_ms = max(0, int(t.start_time_seconds * 1000))

        segments.append((src, start_ms))

    if not segments:
        # create a short silent file so clients always get a file
        out_path = out_dir / f"{studio_id}_alignment.mp3"
        silent = AudioSegment.silent(duration=1000)
        silent.export(out_path, format="mp3", bitrate="192k")
        return out_path

    # compute total duration
    total_ms = max(start_ms + len(seg) for seg, start_ms in segments)
    master = AudioSegment.silent(duration=total_ms)

    for seg, start_ms in segments:
        master = master.overlay(seg, position=start_ms)

    out_path = out_dir / f"{studio_id}_alignment.mp3"
    # export MP3 (overwrite if exists)
    master.export(out_path, format="mp3", bitrate="320k")
    return out_path

@router.get("", response_model=list[str])
def list_studios(service: StudioService = Depends(get_studio_service)):
    try:
        return service.list_studio_ids()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=str)
def create_studio(service: StudioService = Depends(get_studio_service)):
    try:
        return service.create_studio()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{studio_id}", response_model=StudioSessionSchema)
def get_studio_session(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        session = service.get_studio_session(studio_id)
        return StudioSessionSchema.model_validate(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{studio_id}/metadata", response_model=StudioMetaSchema)
def get_studio_metadata(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        session = service.get_studio_session(studio_id)
        return StudioMetaSchema.model_validate(session.meta)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{studio_id}/metadata", response_model=StudioSessionSchema)
def update_studio_metadata(
    studio_id: str,
    meta: StudioMetaCreateSchema = Body(...),
    service: StudioService = Depends(get_studio_service),
):
    try:
        session = service.get_studio_session(studio_id)
        session.meta = StudioMeta(
            source=meta.source,
            video_path=meta.video_path,
            notes=meta.notes,
        )
        service.save_studio_session(session)
        return StudioSessionSchema.model_validate(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{studio_id}/video", response_model=StudioSessionSchema)
def upload_studio_video(
    studio_id: str,
    file: UploadFile = File(...),
    service: StudioService = Depends(get_studio_service),
):
    try:
        session = service.get_studio_session(studio_id)
        saved_path = _save_uploaded_video_file_permanently(file)
        session.meta.video_path = str(saved_path)
        session.meta.source = "video"
        service.save_studio_session(session)
        return StudioSessionSchema.model_validate(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to upload video: {str(e)}")


@router.get("/{studio_id}/query", response_model=QuerySpecSchema)
def get_studio_query(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        query = service.load_query(studio_id)
        return QuerySpecSchema.model_validate(query)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio or query not found: {studio_id}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{studio_id}/query", response_model=StudioSessionSchema)
def update_studio_query(
    studio_id: str,
    query_data: QuerySpecCreateSchema = Body(...),
    service: StudioService = Depends(get_studio_service),
):
    try:
        query = _query_create_to_model(query_data)
        service.save_query(studio_id, query)
        session = service.get_studio_session(studio_id)
        return StudioSessionSchema.model_validate(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{studio_id}/alignment", response_model=AlignmentSpecSchema)
def get_studio_alignment(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        alignment = service.load_alignment(studio_id)
        return AlignmentSpecSchema.model_validate(alignment)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio or alignment not found: {studio_id}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{studio_id}/alignment", response_model=StudioSessionSchema)
def update_studio_alignment(
    studio_id: str,
    alignment_data: AlignmentSpecSchema = Body(...),
    service: StudioService = Depends(get_studio_service),
):
    try:
        alignment = _alignment_to_model(alignment_data)
        service.save_alignment(studio_id, alignment)
        session = service.get_studio_session(studio_id)
        return StudioSessionSchema.model_validate(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{studio_id}/run-optimizer", response_model=AlignmentSpecSchema)
def run_optimizer(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        alignment = service.run_optimizer(studio_id)
        return AlignmentSpecSchema.model_validate(alignment)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimizer failed: {str(e)}")


@router.delete("/{studio_id}")
def delete_studio(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        service.delete_studio(studio_id)
        return {"message": f"Studio {studio_id} deleted successfully"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{studio_id}/audio")
def get_studio_audio(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        alignment = service.load_alignment(studio_id)
        if alignment is None:
            raise HTTPException(status_code=404, detail=f"Alignment not found for studio: {studio_id}")
        audio_data = _make_music_file_from_alignment_spec(alignment, studio_id)
        return FileResponse(audio_data, media_type="audio/mpeg", filename=f"{studio_id}_output.mp3")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate audio: {str(e)}")