"""Activity log service."""
from __future__ import annotations

from sqlalchemy.orm import Session as OrmSession

from ..models import ActivityLog


def record(db: OrmSession, *, user_id: int, action: str, target: str = "",
           project_id: int | None = None, detail: str = "", icon: str = "activity") -> None:
    db.add(ActivityLog(user_id=user_id, project_id=project_id, action=action,
                       target=target, detail=detail, icon=icon))

