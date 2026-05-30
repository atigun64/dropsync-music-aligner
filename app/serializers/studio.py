from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.serializers.annotation import (
    AnnotationPointSerializer,
    AnnotationPointCreateSerializer,
)


class QuerySpecSerializer(BaseModel):
    length_seconds: float
    signature: List[float]
    requested_points: List[AnnotationPointSerializer] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class QuerySpecCreateSerializer(BaseModel):
    length_seconds: float
    signature: List[float]
    requested_points: List[AnnotationPointCreateSerializer] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class AlignmentTrackSerializer(BaseModel):
    track_id: str
    start_time_seconds: float
    speed: float = 1.0
    placed_points: List[AnnotationPointSerializer] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class AlignmentSpecSerializer(BaseModel):
    score: float
    tracks: List[AlignmentTrackSerializer] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class StudioMetaSerializer(BaseModel):
    source: str = "silent"
    video_path: Optional[str] = None
    notes: str = ""

    model_config = ConfigDict(from_attributes=True)


class StudioMetaCreateSerializer(BaseModel):
    source: str = "silent"
    video_path: Optional[str] = None
    notes: str = ""

    model_config = ConfigDict(from_attributes=True)


class StudioSessionSerializer(BaseModel):
    studio_id: str
    meta: StudioMetaSerializer
    query: Optional[QuerySpecSerializer] = None
    alignment: Optional[AlignmentSpecSerializer] = None

    model_config = ConfigDict(from_attributes=True)


class StudioSessionCreateSerializer(BaseModel):
    meta: StudioMetaCreateSerializer = Field(default_factory=StudioMetaCreateSerializer)

    model_config = ConfigDict(from_attributes=True)
