"""Folder service with nested path management."""
from __future__ import annotations

from sqlalchemy.orm import Session as OrmSession

from ..core.exceptions import NotFoundError, ValidationError
from ..models import Folder, Project, User
from .activity import record


def folder_dto(folder: Folder) -> dict:
    return {
        "id": folder.id,
        "projectId": folder.project_id,
        "parentId": folder.parent_id,
        "name": folder.name,
        "path": folder.path,
        "color": folder.color,
        "favorite": folder.favorite,
        "deleted": folder.deleted,
        "createdAt": folder.created_at.isoformat() if folder.created_at else None,
        "updatedAt": folder.updated_at.isoformat() if folder.updated_at else None,
    }


def _project_or_404(db: OrmSession, project_id: int, user: User) -> Project:
    project = db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise NotFoundError("Project not found")
    return project


def _folder_or_404(db: OrmSession, project_id: int, folder_id: int) -> Folder:
    folder = db.get(Folder, folder_id)
    if not folder or folder.project_id != project_id or folder.deleted:
        raise NotFoundError("Folder not found")
    return folder


def build_path(db: OrmSession, folder_id: int | None) -> str:
    if not folder_id:
        return "/"
    parts: list[str] = []
    guard = 0
    current = db.get(Folder, folder_id)
    while current and guard < 128:
        parts.append(current.name)
        current = db.get(Folder, current.parent_id) if current.parent_id else None
        guard += 1
    return "/" + "/".join(reversed(parts)) + "/"


def create_folder(db: OrmSession, user: User, project_id: int, data: dict) -> dict:
    _project_or_404(db, project_id, user)
    name = (data.get("name") or "").strip().strip("/") or "New Folder"
    folder = Folder(project_id=project_id, parent_id=data.get("parent_id"),
                    name=name, color=data.get("color", ""))
    db.add(folder)
    db.flush()
    folder.path = build_path(db, folder.id)
    record(db, user_id=user.id, action="folder.created", target=folder.path,
           project_id=project_id, icon="folder-plus")
    db.commit()
    return folder_dto(folder)


def list_folders(db: OrmSession, user: User, project_id: int) -> list[dict]:
    _project_or_404(db, project_id, user)
    rows = (db.query(Folder)
            .filter(Folder.project_id == project_id, Folder.deleted == False)  # noqa: E712
            .order_by(Folder.path, Folder.name).all())
    return [folder_dto(f) for f in rows]


def update_folder(db: OrmSession, user: User, project_id: int, folder_id: int,
                  data: dict) -> dict:
    _project_or_404(db, project_id, user)
    folder = _folder_or_404(db, project_id, folder_id)
    if "name" in data and data["name"] is not None:
        folder.name = (data["name"] or "").strip().strip("/") or folder.name
    if "parent_id" in data:
        folder.parent_id = data["parent_id"]
    if "color" in data and data["color"] is not None:
        folder.color = data["color"]
    if "favorite" in data and data["favorite"] is not None:
        folder.favorite = bool(data["favorite"])
    db.flush()
    _reindex_paths(db, project_id)
    db.commit()
    return folder_dto(folder)


def move_folder(db: OrmSession, user: User, project_id: int, folder_id: int,
                parent_id: int | None) -> dict:
    return update_folder(db, user, project_id, folder_id, {"parent_id": parent_id})


def rename_folder(db: OrmSession, user: User, project_id: int, folder_id: int,
                  name: str) -> dict:
    return update_folder(db, user, project_id, folder_id, {"name": name})


def delete_folder(db: OrmSession, user: User, project_id: int, folder_id: int) -> dict:
    _project_or_404(db, project_id, user)
    folder = _folder_or_404(db, project_id, folder_id)
    victims = [folder.id]
    stack = [folder.id]
    while stack:
        current = stack.pop()
        children = db.query(Folder).filter(Folder.parent_id == current).all()
        for child in children:
            victims.append(child.id)
            stack.append(child.id)
    for victim in db.query(Folder).filter(Folder.id.in_(victims)).all():
        victim.deleted = True
    record(db, user_id=user.id, action="folder.deleted", target=folder.path,
           project_id=project_id, icon="trash-2")
    db.commit()
    return {"ok": True}


def _reindex_paths(db: OrmSession, project_id: int) -> None:
    rows = db.query(Folder).filter(Folder.project_id == project_id).all()
    for folder in rows:
        folder.path = build_path(db, folder.id)

