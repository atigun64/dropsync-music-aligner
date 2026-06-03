from __future__ import annotations

from typing import List
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.annotation import (
    AnnotationPointSchema,
    AnnotationPointCreateSchema,
)


class TrackMetaSchema(BaseModel):
    length_seconds: float
    bpm: float
    signature: List[float]
    preference: float = 1.0
    min_speed: float = 0.98
    max_speed: float = 1.20

    model_config = ConfigDict(from_attributes=True)


class TrackMetaCreateSchema(BaseModel):
    length_seconds: float
    bpm: float
    signature: List[float]
    preference: float = 1.0
    min_speed: float = 0.98
    max_speed: float = 1.20

    model_config = ConfigDict(from_attributes=True)


class TrackRecordSchema(BaseModel):
    track_id: str
    audio_path: str
    meta: TrackMetaSchema
    annotations: List[AnnotationPointSchema] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class TrackListItemSchema(BaseModel):
    track_id: str
    display_name: str = ""
    audio_path: str

    model_config = ConfigDict(from_attributes=True)
