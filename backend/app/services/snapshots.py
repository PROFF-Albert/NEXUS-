"""Snapshot service that stores only metadata and blob hashes."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session as OrmSession

from ..core.exceptions import NotFoundError
from ..models import FileBlob, Folder, Note, Project, ProjectFile, Secret, Snapshot, Task, User
from .activity import record
from .files import file_dto
from .folders import folder_dto
from .notes import note_dto
from .projects import project_dto
from .tasks import task_dto


def snapshot_dto(snapshot: Snapshot) -> dict:
    manifest = snapshot.manifest or {}
    return {
        "id": snapshot.id,
        "projectId": snapshot.project_id,
        "name": snapshot.name,
        "description": snapshot.description,
        "author": snapshot.author,
        "size": snapshot.size,
        "fileCount": snapshot.file_count,
        "kind": snapshot.kind,
        "status": snapshot.status,
        "manifest": manifest,
        "createdAt": snapshot.created_at.isoformat() if snapshot.created_at else None,
    }


def _project_or_404(db: OrmSession, user: User, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise NotFoundError("Project not found")
    return project


def create_snapshot(db: OrmSession, user: User, project_id: int, data: dict) -> dict:
    project = _project_or_404(db, user, project_id)
    files = db.query(ProjectFile).filter(ProjectFile.project_id == project.id,
                                         ProjectFile.deleted == False).all()  # noqa: E712
    folders = db.query(Folder).filter(Folder.project_id == project.id,
                                      Folder.deleted == False).all()  # noqa: E712
    notes = db.query(Note).filter(Note.project_id == project.id).all()
    tasks = db.query(Task).filter(Task.project_id == project.id).all()
    secrets = db.query(Secret).filter(Secret.project_id == project.id).all()
    manifest = {
        "project": project_dto(project),
        "folders": [folder_dto(folder) for folder in folders],
        "files": [file_dto(row) for row in files],
        "notes": [note_dto(note) for note in notes],
        "tasks": [task_dto(task) for task in tasks],
        "secrets": [{"id": secret.id, "name": secret.name, "kind": secret.kind,
                     "environment": secret.environment, "hint": secret.hint,
                     "note": secret.note} for secret in secrets],
        "blobHashes": sorted({row.blob.sha256 for row in files if row.blob}),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    snapshot = Snapshot(
        project_id=project.id,
        name=data.get("name") or f"v{db.query(Snapshot).filter(Snapshot.project_id == project.id).count() + 1}.0",
        description=data.get("description", ""),
        author=user.name,
        size=len(json.dumps(manifest).encode("utf-8")),
        file_count=len(files),
        archive_key="",
        manifest=manifest,
        kind=data.get("kind", "manual"),
        status="complete",
    )
    db.add(snapshot)
    db.flush()
    record(db, user_id=user.id, action="snapshot.created", target=snapshot.name,
           project_id=project.id, detail=f"{snapshot.file_count} files", icon="camera")
    db.commit()
    return snapshot_dto(snapshot)


def list_snapshots(db: OrmSession, user: User, project_id: int) -> list[dict]:
    _project_or_404(db, user, project_id)
    rows = (db.query(Snapshot).filter(Snapshot.project_id == project_id)
            .order_by(Snapshot.created_at.desc()).all())
    return [snapshot_dto(row) for row in rows]


def delete_snapshot(db: OrmSession, user: User, project_id: int, snapshot_id: int) -> dict:
    _project_or_404(db, user, project_id)
    snapshot = db.get(Snapshot, snapshot_id)
    if not snapshot or snapshot.project_id != project_id:
        raise NotFoundError("Snapshot not found")
    db.delete(snapshot)
    db.commit()
    return {"ok": True}


def restore_snapshot(db: OrmSession, user: User, project_id: int, snapshot_id: int) -> dict:
    project = _project_or_404(db, user, project_id)
    snapshot = db.get(Snapshot, snapshot_id)
    if not snapshot or snapshot.project_id != project.id:
        raise NotFoundError("Snapshot not found")
    manifest = snapshot.manifest or {}
    for blob_hash in manifest.get("blobHashes", []):
        blob = db.query(FileBlob).filter(FileBlob.sha256 == blob_hash).first()
        if not blob:
            raise NotFoundError(f"Missing blob {blob_hash}")
    # clear current project content
    db.query(ProjectFile).filter(ProjectFile.project_id == project.id).delete()
    db.query(Folder).filter(Folder.project_id == project.id).delete()
    db.query(Note).filter(Note.project_id == project.id).delete()
    db.query(Task).filter(Task.project_id == project.id).delete()
    # restore project metadata
    p = manifest.get("project", {})
    for key in ("name", "description", "category", "framework", "language", "status",
                "color", "icon", "collection"):
        if key in p and p[key] is not None:
            setattr(project, key, p[key])
    project.tags = p.get("tags", [])
    # restore folders
    id_map: dict[int, int] = {}
    for folder in sorted(manifest.get("folders", []), key=lambda x: (x.get("path") or "").count("/")):
        row = Folder(project_id=project.id, parent_id=id_map.get(folder.get("parentId")),
                     name=folder["name"], path=folder["path"], color=folder.get("color", ""))
        db.add(row)
        db.flush()
        id_map[folder["id"]] = row.id
    # restore files by linking to existing blobs
    for file_ in manifest.get("files", []):
        blob = db.query(FileBlob).filter(FileBlob.sha256 == file_["sha256"]).first()
        if not blob:
            raise NotFoundError(f"Missing blob {file_['sha256']}")
        row = ProjectFile(project_id=project.id, workspace_id=project.workspace_id,
                          folder_id=id_map.get(file_.get("folderId")),
                          blob_id=blob.id, filename=file_["filename"], path=file_["path"],
                          uploaded_by=user.id, version=file_.get("version", 1),
                          meta=file_.get("meta", {}))
        db.add(row)
    # restore notes/tasks
    for note in manifest.get("notes", []):
        db.add(Note(project_id=project.id, user_id=user.id, title=note["title"],
                    body=note["body"], category=note.get("category", "General"),
                    doc_type=note.get("docType", "note"), pinned=note.get("pinned", False),
                    checklist=note.get("checklist", [])))
    for task in manifest.get("tasks", []):
        db.add(Task(project_id=project.id, name=task["name"], detail=task.get("detail", ""),
                    status=task.get("status", "Todo"), priority=task.get("priority", "Medium"),
                    labels=task.get("labels", []), progress=task.get("progress", 0),
                    deadline=datetime.fromisoformat(task["deadline"]) if task.get("deadline") else None,
                    parent_id=task.get("parentId")))
    db.commit()
    record(db, user_id=user.id, action="snapshot.restored", target=snapshot.name,
           project_id=project.id, detail=f"{len(manifest.get('files', []))} files", icon="rotate-ccw")
    db.commit()
    return {"ok": True}

