"""Global search service."""
from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session as OrmSession

from ..models import Folder, Note, Project, Task, ProjectFile, User
from .files import file_dto
from .folders import folder_dto
from .notes import note_dto
from .projects import project_dto
from .tasks import task_dto


def global_search(db: OrmSession, user: User, q: str, limit: int = 20) -> dict:
    like = f"%{q}%"
    pids = [p.id for p in db.query(Project.id).filter(Project.user_id == user.id).all()]
    groups: dict[str, list[dict]] = {}

    groups["projects"] = [project_dto(p) for p in db.query(Project)
                          .filter(Project.user_id == user.id,
                                  or_(Project.name.ilike(like), Project.description.ilike(like)))
                          .limit(limit).all()]
    groups["folders"] = [folder_dto(row) for row in db.query(Folder)
                         .filter(Folder.project_id.in_(pids), Folder.deleted == False,  # noqa: E712
                                 Folder.name.ilike(like))
                         .limit(limit).all()]
    groups["files"] = [file_dto(row) for row in db.query(ProjectFile)
                       .filter(ProjectFile.project_id.in_(pids), ProjectFile.deleted == False,  # noqa: E712
                               ProjectFile.filename.ilike(like))
                       .limit(limit).all()]
    groups["notes"] = [note_dto(row) for row in db.query(Note)
                       .filter(Note.user_id == user.id,
                               or_(Note.title.ilike(like), Note.body.ilike(like)))
                       .limit(limit).all()]
    groups["tasks"] = [task_dto(row) for row in db.query(Task)
                       .filter(Task.project_id.in_(pids),
                               or_(Task.name.ilike(like), Task.detail.ilike(like)))
                       .limit(limit).all()]
    return {"query": q, "total": sum(len(v) for v in groups.values()), "groups": groups}

