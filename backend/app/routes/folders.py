"""Folder routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas.files import FolderCreate, FolderUpdate
from ..services import folders as svc

router = APIRouter(prefix="/api/projects/{project_id}/folders", tags=["folders"])


@router.get("")
def list_folders(project_id: int, user: User = Depends(get_current_user),
                 db: OrmSession = Depends(get_db)):
    return svc.list_folders(db, user, project_id)


@router.post("")
def create_folder(project_id: int, payload: FolderCreate, user: User = Depends(get_current_user),
                  db: OrmSession = Depends(get_db)):
    return svc.create_folder(db, user, project_id, payload.model_dump())


@router.patch("/{folder_id}")
def update_folder(project_id: int, folder_id: int, payload: FolderUpdate,
                  user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    return svc.update_folder(db, user, project_id, folder_id, payload.model_dump(exclude_unset=True))


@router.delete("/{folder_id}")
def delete_folder(project_id: int, folder_id: int, user: User = Depends(get_current_user),
                  db: OrmSession = Depends(get_db)):
    return svc.delete_folder(db, user, project_id, folder_id)

