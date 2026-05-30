from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException

from app.api.deps import get_studio_service
from app.models import (
    AlignmentSpec,
    AlignmentTrack,
    AnnotationPoint,
    QuerySpec,
    StudioMeta,
)
from app.serializers import (
    StudioSessionSerializer,
    QuerySpecCreateSerializer,
    QuerySpecSerializer,
    AlignmentSpecSerializer,
    StudioMetaCreateSerializer,
    StudioMetaSerializer,
    AlignmentTrackSerializer,
    AnnotationPointCreateSerializer,
)
from app.services.studio_service import StudioService

router = APIRouter(prefix="/api/studios", tags=["studios"])


def _annotation_create_to_model(a: AnnotationPointCreateSerializer) -> AnnotationPoint:
    return AnnotationPoint(
        label=a.label,
        time_seconds=a.time_seconds,
        strength=a.strength,
    )


def _query_create_to_model(q: QuerySpecCreateSerializer) -> QuerySpec:
    return QuerySpec(
        length_seconds=q.length_seconds,
        signature=q.signature,
        requested_points=[_annotation_create_to_model(p) for p in q.requested_points],
    )


def _alignment_to_model(al: AlignmentSpecSerializer) -> AlignmentSpec:
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


@router.get("/{studio_id}", response_model=StudioSessionSerializer)
def get_studio_session(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        session = service.get_studio_session(studio_id)
        return StudioSessionSerializer.model_validate(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{studio_id}/metadata", response_model=StudioMetaSerializer)
def get_studio_metadata(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        session = service.get_studio_session(studio_id)
        return StudioMetaSerializer.model_validate(session.meta)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{studio_id}/metadata", response_model=StudioSessionSerializer)
def update_studio_metadata(
    studio_id: str,
    meta: StudioMetaCreateSerializer = Body(...),
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
        return StudioSessionSerializer.model_validate(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{studio_id}/query", response_model=QuerySpecSerializer)
def get_studio_query(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        query = service.load_query(studio_id)
        return QuerySpecSerializer.model_validate(query)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio or query not found: {studio_id}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{studio_id}/query", response_model=StudioSessionSerializer)
def update_studio_query(
    studio_id: str,
    query_data: QuerySpecCreateSerializer = Body(...),
    service: StudioService = Depends(get_studio_service),
):
    try:
        query = _query_create_to_model(query_data)
        service.save_query(studio_id, query)
        session = service.get_studio_session(studio_id)
        return StudioSessionSerializer.model_validate(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{studio_id}/alignment", response_model=AlignmentSpecSerializer)
def get_studio_alignment(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        alignment = service.load_alignment(studio_id)
        return AlignmentSpecSerializer.model_validate(alignment)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio or alignment not found: {studio_id}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{studio_id}/alignment", response_model=StudioSessionSerializer)
def update_studio_alignment(
    studio_id: str,
    alignment_data: AlignmentSpecSerializer = Body(...),
    service: StudioService = Depends(get_studio_service),
):
    try:
        alignment = _alignment_to_model(alignment_data)
        service.save_alignment(studio_id, alignment)
        session = service.get_studio_session(studio_id)
        return StudioSessionSerializer.model_validate(session)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Studio not found: {studio_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{studio_id}/run-optimizer", response_model=AlignmentSpecSerializer)
def run_optimizer(
    studio_id: str,
    service: StudioService = Depends(get_studio_service),
):
    try:
        alignment = service.run_optimizer(studio_id)
        return AlignmentSpecSerializer.model_validate(alignment)
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
