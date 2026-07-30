"""Project domain service."""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session as OrmSession

from ..core.exceptions import NotFoundError, ValidationError
from ..models import ActivityLog, Folder, Note, Project, Snapshot, Task, User
from .activity import record
from .workspaces import ensure_workspace, workspace_dto


def _project_or_404(db: OrmSession, project_id: int, user: User) -> Project:
    project = db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise NotFoundError("Project not found")
    return project


def project_dto(project: Project) -> dict:
    return {
        "id": project.id,
        "workspaceId": project.workspace_id,
        "userId": project.user_id,
        "name": project.name,
        "description": project.description,
        "category": project.category,
        "framework": project.framework,
        "language": project.language,
        "status": project.status,
        "color": project.color,
        "icon": project.icon,
        "thumbnail": project.thumbnail,
        "tags": project.tags or [],
        "favorite": project.favorite,
        "pinned": project.pinned,
        "archived": project.archived,
        "collection": project.collection,
        "createdAt": project.created_at.isoformat() if project.created_at else None,
        "updatedAt": project.updated_at.isoformat() if project.updated_at else None,
    }


def create_project(db: OrmSession, user: User, data: dict) -> dict:
    workspace = ensure_workspace(db, user)
    if not data.get("name"):
        raise ValidationError("Project name is required")
    project = Project(
        user_id=user.id,
        workspace_id=data.get("workspace_id") or workspace.id,
        name=data["name"].strip(),
        description=data.get("description", ""),
        category=data.get("category", "Application"),
        framework=data.get("framework", ""),
        language=data.get("language", ""),
        status=data.get("status", "Planning"),
        color=data.get("color", "#6366f1"),
        icon=data.get("icon", "rocket"),
        tags=data.get("tags", []),
        favorite=bool(data.get("favorite", False)),
        pinned=bool(data.get("pinned", False)),
        archived=bool(data.get("archived", False)),
        collection=data.get("collection", ""),
    )
    db.add(project)
    db.flush()
    record(db, user_id=user.id, action="project.created", target=project.name,
           project_id=project.id, icon="plus-square")
    db.commit()
    db.refresh(project)
    return project_dto(project)


def list_projects(db: OrmSession, user: User, include_archived: bool = True) -> list[dict]:
    q = db.query(Project).filter(Project.user_id == user.id)
    if not include_archived:
        q = q.filter(Project.archived == False)  # noqa: E712
    rows = q.order_by(Project.pinned.desc(), Project.favorite.desc(),
                      Project.updated_at.desc()).all()
    return [project_dto(p) for p in rows]


def update_project(db: OrmSession, user: User, project_id: int, data: dict) -> dict:
    project = _project_or_404(db, project_id, user)
    for key in ("name", "description", "category", "framework", "language", "color",
                "icon", "collection", "status"):
        if key in data and data[key] is not None:
            setattr(project, key, data[key])
    for key in ("favorite", "pinned", "archived"):
        if key in data and data[key] is not None:
            setattr(project, key, bool(data[key]))
    if "tags" in data and data["tags"] is not None:
        project.tags = data["tags"]
    if "workspace_id" in data and data["workspace_id"] is not None:
        project.workspace_id = data["workspace_id"]
    db.commit()
    return project_dto(project)


def delete_project(db: OrmSession, user: User, project_id: int) -> dict:
    project = _project_or_404(db, project_id, user)
    name = project.name
    db.delete(project)
    record(db, user_id=user.id, action="project.deleted", target=name, project_id=project_id,
           icon="trash-2")
    db.commit()
    return {"ok": True}


def set_flag(db: OrmSession, user: User, project_id: int, field: str, value: bool) -> dict:
    project = _project_or_404(db, project_id, user)
    if field not in {"favorite", "pinned", "archived"}:
        raise ValidationError("Unsupported project flag")
    setattr(project, field, bool(value))
    db.commit()
    return project_dto(project)


def stats(db: OrmSession, user: User, project_id: int) -> dict:
    project = _project_or_404(db, project_id, user)
    folder_count = db.query(func.count(Folder.id)).filter(Folder.project_id == project.id,
                                                          Folder.deleted == False).scalar() or 0  # noqa: E712
    note_count = db.query(func.count(Note.id)).filter(Note.project_id == project.id).scalar() or 0
    task_count = db.query(func.count(Task.id)).filter(Task.project_id == project.id).scalar() or 0
    snapshot_count = db.query(func.count(Snapshot.id)).filter(Snapshot.project_id == project.id).scalar() or 0
    return {
        "project": project_dto(project),
        "workspace": workspace_dto(ensure_workspace(db, user)),
        "stats": {
            "folderCount": folder_count,
            "noteCount": note_count,
            "taskCount": task_count,
            "snapshotCount": snapshot_count,
        },
    }

