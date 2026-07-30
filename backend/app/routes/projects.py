"""Project routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas.projects import ProjectCreate, ProjectUpdate
from ..services import projects as svc

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("")
def create_project(payload: ProjectCreate, user: User = Depends(get_current_user),
                   db: OrmSession = Depends(get_db)):
    return svc.create_project(db, user, payload.model_dump())


@router.get("")
def list_projects(user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    return svc.list_projects(db, user)


@router.get("/{project_id}")
def get_project(project_id: int, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    return svc.stats(db, user, project_id)


@router.patch("/{project_id}")
def patch_project(project_id: int, payload: ProjectUpdate, user: User = Depends(get_current_user),
                  db: OrmSession = Depends(get_db)):
    return svc.update_project(db, user, project_id, payload.model_dump(exclude_unset=True))


@router.delete("/{project_id}")
def delete_project(project_id: int, user: User = Depends(get_current_user),
                   db: OrmSession = Depends(get_db)):
    return svc.delete_project(db, user, project_id)


@router.post("/{project_id}/archive")
def archive_project(project_id: int, user: User = Depends(get_current_user),
                    db: OrmSession = Depends(get_db)):
    return svc.set_flag(db, user, project_id, "archived", True)


@router.post("/{project_id}/favorite")
def favorite_project(project_id: int, user: User = Depends(get_current_user),
                     db: OrmSession = Depends(get_db)):
    return svc.set_flag(db, user, project_id, "favorite", True)


@router.post("/{project_id}/pin")
def pin_project(project_id: int, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    return svc.set_flag(db, user, project_id, "pinned", True)


@router.get("/{project_id}/stats")
def project_stats(project_id: int, user: User = Depends(get_current_user),
                  db: OrmSession = Depends(get_db)):
    return svc.stats(db, user, project_id)

