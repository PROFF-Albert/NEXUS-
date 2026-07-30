"""Workspace routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..services.workspaces import ensure_workspace, workspace_dto

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


@router.get("")
def get_workspace(user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    return workspace_dto(ensure_workspace(db, user))

