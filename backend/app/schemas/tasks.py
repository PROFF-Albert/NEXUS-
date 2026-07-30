"""Task schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    detail: str = ""
    status: str = "Todo"
    priority: str = "Medium"
    deadline: Optional[datetime] = None
    reminder: Optional[datetime] = None
    labels: list[str] = []
    parent_id: Optional[int] = None
    project_id: Optional[int] = None


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    detail: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    deadline: Optional[datetime] = None
    reminder: Optional[datetime] = None
    labels: Optional[list[str]] = None
    parent_id: Optional[int] = None
    progress: Optional[int] = None


class TaskOut(BaseModel):
    id: int
    name: str
    detail: str
    status: str
    priority: str
    progress: int
    parent_id: Optional[int] = None
    created_at: Optional[datetime] = None

