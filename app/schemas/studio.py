from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.annotation import (
    AnnotationPointSchema,
    AnnotationPointCreateSchema,
)


class QuerySpecSchema(BaseModel):
    length_seconds: float
    signature: List[float]
    requested_points: List[AnnotationPointSchema] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class QuerySpecCreateSchema(BaseModel):
    length_seconds: float
    signature: List[float]
    requested_points: List[AnnotationPointCreateSchema] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class AlignmentTrackSchema(BaseModel):
    track_id: str
    start_time_seconds: float
    speed: float = 1.0
    placed_points: List[AnnotationPointSchema] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class AlignmentSpecSchema(BaseModel):
    score: float
    tracks: List[AlignmentTrackSchema] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class StudioMetaSchema(BaseModel):
    source: str = "silent"
    video_path: Optional[str] = None
    notes: str = ""

    model_config = ConfigDict(from_attributes=True)


class StudioMetaCreateSchema(BaseModel):
    source: str = "silent"
    video_path: Optional[str] = None
    notes: str = ""

    model_config = ConfigDict(from_attributes=True)


class StudioSessionSchema(BaseModel):
    studio_id: str
    meta: StudioMetaSchema
    query: Optional[QuerySpecSchema] = None
    alignment: Optional[AlignmentSpecSchema] = None

    model_config = ConfigDict(from_attributes=True)


class StudioSessionCreateSchema(BaseModel):
    meta: StudioMetaCreateSchema = Field(default_factory=StudioMetaCreateSchema)

    model_config = ConfigDict(from_attributes=True)
