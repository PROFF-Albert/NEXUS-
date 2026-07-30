"""Snapshot helpers for working with file blob hashes."""
from __future__ import annotations

from sqlalchemy.orm import Session as OrmSession


def blob_hashes_for_project(db: OrmSession, project_id: int) -> list[str]:
    from ...models import File

    rows = db.query(File.sha256).filter(File.project_id == project_id, File.deleted == False).all()  # noqa: E712
    return [sha for (sha,) in rows if sha]


def unique_blob_hashes(db: OrmSession, project_id: int) -> list[str]:
    return sorted(set(blob_hashes_for_project(db, project_id)))

