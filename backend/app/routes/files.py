"""File routes."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File as UploadFileParam, Form, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session as OrmSession

from .. import storage
from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas.files import FileMetaUpdate, FileRename
from ..services import files as svc

router = APIRouter(prefix="/api/projects/{project_id}/files", tags=["files"])


@router.get("")
def list_files(project_id: int, folder_id: Optional[int] = None,
               user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    return svc.list_files(db, user, project_id, folder_id)


@router.post("/upload", status_code=201)
async def upload_files(project_id: int, files: list[UploadFile] = UploadFileParam(...),
                       folder_id: Optional[int] = Form(None), paths: Optional[str] = Form(None),
                       user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    return svc.upload_files(db, user, project_id, files, folder_id, paths)


@router.post("", status_code=201)
def create_file(project_id: int, payload: dict, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    return svc.create_file(db, user, project_id, payload["filename"], payload.get("content", ""),
                           payload.get("folder_id"))


@router.get("/{file_id}")
def file_metadata(project_id: int, file_id: int, user: User = Depends(get_current_user),
                  db: OrmSession = Depends(get_db)):
    row = svc.get_file(db, user, project_id, file_id)
    return svc.file_dto(row)


@router.get("/{file_id}/metadata")
def file_metadata_detail(project_id: int, file_id: int, user: User = Depends(get_current_user),
                         db: OrmSession = Depends(get_db)):
    return file_metadata(project_id, file_id, user, db)


@router.patch("/{file_id}")
def rename_or_move_file(project_id: int, file_id: int, payload: dict,
                        user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    if "filename" in payload and payload["filename"]:
        return svc.rename_file(db, user, project_id, file_id, payload["filename"])
    if "folder_id" in payload:
        return svc.move_file(db, user, project_id, file_id, payload["folder_id"])
    if "meta" in payload:
        return svc.update_meta(db, user, project_id, file_id, payload["meta"])
    return svc.file_dto(svc.get_file(db, user, project_id, file_id))


@router.delete("/{file_id}")
def delete_file(project_id: int, file_id: int, permanent: bool = False,
                user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    return svc.delete_file(db, user, project_id, file_id, permanent)


@router.get("/{file_id}/download")
def download_file(project_id: int, file_id: int, download: bool = False,
                  user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    url = svc.download_url(db, user, project_id, file_id, download=download)
    if url:
        return RedirectResponse(url)
    row = svc.get_file(db, user, project_id, file_id)
    return FileResponse(storage.get_path(row.blob.sha256), media_type=row.blob.mime,
                        filename=row.filename)


@router.get("/{file_id}/preview")
def preview_file(project_id: int, file_id: int, user: User = Depends(get_current_user),
                 db: OrmSession = Depends(get_db)):
    url = svc.preview_url(db, user, project_id, file_id)
    if url:
        return RedirectResponse(url)
    row = svc.get_file(db, user, project_id, file_id)
    return FileResponse(storage.get_path(row.blob.sha256), media_type=row.blob.mime,
                        filename=row.filename)


@router.get("/{file_id}/content")
def file_content(project_id: int, file_id: int, user: User = Depends(get_current_user),
                 db: OrmSession = Depends(get_db)):
    return svc.file_content(db, user, project_id, file_id)


@router.get("/{file_id}/raw")
def raw_file(project_id: int, file_id: int, download: bool = False,
             user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    url = svc.download_url(db, user, project_id, file_id, download=download)
    if url:
        return RedirectResponse(url)
    row = svc.get_file(db, user, project_id, file_id)
    return FileResponse(storage.get_path(row.blob.sha256), media_type=row.blob.mime,
                        filename=row.filename)


@router.get("/search")
def search_files(project_id: int, q: str, user: User = Depends(get_current_user),
                 db: OrmSession = Depends(get_db)):
    return svc.search_files(db, user, q)


@router.get("/duplicates")
def duplicates(project_id: int, user: User = Depends(get_current_user),
               db: OrmSession = Depends(get_db)):
    return svc.list_duplicates(db, user, project_id)
