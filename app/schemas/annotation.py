from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class AnnotationPointSchema(BaseModel):
    label: str
    time_seconds: float
    strength: float = 1.0

    model_config = ConfigDict(from_attributes=True)


class AnnotationPointCreateSchema(BaseModel):
    label: str
    time_seconds: float
    strength: float = 1.0

    model_config = ConfigDict(from_attributes=True)
