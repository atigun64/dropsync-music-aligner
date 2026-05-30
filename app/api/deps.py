from __future__ import annotations

from functools import lru_cache

from app.services.track_service import TrackService
from app.services.studio_service import StudioService
from app.storage import TRACK_STORE, STUDIO_STORE


@lru_cache
def get_track_service() -> TrackService:
    return TrackService(TRACK_STORE)


@lru_cache
def get_studio_service() -> StudioService:
    return StudioService(STUDIO_STORE)
