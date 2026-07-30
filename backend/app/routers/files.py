"""PRD §12, §13, §19, §20 — File Manager, Code Viewer, Images, Videos."""
from __future__ import annotations

import difflib
import io
import zipfile
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File as UploadFileParam, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session as OrmSession

from .. import storage
from ..config import MAX_UPLOAD_MB
from ..database import get_db
from ..deps import get_current_user, iso, log_activity, owned_project
from ..models import File, FileRevision, Folder, User, utcnow

router = APIRouter(prefix="/api/projects/{project_id}", tags=["files"])


def file_dto(f: File) -> dict:
    return {"id": f.id, "name": f.name, "path": f.path, "folderId": f.folder_id,
            "extension": f.extension, "kind": f.kind, "mime": f.mime, "size": f.size,
            "sha256": f.sha256, "favorite": f.favorite, "deleted": f.deleted,
            "version": f.version, "language": storage.language_for(f.extension),
            "meta": f.meta or {}, "createdAt": iso(f.created_at),
            "updatedAt": iso(f.updated_at), "deletedAt": iso(f.deleted_at)}


def folder_dto(d: Folder) -> dict:
    return {"id": d.id, "name": d.name, "path": d.path, "parentId": d.parent_id,
            "color": d.color, "favorite": d.favorite, "createdAt": iso(d.created_at)}


def _folder_path(db: OrmSession, folder_id: Optional[int]) -> str:
    if not folder_id:
        return "/"
    parts, cur, guard = [], db.get(Folder, folder_id), 0
    while cur and guard < 64:
        parts.append(cur.name)
        cur = db.get(Folder, cur.parent_id) if cur.parent_id else None
        guard += 1
    return "/" + "/".join(reversed(parts)) + "/"


# --------------------------------------------------------------------------- #
# tree
# --------------------------------------------------------------------------- #
@router.get("/tree")
def tree(project_id: int, user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    folders = (db.query(Folder).filter(Folder.project_id == project_id, Folder.deleted == False)  # noqa: E712
               .order_by(Folder.name).all())
    files = (db.query(File).filter(File.project_id == project_id, File.deleted == False)  # noqa: E712
             .order_by(File.name).all())
    return {"folders": [folder_dto(d) for d in folders], "files": [file_dto(f) for f in files]}


class FolderIn(BaseModel):
    name: str
    parent_id: Optional[int] = None
    color: str = ""


@router.post("/folders", status_code=201)
def create_folder(project_id: int, payload: FolderIn, user: User = Depends(get_current_user),
                  db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    name = payload.name.strip().strip("/") or "New Folder"
    d = Folder(project_id=project_id, parent_id=payload.parent_id, name=name, color=payload.color)
    db.add(d)
    db.flush()
    d.path = _folder_path(db, d.id)
    log_activity(db, user.id, "folder.created", d.path, project_id=project_id, icon="folder-plus")
    db.commit()
    return folder_dto(d)


class FolderPatch(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    favorite: Optional[bool] = None
    parent_id: Optional[int] = None


@router.patch("/folders/{folder_id}")
def update_folder(project_id: int, folder_id: int, payload: FolderPatch,
                  user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    d = db.get(Folder, folder_id)
    if not d or d.project_id != project_id:
        raise HTTPException(404, "Folder not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    db.flush()
    _reindex_paths(db, project_id)
    db.commit()
    return folder_dto(d)


def _reindex_paths(db: OrmSession, project_id: int) -> None:
    for d in db.query(Folder).filter(Folder.project_id == project_id).all():
        d.path = _folder_path(db, d.id)
    for f in db.query(File).filter(File.project_id == project_id).all():
        f.path = _folder_path(db, f.folder_id)


@router.delete("/folders/{folder_id}")
def delete_folder(project_id: int, folder_id: int, user: User = Depends(get_current_user),
                  db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    d = db.get(Folder, folder_id)
    if not d or d.project_id != project_id:
        raise HTTPException(404, "Folder not found")
    stack, victims = [folder_id], []
    while stack:
        fid = stack.pop()
        victims.append(fid)
        stack += [c.id for c in db.query(Folder).filter(Folder.parent_id == fid).all()]
    for f in db.query(File).filter(File.folder_id.in_(victims)).all():
        f.deleted, f.deleted_at = True, utcnow()
    for fid in victims:
        if fol := db.get(Folder, fid):
            fol.deleted = True
    log_activity(db, user.id, "folder.deleted", d.path, project_id=project_id, icon="trash-2")
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- #
# upload / create
# --------------------------------------------------------------------------- #
@router.post("/files/upload", status_code=201)
async def upload_files(project_id: int, files: list[UploadFile] = UploadFileParam(...),
                       folder_id: Optional[int] = Form(None), paths: Optional[str] = Form(None),
                       user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    """Multi-file / drag-and-drop upload with folder structure + dedup detection."""
    owned_project(project_id, db, user)
    rel_paths = (paths or "").split("|") if paths else []
    out, deduped = [], 0

    for idx, up in enumerate(files):
        target_folder = folder_id
        rel = rel_paths[idx] if idx < len(rel_paths) else ""
        if rel and "/" in rel:                       # recreate dropped directory tree
            for part in rel.split("/")[:-1]:
                if not part or part == ".":
                    continue
                existing = (db.query(Folder).filter(Folder.project_id == project_id,
                                                    Folder.parent_id == target_folder,
                                                    Folder.name == part,
                                                    Folder.deleted == False).first())  # noqa: E712
                if not existing:
                    existing = Folder(project_id=project_id, parent_id=target_folder, name=part)
                    db.add(existing)
                    db.flush()
                    existing.path = _folder_path(db, existing.id)
                target_folder = existing.id

        sha, size, dedup = storage.put_stream(up.file)
        if size > MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(413, f"{up.filename} exceeds {MAX_UPLOAD_MB} MB limit")
        deduped += 1 if dedup else 0
        ext, kind, mime = storage.classify(up.filename or "file")

        row = (db.query(File).filter(File.project_id == project_id,
                                     File.folder_id == target_folder,
                                     File.name == up.filename,
                                     File.deleted == False).first())          # noqa: E712
        if row:                                       # new revision of same file
            db.add(FileRevision(file_id=row.id, version=row.version, blob_key=row.sha256,
                                size=row.size, sha256=row.sha256, note="replaced by upload"))
            row.sha256, row.size, row.version = sha, size, row.version + 1
            row.blob_key, row.updated_at = sha, utcnow()
        else:
            row = File(project_id=project_id, folder_id=target_folder,
                       name=up.filename or "file", path=_folder_path(db, target_folder),
                       extension=ext, kind=kind, mime=up.content_type or mime,
                       size=size, sha256=sha, blob_key=sha)
            db.add(row)
            db.flush()
            db.add(FileRevision(file_id=row.id, version=1, blob_key=sha, size=size,
                                sha256=sha, note="initial upload"))
        out.append(file_dto(row))

    log_activity(db, user.id, "files.uploaded", f"{len(files)} file(s)", project_id=project_id,
                 detail=f"{deduped} deduplicated" if deduped else "", icon="upload")
    db.commit()
    return {"files": out, "deduplicated": deduped}


class NewFileIn(BaseModel):
    name: str
    folder_id: Optional[int] = None
    content: str = ""


@router.post("/files", status_code=201)
def create_file(project_id: int, payload: NewFileIn, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    ext, kind, mime = storage.classify(payload.name)
    sha, size, _ = storage.put_bytes(payload.content.encode())
    row = File(project_id=project_id, folder_id=payload.folder_id, name=payload.name,
               path=_folder_path(db, payload.folder_id), extension=ext, kind=kind,
               mime=mime, size=size, sha256=sha, blob_key=sha)
    db.add(row)
    db.flush()
    db.add(FileRevision(file_id=row.id, version=1, blob_key=sha, size=size,
                        sha256=sha, note="created"))
    log_activity(db, user.id, "file.created", payload.name, project_id=project_id, icon="file-plus")
    db.commit()
    return file_dto(row)


# --------------------------------------------------------------------------- #
# read / write
# --------------------------------------------------------------------------- #
def _get_file(db: OrmSession, project_id: int, file_id: int) -> File:
    f = db.get(File, file_id)
    if not f or f.project_id != project_id:
        raise HTTPException(404, "File not found")
    return f


@router.get("/files/{file_id}/content")
def file_content(project_id: int, file_id: int, user: User = Depends(get_current_user),
                 db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    f = _get_file(db, project_id, file_id)
    f.opened_at = utcnow()
    db.commit()
    if f.kind not in ("text", "doc") and f.kind != "text":
        if f.kind != "text":
            return {"binary": True, "kind": f.kind, "mime": f.mime, "size": f.size,
                    "url": f"/api/projects/{project_id}/files/{file_id}/raw"}
    raw = storage.get_bytes(f.sha256)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return {"binary": True, "kind": "binary", "mime": f.mime, "size": f.size,
                "url": f"/api/projects/{project_id}/files/{file_id}/raw"}
    return {"binary": False, "content": text, "language": storage.language_for(f.extension),
            "lines": text.count("\n") + 1, "version": f.version, "size": f.size}


class ContentIn(BaseModel):
    content: str
    note: str = "edited"


@router.put("/files/{file_id}/content")
def save_content(project_id: int, file_id: int, payload: ContentIn,
                 user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    f = _get_file(db, project_id, file_id)
    db.add(FileRevision(file_id=f.id, version=f.version, blob_key=f.sha256,
                        size=f.size, sha256=f.sha256, note=payload.note))
    sha, size, _ = storage.put_bytes(payload.content.encode())
    f.sha256, f.blob_key, f.size, f.version, f.updated_at = sha, sha, size, f.version + 1, utcnow()
    log_activity(db, user.id, "file.edited", f.name, project_id=project_id,
                 detail=f"v{f.version}", icon="edit-3")
    db.commit()
    return file_dto(f)


@router.get("/files/{file_id}/raw")
def raw_file(project_id: int, file_id: int, download: bool = False,
             user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    f = _get_file(db, project_id, file_id)
    signed = storage.download_url(f.sha256, filename=f.name, expires_in=3600, download=download)
    if signed:
        return RedirectResponse(signed, status_code=307)
    path = storage.get_path(f.sha256)
    if not path.exists():
        raise HTTPException(404, "Blob missing")
    disposition = "attachment" if download else "inline"
    return FileResponse(path, media_type=f.mime, filename=f.name,
                        headers={"Content-Disposition": f'{disposition}; filename="{f.name}"',
                                 "Accept-Ranges": "bytes"})


@router.get("/files/{file_id}/revisions")
def revisions(project_id: int, file_id: int, user: User = Depends(get_current_user),
              db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    f = _get_file(db, project_id, file_id)
    rows = (db.query(FileRevision).filter(FileRevision.file_id == f.id)
            .order_by(FileRevision.version.desc()).all())
    return [{"id": r.id, "version": r.version, "size": r.size, "note": r.note,
             "createdAt": iso(r.created_at)} for r in rows]


@router.get("/files/{file_id}/diff")
def diff(project_id: int, file_id: int, version: int = Query(...),
         user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    """PRD §13 — Compare Versions."""
    owned_project(project_id, db, user)
    f = _get_file(db, project_id, file_id)
    rev = (db.query(FileRevision).filter(FileRevision.file_id == f.id,
                                         FileRevision.version == version).first())
    if not rev:
        raise HTTPException(404, "Revision not found")
    old = storage.get_bytes(rev.sha256).decode("utf-8", "replace")
    new = storage.get_bytes(f.sha256).decode("utf-8", "replace")
    delta = list(difflib.unified_diff(old.splitlines(), new.splitlines(),
                                      fromfile=f"v{version}", tofile=f"v{f.version}", lineterm=""))
    return {"old": old, "new": new, "diff": delta,
            "added": sum(1 for l in delta if l.startswith("+") and not l.startswith("+++")),
            "removed": sum(1 for l in delta if l.startswith("-") and not l.startswith("---"))}


@router.post("/files/{file_id}/restore/{version}")
def restore_revision(project_id: int, file_id: int, version: int,
                     user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    f = _get_file(db, project_id, file_id)
    rev = (db.query(FileRevision).filter(FileRevision.file_id == f.id,
                                         FileRevision.version == version).first())
    if not rev:
        raise HTTPException(404, "Revision not found")
    db.add(FileRevision(file_id=f.id, version=f.version, blob_key=f.sha256, size=f.size,
                        sha256=f.sha256, note=f"pre-restore of v{version}"))
    f.sha256, f.blob_key, f.size, f.version = rev.sha256, rev.sha256, rev.size, f.version + 1
    log_activity(db, user.id, "file.restored", f.name, project_id=project_id,
                 detail=f"restored v{version}", icon="rotate-ccw")
    db.commit()
    return file_dto(f)


class FilePatch(BaseModel):
    name: Optional[str] = None
    folder_id: Optional[int] = None
    favorite: Optional[bool] = None
    meta: Optional[dict] = None


@router.patch("/files/{file_id}")
def patch_file(project_id: int, file_id: int, payload: FilePatch,
               user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    f = _get_file(db, project_id, file_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        f.name = data["name"]
        f.extension, f.kind, f.mime = storage.classify(f.name)
    if "folder_id" in data:
        f.folder_id = data["folder_id"]
        f.path = _folder_path(db, f.folder_id)
    if "favorite" in data:
        f.favorite = data["favorite"]
    if "meta" in data:
        f.meta = {**(f.meta or {}), **(data["meta"] or {})}
    db.commit()
    return file_dto(f)


@router.post("/files/{file_id}/duplicate", status_code=201)
def duplicate_file(project_id: int, file_id: int, user: User = Depends(get_current_user),
                   db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    f = _get_file(db, project_id, file_id)
    stem, _, ext = f.name.rpartition(".")
    new_name = f"{stem} copy.{ext}" if ext and stem else f"{f.name} copy"
    clone = File(project_id=project_id, folder_id=f.folder_id, name=new_name, path=f.path,
                 extension=f.extension, kind=f.kind, mime=f.mime, size=f.size,
                 sha256=f.sha256, blob_key=f.sha256)
    db.add(clone)
    db.flush()
    db.add(FileRevision(file_id=clone.id, version=1, blob_key=f.sha256, size=f.size,
                        sha256=f.sha256, note="duplicated"))
    db.commit()
    return file_dto(clone)


@router.delete("/files/{file_id}")
def delete_file(project_id: int, file_id: int, permanent: bool = False,
                user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    f = _get_file(db, project_id, file_id)
    if permanent:
        remaining = (db.query(File).filter(File.sha256 == f.sha256, File.id != f.id,
                                           File.deleted == False).count())  # noqa: E712
        db.delete(f)
        if remaining == 0:
            storage.delete_blob(f.sha256)
    else:
        f.deleted, f.deleted_at = True, utcnow()
    log_activity(db, user.id, "file.deleted", f.name, project_id=project_id, icon="trash-2")
    db.commit()
    return {"ok": True}


@router.get("/recycle-bin")
def recycle_bin(project_id: int, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    rows = (db.query(File).filter(File.project_id == project_id, File.deleted == True)  # noqa: E712
            .order_by(File.deleted_at.desc()).all())
    return [file_dto(f) for f in rows]


@router.post("/files/{file_id}/restore")
def restore_file(project_id: int, file_id: int, user: User = Depends(get_current_user),
                 db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    f = _get_file(db, project_id, file_id)
    f.deleted, f.deleted_at = False, None
    log_activity(db, user.id, "file.restored", f.name, project_id=project_id, icon="rotate-ccw")
    db.commit()
    return file_dto(f)


@router.delete("/recycle-bin")
def empty_bin(project_id: int, user: User = Depends(get_current_user),
              db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    rows = (db.query(File).filter(File.project_id == project_id, File.deleted == True)  # noqa: E712
            .all())
    n = 0
    for f in rows:
        remaining = db.query(File).filter(File.sha256 == f.sha256, File.id != f.id).count()
        db.delete(f)
        if remaining == 0:
            storage.delete_blob(f.sha256)
        n += 1
    db.commit()
    return {"purged": n}


# --------------------------------------------------------------------------- #
# duplicates + export
# --------------------------------------------------------------------------- #
@router.get("/duplicates")
def duplicates(project_id: int, user: User = Depends(get_current_user),
               db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    dupes = (db.query(File.sha256, func.count(File.id).label("n"),
                      func.max(File.size).label("size"))
             .filter(File.project_id == project_id, File.deleted == False)     # noqa: E712
             .group_by(File.sha256).having(func.count(File.id) > 1).all())
    out = []
    for sha, n, size in dupes:
        rows = db.query(File).filter(File.project_id == project_id, File.sha256 == sha,
                                     File.deleted == False).all()              # noqa: E712
        out.append({"sha256": sha, "count": n, "size": int(size or 0),
                    "wasted": int((size or 0) * (n - 1)),
                    "files": [{"id": r.id, "name": r.name, "path": r.path} for r in rows]})
    return sorted(out, key=lambda r: -r["wasted"])


@router.get("/export")
def export_zip(project_id: int, folder_id: Optional[int] = None,
               user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    """PRD §12 — ZIP Export."""
    p = owned_project(project_id, db, user)
    q = db.query(File).filter(File.project_id == project_id, File.deleted == False)  # noqa: E712
    if folder_id:
        prefix = _folder_path(db, folder_id)
        q = q.filter(File.path.like(f"{prefix}%"))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in q.all():
            data = storage.get_bytes(f.sha256)
            z.writestr(f"{p.name}{f.path}{f.name}".replace("//", "/"), data)
    buf.seek(0)
    log_activity(db, user.id, "project.exported", p.name, project_id=p.id, icon="download")
    db.commit()
    safe = "".join(c for c in p.name if c.isalnum() or c in " -_").strip() or "project"
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{safe}.zip"'})


# --------------------------------------------------------------------------- #
# media galleries (§19 / §20)
# --------------------------------------------------------------------------- #
@router.get("/media")
def media(project_id: int, kind: str = Query("image", pattern="^(image|video)$"),
          user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    rows = (db.query(File).filter(File.project_id == project_id, File.kind == kind,
                                  File.deleted == False)                       # noqa: E712
            .order_by(File.created_at.desc()).all())
    return [file_dto(f) for f in rows]


@router.get("/recent-files")
def recent_files(project_id: int, limit: int = 12, user: User = Depends(get_current_user),
                 db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    rows = (db.query(File).filter(File.project_id == project_id, File.deleted == False)  # noqa: E712
            .order_by(File.updated_at.desc()).limit(limit).all())
    return [file_dto(f) for f in rows]
