"""Workspace service."""
from __future__ import annotations

from sqlalchemy.orm import Session as OrmSession

from ..models import User, Workspace


def ensure_workspace(db: OrmSession, user: User) -> Workspace:
    workspace = db.query(Workspace).filter(Workspace.user_id == user.id).first()
    if workspace:
        return workspace
    workspace = Workspace(user_id=user.id, name=f"{user.name}'s Workspace",
                          description="Primary NEXUS workspace")
    db.add(workspace)
    db.flush()
    return workspace


def workspace_dto(workspace: Workspace) -> dict:
    return {
        "id": workspace.id,
        "name": workspace.name,
        "description": workspace.description,
        "color": workspace.color,
        "icon": workspace.icon,
        "createdAt": workspace.created_at.isoformat() if workspace.created_at else None,
    }

