from __future__ import annotations
import mimetypes

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import get_studio_service

from pathlib import Path
from app.schemas import (
    StudioSessionSchema,
    QuerySpecCreateSchema,
    QuerySpecSchema,
    AlignmentSpecSchema,
    StudioMetaCreateSchema,
    StudioMetaSchema,
)
from app.services.studio_service import StudioService
from app.mappers.studio_mappers import (
    query_create_to_model,
    alignment_to_model,
)
from app.services.video_service import save_uploaded_video_file_permanently
from app.services.exceptions import (
    StudioNotFound,
    AlignmentNotFound,
)

router = APIRouter(prefix="/api/studios", tags=["studios"])

@router.get("", response_model=list[str])
def list_studios(service: StudioService = Depends(get_studio_service)):
    return service.list_studio_ids()


@router.post("", response_model=str)
def create_studio(service: StudioService = Depends(get_studio_service)):
    return service.create_studio()


@router.get("/{studio_id}", response_model=StudioSessionSchema)
def get_studio_session(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        session = service.get_studio_session(studio_id)
        return StudioSessionSchema.model_validate(session)
    except StudioNotFound:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")


@router.get("/{studio_id}/metadata", response_model=StudioMetaSchema)
def get_studio_metadata(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        session = service.get_studio_session(studio_id)
        return StudioMetaSchema.model_validate(session.meta)
    except StudioNotFound:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")


@router.put("/{studio_id}/metadata", response_model=StudioSessionSchema)
def update_studio_metadata(
    studio_id: str,
    meta: StudioMetaCreateSchema = Body(...),
    service: StudioService = Depends(get_studio_service),
):
    try:
        service.update_metadata(studio_id, meta)
        session = service.get_studio_session(studio_id)
        return StudioSessionSchema.model_validate(session)
    except StudioNotFound:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")


@router.post("/{studio_id}/video", response_model=StudioSessionSchema)
def upload_studio_video(
    studio_id: str,
    file: UploadFile = File(...),
    service: StudioService = Depends(get_studio_service),
):
    try:
        # ensure studio exists
        _ = service.get_studio_session(studio_id)
        saved_path = save_uploaded_video_file_permanently(file, studio_id)
        service.update_video_path(studio_id, str(saved_path))
        session = service.get_studio_session(studio_id)
        return StudioSessionSchema.model_validate(session)
    except StudioNotFound:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to process media: {str(e)}")
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
    except StudioNotFound:
        raise HTTPException(status_code=404, detail=f"Studio or query not found: {studio_id}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{studio_id}/query", response_model=StudioSessionSchema)
def update_studio_query(
    studio_id: str,
    query_data: QuerySpecCreateSchema = Body(...),
    service: StudioService = Depends(get_studio_service),
):
    try:
        query = query_create_to_model(query_data)
        service.save_query(studio_id, query)
        session = service.get_studio_session(studio_id)
        return StudioSessionSchema.model_validate(session)
    except StudioNotFound:
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
    except (StudioNotFound, AlignmentNotFound):
        raise HTTPException(status_code=404, detail=f"Studio or alignment not found: {studio_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{studio_id}/alignment", response_model=StudioSessionSchema)
def update_studio_alignment(
    studio_id: str,
    alignment_data: AlignmentSpecSchema = Body(...),
    service: StudioService = Depends(get_studio_service),
):
    try:
        alignment = alignment_to_model(alignment_data)
        service.save_alignment(studio_id, alignment)
        session = service.get_studio_session(studio_id)
        return StudioSessionSchema.model_validate(session)
    except StudioNotFound:
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
    except StudioNotFound:
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
    service.delete_studio(studio_id)
    return {"message": f"Studio {studio_id} deleted successfully"}

@router.get("/{studio_id}/audio")
def get_studio_audio(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        audio_path = service.render_audio_for_studio(studio_id)
        return FileResponse(audio_path, media_type="audio/mpeg", filename=f"{studio_id}_output.mp3")
    except (StudioNotFound, AlignmentNotFound):
        raise HTTPException(status_code=404, detail=f"Studio or alignment not found: {studio_id}")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate audio: {str(e)}")

@router.get("/{studio_id}/video")
def get_studio_video(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    session = service.get_studio_session(studio_id)
    if not session.meta.video_path:
        raise HTTPException(status_code=404, detail=f"No video uploaded for studio: {studio_id}")

    video_path = Path(session.meta.video_path)
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")

    mime_type, _ = mimetypes.guess_type(str(video_path))

    return FileResponse(
        path=str(video_path),
        media_type=mime_type or "application/octet-stream",
        filename=video_path.name,
    )
