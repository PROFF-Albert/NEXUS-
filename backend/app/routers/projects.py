"""PRD §9, §10, §11, §15, §27 — Projects, Overview, Timeline, Workspace."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import get_current_user, iso, log_activity, owned_project
from ..models import (ActivityLog, ApiEntry, DatabaseConnection, Deployment, File, Folder,
                      Note, Project, Secret, Snapshot, Task, User, utcnow)

router = APIRouter(prefix="/api/projects", tags=["projects"])

STATUSES = ["Planning", "Design", "Development", "Testing", "Completed", "Paused", "Archived"]


def project_dto(db: OrmSession, p: Project, detailed: bool = False) -> dict:
    size = db.query(func.coalesce(func.sum(File.size), 0)).filter(
        File.project_id == p.id, File.deleted == False).scalar() or 0          # noqa: E712
    files = db.query(func.count(File.id)).filter(
        File.project_id == p.id, File.deleted == False).scalar() or 0          # noqa: E712
    total_tasks = db.query(func.count(Task.id)).filter(Task.project_id == p.id).scalar() or 0
    done_tasks = db.query(func.count(Task.id)).filter(
        Task.project_id == p.id, Task.status == "Done").scalar() or 0
    dto = {
        "id": p.id, "name": p.name, "description": p.description, "category": p.category,
        "framework": p.framework, "language": p.language, "status": p.status,
        "color": p.color, "icon": p.icon, "thumbnail": p.thumbnail, "tags": p.tags or [],
        "favorite": p.favorite, "pinned": p.pinned, "archived": p.archived,
        "collection": p.collection, "createdAt": iso(p.created_at),
        "updatedAt": iso(p.updated_at), "lastOpened": iso(p.last_opened),
        "storageUsed": int(size), "fileCount": files,
        "taskTotal": total_tasks, "taskDone": done_tasks,
        "taskProgress": round(done_tasks / total_tasks * 100) if total_tasks else 0,
    }
    if detailed:
        snap = (db.query(Snapshot).filter(Snapshot.project_id == p.id)
                .order_by(Snapshot.created_at.desc()).first())
        dep = (db.query(Deployment).filter(Deployment.project_id == p.id, Deployment.active == True)  # noqa: E712
               .order_by(Deployment.created_at.desc()).first())
        dto["latestSnapshot"] = ({"id": snap.id, "name": snap.name, "createdAt": iso(snap.created_at),
                                  "size": snap.size} if snap else None)
        dto["liveUrl"] = dep.url if dep else ""
        dto["counts"] = {
            "notes": db.query(func.count(Note.id)).filter(Note.project_id == p.id,
                                                          Note.doc_type == "note").scalar() or 0,
            "docs": db.query(func.count(Note.id)).filter(Note.project_id == p.id,
                                                         Note.doc_type == "doc").scalar() or 0,
            "snapshots": db.query(func.count(Snapshot.id)).filter(
                Snapshot.project_id == p.id).scalar() or 0,
            "secrets": db.query(func.count(Secret.id)).filter(
                Secret.project_id == p.id).scalar() or 0,
            "apis": db.query(func.count(ApiEntry.id)).filter(
                ApiEntry.project_id == p.id).scalar() or 0,
            "databases": db.query(func.count(DatabaseConnection.id)).filter(
                DatabaseConnection.project_id == p.id).scalar() or 0,
            "deployments": db.query(func.count(Deployment.id)).filter(
                Deployment.project_id == p.id).scalar() or 0,
            "images": db.query(func.count(File.id)).filter(
                File.project_id == p.id, File.kind == "image", File.deleted == False).scalar() or 0,  # noqa: E712
            "videos": db.query(func.count(File.id)).filter(
                File.project_id == p.id, File.kind == "video", File.deleted == False).scalar() or 0,  # noqa: E712
        }
    return dto


class ProjectIn(BaseModel):
    name: str
    description: str = ""
    category: str = "Application"
    framework: str = ""
    language: str = ""
    status: str = "Planning"
    color: str = "#6366f1"
    icon: str = "rocket"
    tags: list[str] = []
    collection: str = ""
    template_id: Optional[int] = None


class ProjectPatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    framework: Optional[str] = None
    language: Optional[str] = None
    status: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    thumbnail: Optional[str] = None
    tags: Optional[list[str]] = None
    favorite: Optional[bool] = None
    pinned: Optional[bool] = None
    archived: Optional[bool] = None
    collection: Optional[str] = None


@router.get("")
def list_projects(status: Optional[str] = None, archived: bool = False,
                  favorite: Optional[bool] = None, collection: Optional[str] = None,
                  q: Optional[str] = None, sort: str = "recent",
                  user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    query = db.query(Project).filter(Project.user_id == user.id,
                                     Project.archived == archived)
    if status:
        query = query.filter(Project.status == status)
    if favorite is not None:
        query = query.filter(Project.favorite == favorite)
    if collection:
        query = query.filter(Project.collection == collection)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(func.lower(Project.name).like(like) |
                             func.lower(Project.description).like(like))
    order = {"recent": Project.updated_at.desc(), "created": Project.created_at.desc(),
             "name": Project.name.asc(), "opened": Project.last_opened.desc()}
    query = query.order_by(Project.pinned.desc(), order.get(sort, Project.updated_at.desc()))
    return [project_dto(db, p) for p in query.all()]


@router.post("", status_code=201)
def create_project(payload: ProjectIn, user: User = Depends(get_current_user),
                   db: OrmSession = Depends(get_db)):
    if payload.status not in STATUSES:
        raise HTTPException(400, f"Status must be one of {STATUSES}")
    p = Project(user_id=user.id, name=payload.name.strip() or "Untitled Project",
                description=payload.description, category=payload.category,
                framework=payload.framework, language=payload.language,
                status=payload.status, color=payload.color, icon=payload.icon,
                tags=payload.tags, collection=payload.collection, last_opened=utcnow())
    db.add(p)
    db.commit()
    db.refresh(p)

    if payload.template_id:
        from .templates import apply_template
        apply_template(db, user, p, payload.template_id)

    log_activity(db, user.id, "project.created", p.name, project_id=p.id, icon="folder-plus")
    db.commit()
    return project_dto(db, p, detailed=True)


@router.get("/{project_id}")
def get_project(project_id: int, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    p = owned_project(project_id, db, user)
    p.last_opened = utcnow()
    db.commit()
    return project_dto(db, p, detailed=True)


@router.patch("/{project_id}")
def update_project(project_id: int, payload: ProjectPatch,
                   user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    p = owned_project(project_id, db, user)
    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in STATUSES:
        raise HTTPException(400, f"Status must be one of {STATUSES}")
    for k, v in data.items():
        setattr(p, k, v)
    if data.get("archived"):
        log_activity(db, user.id, "project.archived", p.name, project_id=p.id, icon="archive")
    db.commit()
    return project_dto(db, p, detailed=True)


@router.delete("/{project_id}")
def delete_project(project_id: int, user: User = Depends(get_current_user),
                   db: OrmSession = Depends(get_db)):
    p = owned_project(project_id, db, user)
    name = p.name
    db.delete(p)
    log_activity(db, user.id, "project.deleted", name, icon="trash-2")
    db.commit()
    return {"ok": True}


@router.get("/{project_id}/timeline")
def timeline(project_id: int, limit: int = Query(80, le=300),
             user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    """PRD §15 — Visual project history."""
    owned_project(project_id, db, user)
    rows = (db.query(ActivityLog).filter(ActivityLog.project_id == project_id)
            .order_by(ActivityLog.created_at.desc()).limit(limit).all())
    return [{"id": r.id, "action": r.action, "target": r.target, "detail": r.detail,
             "icon": r.icon, "createdAt": iso(r.created_at)} for r in rows]


@router.get("/{project_id}/analytics")
def analytics(project_id: int, user: User = Depends(get_current_user),
              db: OrmSession = Depends(get_db)):
    p = owned_project(project_id, db, user)
    by_kind = dict(db.query(File.kind, func.coalesce(func.sum(File.size), 0))
                   .filter(File.project_id == p.id, File.deleted == False)     # noqa: E712
                   .group_by(File.kind).all())
    by_ext = (db.query(File.extension, func.count(File.id), func.coalesce(func.sum(File.size), 0))
              .filter(File.project_id == p.id, File.deleted == False)          # noqa: E712
              .group_by(File.extension).order_by(func.sum(File.size).desc()).limit(10).all())
    task_status = dict(db.query(Task.status, func.count(Task.id))
                       .filter(Task.project_id == p.id).group_by(Task.status).all())
    task_priority = dict(db.query(Task.priority, func.count(Task.id))
                         .filter(Task.project_id == p.id).group_by(Task.priority).all())
    activity = (db.query(func.date(ActivityLog.created_at), func.count(ActivityLog.id))
                .filter(ActivityLog.project_id == p.id)
                .group_by(func.date(ActivityLog.created_at)).all())
    snaps = (db.query(Snapshot).filter(Snapshot.project_id == p.id)
             .order_by(Snapshot.created_at.asc()).all())
    return {
        "storageByKind": {k: int(v) for k, v in by_kind.items()},
        "topExtensions": [{"ext": e or "—", "count": c, "size": int(s)} for e, c, s in by_ext],
        "tasksByStatus": task_status, "tasksByPriority": task_priority,
        "activityByDay": [{"day": str(d), "count": c} for d, c in activity],
        "snapshotTrend": [{"name": s.name, "size": s.size, "at": iso(s.created_at)} for s in snaps],
        "folderCount": db.query(func.count(Folder.id)).filter(
            Folder.project_id == p.id, Folder.deleted == False).scalar() or 0,  # noqa: E712
    }


@router.get("/{project_id}/logs")
def project_logs(project_id: int, user: User = Depends(get_current_user),
                 db: OrmSession = Depends(get_db)):
    """PRD §10 — Logs tab: deployment logs + system events."""
    owned_project(project_id, db, user)
    out = []
    for d in (db.query(Deployment).filter(Deployment.project_id == project_id)
              .order_by(Deployment.created_at.desc()).limit(25).all()):
        out.append({"source": f"{d.provider} · {d.environment}", "status": d.status,
                    "createdAt": iso(d.created_at), "body": d.logs})
    for a in (db.query(ActivityLog).filter(ActivityLog.project_id == project_id)
              .order_by(ActivityLog.created_at.desc()).limit(60).all()):
        out.append({"source": "nexus.system", "status": "info", "createdAt": iso(a.created_at),
                    "body": f"[{a.action}] {a.target} {a.detail}".strip()})
    out.sort(key=lambda r: r["createdAt"] or "", reverse=True)
    return out
