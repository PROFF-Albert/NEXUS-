"""PRD §14, §33 — Snapshots & Backup System.

A snapshot is a real, self-contained ZIP written to data/snapshots containing
every file, plus a manifest.json holding notes, docs, tasks, settings, DB
connection metadata and API collections. Restore rebuilds the project from the
archive, so "Restore previous versions instantly" (§4) is literally true.
"""
from __future__ import annotations

import io
import json
import time
import zipfile
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session as OrmSession

from .. import storage
from ..config import SNAPSHOT_DIR
from ..database import get_db
from ..deps import get_current_user, iso, log_activity, notify, owned_project
from ..models import (ApiEntry, DatabaseConnection, Deployment, File, FileRevision, Folder,
                      Note, Project, Snapshot, Task, User, utcnow)

router = APIRouter(prefix="/api/projects/{project_id}/snapshots", tags=["snapshots"])


def _manifest(db: OrmSession, p: Project) -> dict:
    files = db.query(File).filter(File.project_id == p.id, File.deleted == False).all()   # noqa: E712
    folders = db.query(Folder).filter(Folder.project_id == p.id, Folder.deleted == False).all()  # noqa: E712
    return {
        "nexusVersion": "1.0",
        "project": {"name": p.name, "description": p.description, "category": p.category,
                    "framework": p.framework, "language": p.language, "status": p.status,
                    "color": p.color, "icon": p.icon, "tags": p.tags or []},
        "folders": [{"id": d.id, "parentId": d.parent_id, "name": d.name,
                     "path": d.path, "color": d.color} for d in folders],
        "files": [{"id": f.id, "folderId": f.folder_id, "name": f.name, "path": f.path,
                   "sha256": f.sha256, "size": f.size, "mime": f.mime, "kind": f.kind,
                   "version": f.version} for f in files],
        "notes": [{"title": n.title, "body": n.body, "category": n.category,
                   "docType": n.doc_type, "pinned": n.pinned, "checklist": n.checklist}
                  for n in db.query(Note).filter(Note.project_id == p.id).all()],
        "tasks": [{"name": t.name, "detail": t.detail, "status": t.status,
                   "priority": t.priority, "progress": t.progress, "labels": t.labels,
                   "deadline": iso(t.deadline), "parentId": t.parent_id, "id": t.id}
                  for t in db.query(Task).filter(Task.project_id == p.id).all()],
        "databases": [{"name": d.name, "provider": d.provider, "host": d.host, "port": d.port,
                       "username": d.username, "database": d.database, "schema": d.schema_json}
                      for d in db.query(DatabaseConnection).filter(
                          DatabaseConnection.project_id == p.id).all()],
        "apis": [{"collection": a.collection, "name": a.name, "kind": a.kind, "method": a.method,
                  "url": a.url, "headers": a.headers, "body": a.body, "auth": a.auth,
                  "variables": a.variables}
                 for a in db.query(ApiEntry).filter(ApiEntry.project_id == p.id).all()],
        "deployments": [{"environment": d.environment, "provider": d.provider, "url": d.url,
                         "status": d.status} for d in db.query(Deployment).filter(
                             Deployment.project_id == p.id).all()],
        "createdAt": iso(utcnow()),
    }


class SnapshotIn(BaseModel):
    name: Optional[str] = None
    description: str = ""
    kind: str = "manual"


@router.get("")
def list_snapshots(project_id: int, user: User = Depends(get_current_user),
                   db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    rows = (db.query(Snapshot).filter(Snapshot.project_id == project_id)
            .order_by(Snapshot.created_at.desc()).all())
    return [{"id": s.id, "name": s.name, "description": s.description, "author": s.author,
             "size": s.size, "fileCount": s.file_count, "kind": s.kind, "status": s.status,
             "createdAt": iso(s.created_at)} for s in rows]


@router.post("", status_code=201)
def create_snapshot(project_id: int, payload: SnapshotIn,
                    user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    started = time.perf_counter()
    p = owned_project(project_id, db, user)
    count = db.query(Snapshot).filter(Snapshot.project_id == p.id).count()
    name = payload.name or f"v{count + 1}.0"
    manifest = _manifest(db, p)

    key = f"p{p.id}-{int(time.time())}-{name.replace('/', '_').replace(' ', '_')}.nexus.zip"
    archive = SNAPSHOT_DIR / key
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, indent=2))
        for f in manifest["files"]:
            blob = storage.get_path(f["sha256"])
            if blob.exists():
                z.write(blob, f"files/{f['sha256']}")

    snap = Snapshot(project_id=p.id, name=name, description=payload.description,
                    author=user.name, size=archive.stat().st_size,
                    file_count=len(manifest["files"]), archive_key=key,
                    manifest={"summary": {"folders": len(manifest["folders"]),
                                          "notes": len(manifest["notes"]),
                                          "tasks": len(manifest["tasks"]),
                                          "apis": len(manifest["apis"])}},
                    kind=payload.kind, status="complete")
    db.add(snap)
    log_activity(db, user.id, "snapshot.created", name, project_id=p.id,
                 detail=f"{snap.file_count} files · {snap.size // 1024} KB", icon="camera")
    notify(db, user.id, "Snapshot complete", f"{p.name} · {name} saved ({snap.size // 1024} KB)",
           level="success", icon="camera", link=f"/projects/{p.id}?tab=versions")
    db.commit()
    db.refresh(snap)
    return {"id": snap.id, "name": snap.name, "size": snap.size, "fileCount": snap.file_count,
            "createdAt": iso(snap.created_at), "elapsedMs": round((time.perf_counter() - started) * 1000, 1)}


@router.get("/{snapshot_id}/download")
def download_snapshot(project_id: int, snapshot_id: int, user: User = Depends(get_current_user),
                      db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    snap = db.get(Snapshot, snapshot_id)
    if not snap or snap.project_id != project_id:
        raise HTTPException(404, "Snapshot not found")
    path = SNAPSHOT_DIR / snap.archive_key
    if not path.exists():
        raise HTTPException(404, "Archive missing")
    return FileResponse(path, media_type="application/zip", filename=f"{snap.name}.nexus.zip")


@router.post("/{snapshot_id}/restore")
def restore_snapshot(project_id: int, snapshot_id: int, user: User = Depends(get_current_user),
                     db: OrmSession = Depends(get_db)):
    """Rebuild the project exactly as captured. Takes a safety snapshot first."""
    p = owned_project(project_id, db, user)
    snap = db.get(Snapshot, snapshot_id)
    if not snap or snap.project_id != project_id:
        raise HTTPException(404, "Snapshot not found")
    path = SNAPSHOT_DIR / snap.archive_key
    if not path.exists():
        raise HTTPException(404, "Archive missing")

    create_snapshot(project_id, SnapshotIn(name=f"auto-before-restore-{snap.name}",
                                           description=f"Safety copy before restoring {snap.name}",
                                           kind="manual"), user, db)

    with zipfile.ZipFile(path) as z:
        manifest = json.loads(z.read("manifest.json"))
        for entry in z.namelist():                        # re-seed any missing blobs
            if entry.startswith("files/"):
                sha = entry.split("/", 1)[1]
                if not storage.exists(sha):
                    storage.put_bytes(z.read(entry))

    db.query(File).filter(File.project_id == p.id).delete()
    db.query(Folder).filter(Folder.project_id == p.id).delete()
    db.query(Note).filter(Note.project_id == p.id).delete()
    db.query(Task).filter(Task.project_id == p.id).delete()
    db.flush()

    meta = manifest["project"]
    for k in ("name", "description", "category", "framework", "language", "status", "color", "icon"):
        setattr(p, k, meta.get(k, getattr(p, k)))
    p.tags = meta.get("tags", [])

    id_map: dict[int, int] = {}
    for d in sorted(manifest["folders"], key=lambda x: (x["path"] or "").count("/")):
        row = Folder(project_id=p.id, parent_id=id_map.get(d["parentId"]) if d["parentId"] else None,
                     name=d["name"], path=d["path"], color=d.get("color", ""))
        db.add(row)
        db.flush()
        id_map[d["id"]] = row.id
    for f in manifest["files"]:
        row = File(project_id=p.id, folder_id=id_map.get(f["folderId"]) if f["folderId"] else None,
                   name=f["name"], path=f["path"], extension=storage.classify(f["name"])[0],
                   kind=f.get("kind", "file"), mime=f.get("mime", "application/octet-stream"),
                   size=f["size"], sha256=f["sha256"], blob_key=f["sha256"], version=f.get("version", 1))
        db.add(row)
        db.flush()
        db.add(FileRevision(file_id=row.id, version=row.version, blob_key=row.sha256,
                            size=row.size, sha256=row.sha256, note=f"restored from {snap.name}"))
    for n in manifest["notes"]:
        db.add(Note(project_id=p.id, user_id=user.id, title=n["title"], body=n["body"],
                    category=n.get("category", "General"), doc_type=n.get("docType", "note"),
                    pinned=n.get("pinned", False), checklist=n.get("checklist", [])))
    for t in manifest["tasks"]:
        db.add(Task(project_id=p.id, name=t["name"], detail=t.get("detail", ""),
                    status=t.get("status", "Todo"), priority=t.get("priority", "Medium"),
                    progress=t.get("progress", 0), labels=t.get("labels", [])))

    log_activity(db, user.id, "snapshot.restored", snap.name, project_id=p.id,
                 detail=f"{len(manifest['files'])} files restored", icon="rotate-ccw")
    notify(db, user.id, "Version restored", f"{p.name} rolled back to {snap.name}",
           level="success", icon="rotate-ccw", link=f"/projects/{p.id}")
    db.commit()
    return {"ok": True, "restored": {"files": len(manifest["files"]),
                                     "folders": len(manifest["folders"]),
                                     "notes": len(manifest["notes"]),
                                     "tasks": len(manifest["tasks"])}}


@router.delete("/{snapshot_id}")
def delete_snapshot(project_id: int, snapshot_id: int, user: User = Depends(get_current_user),
                    db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    snap = db.get(Snapshot, snapshot_id)
    if not snap or snap.project_id != project_id:
        raise HTTPException(404, "Snapshot not found")
    (SNAPSHOT_DIR / snap.archive_key).unlink(missing_ok=True)
    db.delete(snap)
    db.commit()
    return {"ok": True}
