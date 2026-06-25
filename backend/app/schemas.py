from datetime import datetime
from pydantic import BaseModel


class PointSchema(BaseModel):
    x: float
    y: float


class ProjectCreate(BaseModel):
    cadastral_number: str = ""
    address: str = ""
    vertices: list[PointSchema] = []
    polygons: list[list[PointSchema]] = []


class ProjectUpdate(BaseModel):
    cadastral_number: str | None = None
    address: str | None = None
    vertices: list[PointSchema] | None = None
    polygons: list[list[PointSchema]] | None = None


class ProjectResponse(BaseModel):
    id: int
    cadastral_number: str
    address: str
    vertices: list[PointSchema]
    polygons: list[list[PointSchema]]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
