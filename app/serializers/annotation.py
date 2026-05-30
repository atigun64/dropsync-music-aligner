from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class AnnotationPointSerializer(BaseModel):
    label: str
    time_seconds: float
    strength: float = 1.0

    model_config = ConfigDict(from_attributes=True)


class AnnotationPointCreateSerializer(BaseModel):
    label: str
    time_seconds: float
    strength: float = 1.0

    model_config = ConfigDict(from_attributes=True)
