"""File and folder schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_id: Optional[int] = None
    color: str = ""


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    color: Optional[str] = None
    favorite: Optional[bool] = None


class FileMove(BaseModel):
    folder_id: Optional[int] = None


class FileRename(BaseModel):
    filename: str = Field(min_length=1, max_length=255)


class FileMetaUpdate(BaseModel):
    meta: dict = {}


class FileUploadResult(BaseModel):
    id: int
    filename: str
    sha256: str
    size: int
    kind: str
    mime: str
    folder_id: Optional[int] = None
    path: str
    created_at: Optional[datetime] = None

