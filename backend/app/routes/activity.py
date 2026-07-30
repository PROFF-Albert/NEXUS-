"""Activity log routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import get_current_user, iso
from ..models import ActivityLog, Project, User

router = APIRouter(prefix="/api", tags=["activity"])


@router.get("/activity")
def activity_feed(limit: int = 60, project_id: int | None = None,
                  user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    q = db.query(ActivityLog).filter(ActivityLog.user_id == user.id)
    if project_id is not None:
        q = q.filter(ActivityLog.project_id == project_id)
    names = {p.id: p.name for p in db.query(Project).filter(Project.user_id == user.id).all()}
    rows = q.order_by(ActivityLog.created_at.desc()).limit(limit).all()
    return [{
        "id": row.id,
        "action": row.action,
        "target": row.target,
        "detail": row.detail,
        "icon": row.icon,
        "projectId": row.project_id,
        "projectName": names.get(row.project_id, ""),
        "createdAt": iso(row.created_at),
    } for row in rows]

