import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_session
from app.models import PlotProject
from app.schemas import ProjectCreate, ProjectUpdate, ProjectResponse, PointSchema
from app.pdf_generator import generate_pdf

router = APIRouter(prefix="/api/projects")


def project_to_response(p: PlotProject) -> ProjectResponse:
    vertices = [PointSchema(**pt) for pt in json.loads(p.vertices)]
    polys_raw = json.loads(p.polygons) if p.polygons else []
    polygons = [[PointSchema(**pt) for pt in poly] for poly in polys_raw]
    return ProjectResponse(
        id=p.id,
        cadastral_number=p.cadastral_number,
        address=p.address,
        vertices=vertices,
        polygons=polygons,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.post("", response_model=ProjectResponse)
async def create(body: ProjectCreate, db: AsyncSession = Depends(get_session)):
    project = PlotProject(
        cadastral_number=body.cadastral_number,
        address=body.address,
        vertices=json.dumps([pt.model_dump() for pt in body.vertices]),
        polygons=json.dumps([[pt.model_dump() for pt in poly] for poly in body.polygons]),
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project_to_response(project)


@router.get("", response_model=list[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(PlotProject).order_by(PlotProject.updated_at.desc()))
    return [project_to_response(p) for p in result.scalars()]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: int, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(PlotProject).where(PlotProject.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    return project_to_response(project)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update(project_id: int, body: ProjectUpdate, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(PlotProject).where(PlotProject.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if body.cadastral_number is not None:
        project.cadastral_number = body.cadastral_number
    if body.address is not None:
        project.address = body.address
    if body.vertices is not None:
        project.vertices = json.dumps([pt.model_dump() for pt in body.vertices])
    if body.polygons is not None:
        project.polygons = json.dumps([[pt.model_dump() for pt in poly] for poly in body.polygons])
    await db.commit()
    await db.refresh(project)
    return project_to_response(project)


@router.delete("/{project_id}")
async def delete(project_id: int, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(PlotProject).where(PlotProject.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    await db.delete(project)
    await db.commit()
    return {"ok": True}


@router.get("/{project_id}/pdf")
async def export_pdf(project_id: int, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(PlotProject).where(PlotProject.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    pdf_bytes = generate_pdf(project)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=plot_{project_id}.pdf"},
    )
