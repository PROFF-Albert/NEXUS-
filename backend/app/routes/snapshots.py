"""Snapshot routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas.snapshots import SnapshotCreate
from ..services import snapshots as svc

router = APIRouter(prefix="/api/projects/{project_id}/snapshots", tags=["snapshots"])


@router.get("")
def list_snapshots(project_id: int, user: User = Depends(get_current_user),
                   db: OrmSession = Depends(get_db)):
    return svc.list_snapshots(db, user, project_id)


@router.post("", status_code=201)
def create_snapshot(project_id: int, payload: SnapshotCreate, user: User = Depends(get_current_user),
                    db: OrmSession = Depends(get_db)):
    return svc.create_snapshot(db, user, project_id, payload.model_dump())


@router.post("/{snapshot_id}/restore")
def restore_snapshot(project_id: int, snapshot_id: int, user: User = Depends(get_current_user),
                     db: OrmSession = Depends(get_db)):
    return svc.restore_snapshot(db, user, project_id, snapshot_id)


@router.delete("/{snapshot_id}")
def delete_snapshot(project_id: int, snapshot_id: int, user: User = Depends(get_current_user),
                    db: OrmSession = Depends(get_db)):
    return svc.delete_snapshot(db, user, project_id, snapshot_id)

