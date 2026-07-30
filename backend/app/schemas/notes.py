"""Note schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    body: str = ""
    category: str = "General"
    project_id: Optional[int] = None
    pinned: bool = False


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None
    pinned: Optional[bool] = None


class NoteOut(BaseModel):
    id: int
    title: str
    body: str
    category: str
    pinned: bool
    created_at: Optional[datetime] = None

