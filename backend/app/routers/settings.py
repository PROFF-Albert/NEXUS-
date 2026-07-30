"""PRD §30 Settings, §33 Backup System (workspace export / import)."""
from __future__ import annotations

import io
import json
import zipfile
from typing import Optional

from fastapi import APIRouter, Depends, File as UploadFileParam, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session as OrmSession

from .. import storage
from ..database import get_db
from ..deps import get_current_user, iso, log_activity, notify
from ..models import (ApiEntry, DatabaseConnection, Deployment, File, FileRevision, Folder,
                      Note, Project, Secret, Setting, Snapshot, Task, User, utcnow)

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULTS = {
    "appearance": {"theme": "dark", "accent": "#6366f1", "fontSize": 14,
                   "density": "comfortable", "glass": True, "animations": True},
    "editor": {"autosave": True, "autosaveDelayMs": 1200, "minimap": True,
               "lineNumbers": True, "wordWrap": False, "tabSize": 2},
    "backup": {"auto": True, "frequency": "daily", "keepLast": 10,
               "storageLocation": "local"},
    "notifications": {"snapshot": True, "storage": True, "tasks": True,
                      "deployments": True, "sound": False},
    "security": {"autoLogoutMinutes": 720, "vaultLockMinutes": 15, "clipboardClearSeconds": 30},
    "general": {"language": "en", "startPage": "dashboard", "confirmDeletes": True},
}


@router.get("")
def get_settings(user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    rows = {s.key: s.value for s in db.query(Setting).filter(Setting.user_id == user.id).all()}
    return {k: {**v, **(rows.get(k) or {})} for k, v in DEFAULTS.items()}


class SettingIn(BaseModel):
    key: str
    value: dict


@router.put("")
def put_setting(payload: SettingIn, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    row = (db.query(Setting).filter(Setting.user_id == user.id,
                                    Setting.key == payload.key).first())
    if row:
        row.value = {**(row.value or {}), **payload.value}
    else:
        db.add(Setting(user_id=user.id, key=payload.key, value=payload.value))
    db.commit()
    return get_settings(user, db)


@router.get("/shortcuts")
def shortcuts():
    """PRD §40 — keyboard-driven."""
    return [
        {"keys": "⌘ K", "action": "Open command palette / global search"},
        {"keys": "⌘ N", "action": "New project"},
        {"keys": "⌘ S", "action": "Save file in editor"},
        {"keys": "⌘ B", "action": "Toggle sidebar"},
        {"keys": "⌘ ⇧ S", "action": "Take snapshot of current project"},
        {"keys": "⌘ ⇧ V", "action": "Jump to Vault"},
        {"keys": "⌘ /", "action": "Toggle AI assistant"},
        {"keys": "G then D", "action": "Go to Dashboard"},
        {"keys": "G then P", "action": "Go to Projects"},
        {"keys": "G then T", "action": "Go to Tasks"},
        {"keys": "Esc", "action": "Close modal / dismiss overlay"},
    ]


@router.get("/export")
def export_workspace(user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    """PRD §33 — Export Entire Workspace as a portable .nexusworkspace archive."""
    pids = [p.id for p in db.query(Project).filter(Project.user_id == user.id).all()]
    files = db.query(File).filter(File.project_id.in_(pids)).all()
    manifest = {
        "nexusVersion": "1.0", "exportedAt": iso(utcnow()),
        "user": {"email": user.email, "name": user.name},
        "projects": [{"id": p.id, "name": p.name, "description": p.description,
                      "category": p.category, "framework": p.framework, "language": p.language,
                      "status": p.status, "color": p.color, "icon": p.icon, "tags": p.tags,
                      "favorite": p.favorite, "pinned": p.pinned, "archived": p.archived,
                      "collection": p.collection, "createdAt": iso(p.created_at)}
                     for p in db.query(Project).filter(Project.user_id == user.id).all()],
        "folders": [{"id": d.id, "projectId": d.project_id, "parentId": d.parent_id,
                     "name": d.name, "path": d.path, "color": d.color}
                    for d in db.query(Folder).filter(Folder.project_id.in_(pids)).all()],
        "files": [{"id": f.id, "projectId": f.project_id, "folderId": f.folder_id, "name": f.name,
                   "path": f.path, "sha256": f.sha256, "size": f.size, "mime": f.mime,
                   "kind": f.kind, "deleted": f.deleted} for f in files],
        "notes": [{"projectId": n.project_id, "title": n.title, "body": n.body,
                   "category": n.category, "docType": n.doc_type, "pinned": n.pinned,
                   "checklist": n.checklist} for n in db.query(Note)
                  .filter(Note.user_id == user.id).all()],
        "tasks": [{"projectId": t.project_id, "name": t.name, "detail": t.detail,
                   "status": t.status, "priority": t.priority, "progress": t.progress,
                   "labels": t.labels, "deadline": iso(t.deadline)}
                  for t in db.query(Task).filter(Task.project_id.in_(pids)).all()],
        "apis": [{"projectId": a.project_id, "collection": a.collection, "name": a.name,
                  "kind": a.kind, "method": a.method, "url": a.url, "headers": a.headers,
                  "body": a.body, "auth": a.auth, "variables": a.variables}
                 for a in db.query(ApiEntry).filter(ApiEntry.project_id.in_(pids)).all()],
        "databases": [{"projectId": d.project_id, "name": d.name, "provider": d.provider,
                       "host": d.host, "port": d.port, "username": d.username,
                       "database": d.database, "schema": d.schema_json}
                      for d in db.query(DatabaseConnection)
                      .filter(DatabaseConnection.project_id.in_(pids)).all()],
        "deployments": [{"projectId": d.project_id, "environment": d.environment,
                         "provider": d.provider, "url": d.url, "status": d.status}
                        for d in db.query(Deployment).filter(Deployment.project_id.in_(pids)).all()],
        # ciphertext only — the master password is never exported
        "secrets": [{"projectId": s.project_id, "name": s.name, "kind": s.kind,
                     "environment": s.environment, "ciphertext": s.ciphertext, "hint": s.hint,
                     "note": s.note} for s in db.query(Secret)
                    .filter(Secret.user_id == user.id).all()],
        "vaultSalt": user.vault_salt, "vaultCanary": user.vault_canary,
        "settings": {s.key: s.value for s in db.query(Setting)
                     .filter(Setting.user_id == user.id).all()},
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("workspace.json", json.dumps(manifest, indent=2))
        seen = set()
        for f in files:
            if f.sha256 in seen:
                continue
            seen.add(f.sha256)
            blob = storage.get_path(f.sha256)
            if blob.exists():
                z.write(blob, f"blobs/{f.sha256}")
    buf.seek(0)
    log_activity(db, user.id, "workspace.exported", user.email, icon="download")
    db.commit()
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition":
                                      'attachment; filename="nexus-workspace.nexusworkspace.zip"'})


@router.post("/import")
async def import_workspace(file: UploadFile = UploadFileParam(...),
                           user: User = Depends(get_current_user),
                           db: OrmSession = Depends(get_db)):
    """PRD §33 — Import Workspace. Merges projects (never destructive)."""
    raw = await file.read()
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        manifest = json.loads(z.read("workspace.json"))
        for entry in z.namelist():
            if entry.startswith("blobs/"):
                sha = entry.split("/", 1)[1]
                if not storage.exists(sha):
                    storage.put_bytes(z.read(entry))

    pmap: dict[int, int] = {}
    for spec in manifest.get("projects", []):
        p = Project(user_id=user.id, name=f"{spec['name']}", description=spec.get("description", ""),
                    category=spec.get("category", "Application"), framework=spec.get("framework", ""),
                    language=spec.get("language", ""), status=spec.get("status", "Planning"),
                    color=spec.get("color", "#6366f1"), icon=spec.get("icon", "rocket"),
                    tags=spec.get("tags", []), collection=spec.get("collection", ""),
                    favorite=spec.get("favorite", False), archived=spec.get("archived", False))
        db.add(p)
        db.flush()
        pmap[spec["id"]] = p.id

    fmap: dict[int, int] = {}
    for spec in sorted(manifest.get("folders", []), key=lambda d: (d.get("path") or "").count("/")):
        if spec["projectId"] not in pmap:
            continue
        row = Folder(project_id=pmap[spec["projectId"]],
                     parent_id=fmap.get(spec.get("parentId")) if spec.get("parentId") else None,
                     name=spec["name"], path=spec.get("path", "/"), color=spec.get("color", ""))
        db.add(row)
        db.flush()
        fmap[spec["id"]] = row.id

    imported_files = 0
    for spec in manifest.get("files", []):
        if spec["projectId"] not in pmap or spec.get("deleted"):
            continue
        ext, kind, mime = storage.classify(spec["name"])
        row = File(project_id=pmap[spec["projectId"]],
                   folder_id=fmap.get(spec.get("folderId")) if spec.get("folderId") else None,
                   name=spec["name"], path=spec.get("path", "/"), extension=ext,
                   kind=spec.get("kind", kind), mime=spec.get("mime", mime),
                   size=spec.get("size", 0), sha256=spec["sha256"], blob_key=spec["sha256"])
        db.add(row)
        db.flush()
        db.add(FileRevision(file_id=row.id, version=1, blob_key=row.sha256, size=row.size,
                            sha256=row.sha256, note="imported"))
        imported_files += 1

    for spec in manifest.get("notes", []):
        db.add(Note(user_id=user.id, project_id=pmap.get(spec.get("projectId")),
                    title=spec["title"], body=spec.get("body", ""),
                    category=spec.get("category", "General"),
                    doc_type=spec.get("docType", "note"), pinned=spec.get("pinned", False),
                    checklist=spec.get("checklist", [])))
    for spec in manifest.get("tasks", []):
        if spec.get("projectId") in pmap:
            db.add(Task(project_id=pmap[spec["projectId"]], name=spec["name"],
                        detail=spec.get("detail", ""), status=spec.get("status", "Todo"),
                        priority=spec.get("priority", "Medium"), progress=spec.get("progress", 0),
                        labels=spec.get("labels", [])))
    for spec in manifest.get("apis", []):
        if spec.get("projectId") in pmap:
            db.add(ApiEntry(project_id=pmap[spec["projectId"]], collection=spec.get("collection", "Default"),
                            name=spec["name"], kind=spec.get("kind", "REST"),
                            method=spec.get("method", "GET"), url=spec.get("url", ""),
                            headers=spec.get("headers", {}), body=spec.get("body", ""),
                            auth=spec.get("auth", {}), variables=spec.get("variables", {})))
    for spec in manifest.get("databases", []):
        if spec.get("projectId") in pmap:
            db.add(DatabaseConnection(project_id=pmap[spec["projectId"]], name=spec["name"],
                                      provider=spec.get("provider", "PostgreSQL"),
                                      host=spec.get("host", ""), port=spec.get("port", 5432),
                                      username=spec.get("username", ""),
                                      database=spec.get("database", ""),
                                      schema_json=spec.get("schema", [])))
    # secrets are only importable when the archive shares this user's vault salt
    secrets_imported = 0
    if manifest.get("vaultSalt") == user.vault_salt:
        for spec in manifest.get("secrets", []):
            db.add(Secret(user_id=user.id, project_id=pmap.get(spec.get("projectId")),
                          name=spec["name"], kind=spec.get("kind", "API Key"),
                          environment=spec.get("environment", "development"),
                          ciphertext=spec["ciphertext"], hint=spec.get("hint", ""),
                          note=spec.get("note", "")))
            secrets_imported += 1

    log_activity(db, user.id, "workspace.imported", file.filename or "archive",
                 detail=f"{len(pmap)} projects · {imported_files} files", icon="upload")
    notify(db, user.id, "Workspace imported",
           f"{len(pmap)} projects and {imported_files} files merged into your workspace",
           level="success", icon="upload")
    db.commit()
    return {"projects": len(pmap), "files": imported_files, "secrets": secrets_imported,
            "secretsSkipped": len(manifest.get("secrets", [])) - secrets_imported}


@router.post("/auto-backup/run")
def run_auto_backup(user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    """Manually trigger the scheduled-backup routine for every active project."""
    from .snapshots import SnapshotIn, create_snapshot
    made = []
    for p in db.query(Project).filter(Project.user_id == user.id,
                                      Project.archived == False).all():          # noqa: E712
        res = create_snapshot(p.id, SnapshotIn(name=f"auto-{utcnow():%Y%m%d-%H%M}",
                                               description="Scheduled automatic backup",
                                               kind="daily"), user, db)
        made.append({"project": p.name, **res})
    notify(db, user.id, "Backup successful", f"{len(made)} project(s) backed up",
           level="success", icon="shield-check")
    db.commit()
    return {"snapshots": made}
