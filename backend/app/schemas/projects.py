"""Project and workspace schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = ""
    category: str = "Application"
    framework: str = ""
    language: str = ""
    color: str = "#6366f1"
    icon: str = "rocket"
    workspace_id: Optional[int] = None
    tags: list[str] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    framework: Optional[str] = None
    language: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    favorite: Optional[bool] = None
    pinned: Optional[bool] = None
    archived: Optional[bool] = None
    tags: Optional[list[str]] = None


class ProjectStats(BaseModel):
    file_count: int
    folder_count: int
    note_count: int
    task_count: int
    snapshot_count: int
    size_bytes: int


class WorkspaceOut(BaseModel):
    id: int
    name: str
    description: str = ""
    color: str = "#6366f1"
    icon: str = "layers"
    created_at: Optional[datetime] = None

