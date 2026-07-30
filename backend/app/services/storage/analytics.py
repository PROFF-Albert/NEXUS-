"""Storage analytics helpers."""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session as OrmSession

from .client import get_backend


def physical_usage() -> int:
    return get_backend().physical_usage()


def logical_usage(db: OrmSession, project_ids: list[int] | None = None) -> int:
    from ...models import File

    q = db.query(func.coalesce(func.sum(File.size), 0)).filter(File.deleted == False)  # noqa: E712
    if project_ids is not None:
        q = q.filter(File.project_id.in_(project_ids))
    return int(q.scalar() or 0)


def duplicate_stats(db: OrmSession, project_ids: list[int] | None = None) -> dict:
    from ...models import File

    q = db.query(File.sha256, func.count(File.id).label("n"), func.max(File.size).label("size"))
    q = q.filter(File.deleted == False)  # noqa: E712
    if project_ids is not None:
        q = q.filter(File.project_id.in_(project_ids))
    dupes = q.group_by(File.sha256).having(func.count(File.id) > 1).all()
    logical = logical_usage(db, project_ids)
    saved = sum(int((size or 0) * (n - 1)) for _sha, n, size in dupes)
    return {
        "logical": logical,
        "physical": physical_usage(),
        "saved": saved,
        "duplicateGroups": len(dupes),
        "duplicateRatio": round(saved / logical, 4) if logical else 0,
    }

