"""Project file service built on top of the storage engine."""
from __future__ import annotations

import difflib
from datetime import datetime, timezone
from typing import Iterable

from fastapi import UploadFile
from sqlalchemy import func, or_
from sqlalchemy.orm import Session as OrmSession

from .. import storage
from ..core.exceptions import NotFoundError, ValidationError
from ..models import FileBlob, Folder, Project, ProjectFile, User
from ..utils.strings import normalize_path
from .activity import record
from .folders import build_path
from .workspaces import ensure_workspace


def _project_or_404(db: OrmSession, project_id: int, user: User) -> Project:
    project = db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise NotFoundError("Project not found")
    return project


def _file_or_404(db: OrmSession, project_id: int, file_id: int) -> ProjectFile:
    row = db.get(ProjectFile, file_id)
    if not row or row.project_id != project_id or row.deleted:
        raise NotFoundError("File not found")
    return row


def _blob_dto(blob: FileBlob) -> dict:
    return {
        "id": blob.id,
        "sha256": blob.sha256,
        "storageKey": blob.storage_key,
        "size": blob.size,
        "mime": blob.mime,
        "extension": blob.extension,
        "kind": blob.kind,
        "language": blob.language,
        "referenceCount": blob.reference_count,
        "metadata": blob.blob_metadata or {},
        "createdAt": blob.created_at.isoformat() if blob.created_at else None,
    }


def file_dto(file: ProjectFile) -> dict:
    blob = file.blob
    return {
        "id": file.id,
        "projectId": file.project_id,
        "workspaceId": file.workspace_id,
        "folderId": file.folder_id,
        "blobId": file.blob_id,
        "filename": file.filename,
        "path": file.path,
        "sha256": blob.sha256 if blob else "",
        "storageKey": blob.storage_key if blob else "",
        "size": blob.size if blob else 0,
        "mime": blob.mime if blob else "application/octet-stream",
        "extension": blob.extension if blob else "",
        "kind": blob.kind if blob else "binary",
        "language": blob.language if blob else "text",
        "favorite": file.favorite,
        "archived": file.archived,
        "deleted": file.deleted,
        "version": file.version,
        "meta": file.meta or {},
        "createdAt": file.created_at.isoformat() if file.created_at else None,
        "updatedAt": file.updated_at.isoformat() if file.updated_at else None,
    }


def _ensure_blob(db: OrmSession, *, sha256: str, storage_key: str, size: int, mime: str,
                 extension: str, kind: str, language: str, metadata: dict | None = None) -> FileBlob:
    blob = db.query(FileBlob).filter(FileBlob.sha256 == sha256).first()
    if blob:
        blob.reference_count += 1
        return blob
    blob = FileBlob(sha256=sha256, storage_key=storage_key, size=size, mime=mime,
                    extension=extension, kind=kind, language=language,
                    reference_count=1, blob_metadata=metadata or {})
    db.add(blob)
    db.flush()
    return blob


def _release_blob(db: OrmSession, blob: FileBlob) -> None:
    blob.reference_count = max(blob.reference_count - 1, 0)
    if blob.reference_count == 0:
        storage.delete_blob(blob.sha256)
        db.delete(blob)


def _store_upload(up: UploadFile) -> tuple[str, int, bool]:
    return storage.put_stream(up.file)


def _language_from_ext(ext: str) -> str:
    return storage.language_for(ext or "txt")


def upload_files(db: OrmSession, user: User, project_id: int, files: list[UploadFile],
                 folder_id: int | None = None, paths: str | None = None) -> dict:
    project = _project_or_404(db, project_id, user)
    workspace = ensure_workspace(db, user)
    rel_paths = (paths or "").split("|") if paths else []
    out: list[dict] = []
    deduped = 0
    for idx, up in enumerate(files):
        target_folder = folder_id
        rel = rel_paths[idx] if idx < len(rel_paths) else ""
        if rel:
            target_folder = _ensure_path_tree(db, project, target_folder, rel)
        sha, size, dedup = _store_upload(up)
        deduped += int(dedup)
        filename = up.filename or "file"
        extension, kind, mime = storage.classify(filename)
        blob = _ensure_blob(
            db,
            sha256=sha,
            storage_key=f"blobs/{sha[:2]}/{sha[2:4]}/{sha}",
            size=size,
            mime=up.content_type or mime,
            extension=extension,
            kind=kind,
            language=_language_from_ext(extension),
        )
        row = db.query(ProjectFile).filter(ProjectFile.project_id == project.id,
                                           ProjectFile.folder_id == target_folder,
                                           ProjectFile.filename == filename,
                                           ProjectFile.deleted == False).first()  # noqa: E712
        if row:
            _release_blob(db, row.blob)
            row.blob_id = blob.id
            row.version += 1
            row.path = build_path(db, target_folder)
        else:
            row = ProjectFile(
                workspace_id=workspace.id,
                project_id=project.id,
                folder_id=target_folder,
                blob_id=blob.id,
                filename=filename,
                path=build_path(db, target_folder),
                uploaded_by=user.id,
            )
            db.add(row)
            db.flush()
        record(db, user_id=user.id, action="file.uploaded", target=filename,
               project_id=project.id, detail=f"{size} bytes", icon="upload")
        out.append(file_dto(row))
    db.commit()
    return {"files": out, "deduplicated": deduped}


def create_file(db: OrmSession, user: User, project_id: int, filename: str,
                content: str = "", folder_id: int | None = None) -> dict:
    from io import BytesIO

    project = _project_or_404(db, project_id, user)
    workspace = ensure_workspace(db, user)
    extension, kind, mime = storage.classify(filename)
    sha, size, _ = storage.put_bytes(content.encode())
    blob = _ensure_blob(
        db,
        sha256=sha,
        storage_key=f"blobs/{sha[:2]}/{sha[2:4]}/{sha}",
        size=size,
        mime=mime,
        extension=extension,
        kind=kind,
        language=_language_from_ext(extension),
    )
    row = ProjectFile(workspace_id=workspace.id, project_id=project.id, folder_id=folder_id,
                      blob_id=blob.id, filename=filename, path=build_path(db, folder_id),
                      uploaded_by=user.id)
    db.add(row)
    db.flush()
    record(db, user_id=user.id, action="file.created", target=filename, project_id=project.id,
           icon="file-plus")
    db.commit()
    return file_dto(row)


def list_files(db: OrmSession, user: User, project_id: int, folder_id: int | None = None,
               include_deleted: bool = False) -> list[dict]:
    _project_or_404(db, project_id, user)
    q = db.query(ProjectFile).filter(ProjectFile.project_id == project_id)
    if folder_id is None:
        q = q.filter(ProjectFile.folder_id.is_(None))
    else:
        q = q.filter(ProjectFile.folder_id == folder_id)
    if not include_deleted:
        q = q.filter(ProjectFile.deleted == False)  # noqa: E712
    rows = q.order_by(ProjectFile.filename.asc()).all()
    return [file_dto(row) for row in rows]


def get_file(db: OrmSession, user: User, project_id: int, file_id: int) -> ProjectFile:
    _project_or_404(db, project_id, user)
    return _file_or_404(db, project_id, file_id)


def rename_file(db: OrmSession, user: User, project_id: int, file_id: int,
                filename: str) -> dict:
    row = get_file(db, user, project_id, file_id)
    row.filename = filename
    blob = row.blob
    if blob:
        row.meta = {**(row.meta or {}), "originalFilename": filename}
    db.commit()
    record(db, user_id=user.id, action="file.renamed", target=filename, project_id=project_id,
           icon="edit-3")
    db.commit()
    return file_dto(row)


def move_file(db: OrmSession, user: User, project_id: int, file_id: int,
              folder_id: int | None) -> dict:
    row = get_file(db, user, project_id, file_id)
    row.folder_id = folder_id
    row.path = build_path(db, folder_id)
    db.commit()
    record(db, user_id=user.id, action="file.moved", target=row.filename, project_id=project_id,
           icon="move")
    db.commit()
    return file_dto(row)


def update_meta(db: OrmSession, user: User, project_id: int, file_id: int,
                meta: dict) -> dict:
    row = get_file(db, user, project_id, file_id)
    row.meta = {**(row.meta or {}), **(meta or {})}
    db.commit()
    return file_dto(row)


def delete_file(db: OrmSession, user: User, project_id: int, file_id: int, permanent: bool = False) -> dict:
    row = get_file(db, user, project_id, file_id)
    if permanent:
        blob = row.blob
        db.delete(row)
        if blob:
            _release_blob(db, blob)
        record(db, user_id=user.id, action="file.deleted", target=row.filename,
               project_id=project_id, icon="trash-2")
        db.commit()
        return {"ok": True}
    row.deleted = True
    row.deleted_at = datetime.now(timezone.utc)
    record(db, user_id=user.id, action="file.deleted", target=row.filename,
           project_id=project_id, icon="trash-2")
    db.commit()
    return {"ok": True}


def restore_file(db: OrmSession, user: User, project_id: int, file_id: int) -> dict:
    row = get_file(db, user, project_id, file_id)
    row.deleted = False
    row.deleted_at = None
    db.commit()
    record(db, user_id=user.id, action="file.restored", target=row.filename,
           project_id=project_id, icon="rotate-ccw")
    db.commit()
    return file_dto(row)


def download_url(db: OrmSession, user: User, project_id: int, file_id: int,
                 download: bool = False) -> str:
    row = get_file(db, user, project_id, file_id)
    return storage.download_url(row.blob.sha256, filename=row.filename, expires_in=3600,
                                download=download) or ""


def preview_url(db: OrmSession, user: User, project_id: int, file_id: int) -> str:
    return download_url(db, user, project_id, file_id, download=False)


def file_content(db: OrmSession, user: User, project_id: int, file_id: int) -> dict:
    row = get_file(db, user, project_id, file_id)
    raw = storage.get_bytes(row.blob.sha256)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return {
            "binary": True,
            "kind": row.blob.kind,
            "mime": row.blob.mime,
            "size": row.blob.size,
            "url": download_url(db, user, project_id, file_id),
        }
    return {
        "binary": False,
        "content": text,
        "language": row.blob.language,
        "lines": text.count("\n") + 1,
        "version": row.version,
        "size": row.blob.size,
    }


def diff_file(db: OrmSession, user: User, project_id: int, file_id: int,
              other_sha: str) -> dict:
    row = get_file(db, user, project_id, file_id)
    old = storage.get_bytes(other_sha).decode("utf-8", "replace")
    new = storage.get_bytes(row.blob.sha256).decode("utf-8", "replace")
    delta = list(difflib.unified_diff(old.splitlines(), new.splitlines(),
                                      fromfile=other_sha[:8], tofile=row.blob.sha256[:8],
                                      lineterm=""))
    return {"old": old, "new": new, "diff": delta}


def list_duplicates(db: OrmSession, user: User, project_id: int) -> list[dict]:
    _project_or_404(db, project_id, user)
    dupes = (db.query(FileBlob.sha256, func.count(ProjectFile.id).label("n"),
                      func.max(FileBlob.size).label("size"))
             .join(ProjectFile, ProjectFile.blob_id == FileBlob.id)
             .filter(ProjectFile.project_id == project_id, ProjectFile.deleted == False)  # noqa: E712
             .group_by(FileBlob.sha256).having(func.count(ProjectFile.id) > 1).all())
    out = []
    for sha, n, size in dupes:
        rows = (db.query(ProjectFile).join(FileBlob, ProjectFile.blob_id == FileBlob.id)
                .filter(ProjectFile.project_id == project_id, FileBlob.sha256 == sha,
                        ProjectFile.deleted == False).all())  # noqa: E712
        out.append({
            "sha256": sha,
            "count": n,
            "size": int(size or 0),
            "wasted": int((size or 0) * (n - 1)),
            "files": [file_dto(r) for r in rows],
        })
    return sorted(out, key=lambda item: -item["wasted"])


def search_files(db: OrmSession, user: User, q: str, limit: int = 20) -> list[dict]:
    like = f"%{q}%"
    rows = (db.query(ProjectFile)
            .join(Project, ProjectFile.project_id == Project.id)
            .filter(Project.user_id == user.id, ProjectFile.deleted == False,  # noqa: E712
                    or_(ProjectFile.filename.ilike(like), Project.name.ilike(like)))
            .order_by(ProjectFile.updated_at.desc()).limit(limit).all())
    return [file_dto(row) for row in rows]


def _ensure_path_tree(db: OrmSession, project: Project, parent_id: int | None, rel: str) -> int | None:
    path = normalize_path(rel)
    parts = [part for part in path.strip("/").split("/") if part]
    current_parent = parent_id
    for part in parts[:-1]:
        row = (db.query(Folder).filter(Folder.project_id == project.id,
                                       Folder.parent_id == current_parent,
                                       Folder.name == part,
                                       Folder.deleted == False).first())  # noqa: E712
        if not row:
            row = Folder(project_id=project.id, parent_id=current_parent, name=part)
            db.add(row)
            db.flush()
            row.path = build_path(db, row.id)
        current_parent = row.id
    return current_parent
