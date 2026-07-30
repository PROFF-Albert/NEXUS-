"""Snapshot schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SnapshotCreate(BaseModel):
    name: Optional[str] = None
    description: str = ""


class SnapshotOut(BaseModel):
    id: int
    name: str
    description: str = ""
    size: int = 0
    file_count: int = 0
    created_at: Optional[datetime] = None

