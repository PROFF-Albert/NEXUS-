"""PRD §8 Dashboard, §25 Search, §27 Workspace, §28 Activity, §29 Notifications, §34 Storage."""
from __future__ import annotations

import time
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session as OrmSession

from .. import storage
from ..config import STORAGE_QUOTA_GB
from ..database import get_db
from ..deps import get_current_user, iso
from ..models import (ActivityLog, ApiEntry, DatabaseConnection, Deployment, File, Folder,
                      Note, Notification, Project, Secret, Snapshot, Task, User, utcnow)
from .projects import project_dto

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard")
def dashboard(user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    started = time.perf_counter()
    pids = [p.id for p in db.query(Project.id).filter(Project.user_id == user.id).all()]

    recent = (db.query(Project).filter(Project.user_id == user.id, Project.archived == False)  # noqa: E712
              .order_by(Project.last_opened.desc().nullslast(), Project.updated_at.desc())
              .limit(6).all())
    pinned = (db.query(Project).filter(Project.user_id == user.id, Project.pinned == True,  # noqa: E712
                                       Project.archived == False).limit(6).all())           # noqa: E712
    logical = db.query(func.coalesce(func.sum(File.size), 0)).filter(
        File.project_id.in_(pids), File.deleted == False).scalar() or 0                      # noqa: E712
    physical = storage.physical_usage()
    snap_total = db.query(func.coalesce(func.sum(Snapshot.size), 0)).filter(
        Snapshot.project_id.in_(pids)).scalar() or 0

    now = utcnow()
    due = (db.query(Task, Project.name).join(Project, Task.project_id == Project.id)
           .filter(Project.user_id == user.id, Task.status != "Done",
                   Task.deadline.isnot(None), Task.deadline <= now + timedelta(days=7))
           .order_by(Task.deadline.asc()).limit(8).all())
    snaps = (db.query(Snapshot, Project.name).join(Project, Snapshot.project_id == Project.id)
             .filter(Project.user_id == user.id)
             .order_by(Snapshot.created_at.desc()).limit(5).all())
    activity = (db.query(ActivityLog).filter(ActivityLog.user_id == user.id)
                .order_by(ActivityLog.created_at.desc()).limit(12).all())
    files = (db.query(File, Project.name).join(Project, File.project_id == Project.id)
             .filter(Project.user_id == user.id, File.deleted == False)                      # noqa: E712
             .order_by(File.updated_at.desc()).limit(8).all())
    quick = (db.query(Note).filter(Note.user_id == user.id, Note.pinned == True)             # noqa: E712
             .order_by(Note.updated_at.desc()).limit(4).all())

    week_ago = now - timedelta(days=7)
    stats = {
        "projects": len(pids),
        "activeProjects": db.query(func.count(Project.id)).filter(
            Project.user_id == user.id, Project.archived == False).scalar() or 0,            # noqa: E712
        "files": db.query(func.count(File.id)).filter(
            File.project_id.in_(pids), File.deleted == False).scalar() or 0,                 # noqa: E712
        "snapshots": db.query(func.count(Snapshot.id)).filter(
            Snapshot.project_id.in_(pids)).scalar() or 0,
        "openTasks": db.query(func.count(Task.id)).filter(
            Task.project_id.in_(pids), Task.status != "Done").scalar() or 0,
        "tasksDoneWeek": db.query(func.count(Task.id)).filter(
            Task.project_id.in_(pids), Task.completed_at >= week_ago).scalar() or 0,
        "secrets": db.query(func.count(Secret.id)).filter(Secret.user_id == user.id).scalar() or 0,
        "deployments": db.query(func.count(Deployment.id)).filter(
            Deployment.project_id.in_(pids)).scalar() or 0,
        "notes": db.query(func.count(Note.id)).filter(Note.user_id == user.id).scalar() or 0,
        "editsWeek": db.query(func.count(ActivityLog.id)).filter(
            ActivityLog.user_id == user.id, ActivityLog.created_at >= week_ago).scalar() or 0,
    }
    heat = (db.query(func.date(ActivityLog.created_at), func.count(ActivityLog.id))
            .filter(ActivityLog.user_id == user.id, ActivityLog.created_at >= now - timedelta(days=90))
            .group_by(func.date(ActivityLog.created_at)).all())

    return {
        "recentProjects": [project_dto(db, p) for p in recent],
        "pinnedProjects": [project_dto(db, p) for p in pinned],
        "continueWorking": project_dto(db, recent[0], detailed=True) if recent else None,
        "storage": {"logical": int(logical), "physical": physical, "snapshots": int(snap_total),
                    "quota": int(STORAGE_QUOTA_GB * 1024 ** 3),
                    "saved": max(int(logical) - physical, 0),
                    "percent": round(physical / (STORAGE_QUOTA_GB * 1024 ** 3) * 100, 2)},
        "tasksDue": [{"id": t.id, "name": t.name, "deadline": iso(t.deadline), "status": t.status,
                      "priority": t.priority, "projectId": t.project_id, "projectName": pn}
                     for t, pn in due],
        "latestSnapshots": [{"id": s.id, "name": s.name, "size": s.size, "projectId": s.project_id,
                             "projectName": pn, "createdAt": iso(s.created_at)} for s, pn in snaps],
        "activity": [{"id": a.id, "action": a.action, "target": a.target, "detail": a.detail,
                      "icon": a.icon, "projectId": a.project_id, "createdAt": iso(a.created_at)}
                     for a in activity],
        "recentFiles": [{"id": f.id, "name": f.name, "kind": f.kind, "extension": f.extension,
                         "size": f.size, "projectId": f.project_id, "projectName": pn,
                         "updatedAt": iso(f.updated_at)} for f, pn in files],
        "quickNotes": [{"id": n.id, "title": n.title, "body": n.body[:280],
                        "updatedAt": iso(n.updated_at)} for n in quick],
        "stats": stats,
        "heatmap": [{"day": str(d), "count": c} for d, c in heat],
        "generatedInMs": round((time.perf_counter() - started) * 1000, 2),
    }


@router.get("/search")
def search(q: str = Query(..., min_length=1), limit: int = 8,
           user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    """PRD §25 — Global Search across every entity. Secrets by NAME ONLY."""
    started = time.perf_counter()
    like = f"%{q}%"
    pids = [p.id for p in db.query(Project.id).filter(Project.user_id == user.id).all()]
    pnames = {p.id: p.name for p in db.query(Project).filter(Project.user_id == user.id).all()}
    out: dict[str, list] = {}

    out["projects"] = [{"id": p.id, "title": p.name, "subtitle": p.description[:110],
                        "meta": p.status, "link": f"/projects/{p.id}", "icon": p.icon,
                        "color": p.color}
                       for p in db.query(Project).filter(Project.user_id == user.id,
                                                         or_(Project.name.ilike(like),
                                                             Project.description.ilike(like)))
                       .limit(limit).all()]
    out["files"] = [{"id": f.id, "title": f.name, "subtitle": f"{pnames.get(f.project_id,'')}{f.path}",
                     "meta": f.extension, "link": f"/projects/{f.project_id}?tab=files&file={f.id}",
                     "icon": "file", "color": ""}
                    for f in db.query(File).filter(File.project_id.in_(pids),
                                                   File.deleted == False,          # noqa: E712
                                                   File.name.ilike(like)).limit(limit).all()]
    out["folders"] = [{"id": d.id, "title": d.name, "subtitle": pnames.get(d.project_id, ""),
                       "meta": d.path, "link": f"/projects/{d.project_id}?tab=files",
                       "icon": "folder", "color": d.color}
                      for d in db.query(Folder).filter(Folder.project_id.in_(pids),
                                                       Folder.deleted == False,    # noqa: E712
                                                       Folder.name.ilike(like)).limit(limit).all()]
    out["tasks"] = [{"id": t.id, "title": t.name, "subtitle": pnames.get(t.project_id, ""),
                     "meta": f"{t.status} · {t.priority}",
                     "link": f"/projects/{t.project_id}?tab=tasks", "icon": "check-square", "color": ""}
                    for t in db.query(Task).filter(Task.project_id.in_(pids),
                                                   Task.name.ilike(like)).limit(limit).all()]
    notes = db.query(Note).filter(Note.user_id == user.id,
                                  or_(Note.title.ilike(like), Note.body.ilike(like))).limit(limit * 2).all()
    out["notes"] = [{"id": n.id, "title": n.title, "subtitle": n.body[:110].replace("\n", " "),
                     "meta": n.category, "link": f"/projects/{n.project_id}?tab=notes"
                     if n.project_id else "/notes", "icon": "file-text", "color": ""}
                    for n in notes if n.doc_type == "note"][:limit]
    out["documentation"] = [{"id": n.id, "title": n.title, "subtitle": n.body[:110].replace("\n", " "),
                             "meta": n.category, "link": f"/projects/{n.project_id}?tab=docs",
                             "icon": "book", "color": ""}
                            for n in notes if n.doc_type == "doc"][:limit]
    out["images"] = [{"id": f.id, "title": f.name, "subtitle": pnames.get(f.project_id, ""),
                      "meta": "image", "link": f"/projects/{f.project_id}?tab=images",
                      "icon": "image", "color": ""}
                     for f in db.query(File).filter(File.project_id.in_(pids), File.kind == "image",
                                                    File.deleted == False,          # noqa: E712
                                                    File.name.ilike(like)).limit(limit).all()]
    out["videos"] = [{"id": f.id, "title": f.name, "subtitle": pnames.get(f.project_id, ""),
                      "meta": "video", "link": f"/projects/{f.project_id}?tab=videos",
                      "icon": "video", "color": ""}
                     for f in db.query(File).filter(File.project_id.in_(pids), File.kind == "video",
                                                    File.deleted == False,          # noqa: E712
                                                    File.name.ilike(like)).limit(limit).all()]
    # names only — values are never searchable or returned
    out["secrets"] = [{"id": s.id, "title": s.name, "subtitle": "🔒 name match only — value encrypted",
                       "meta": s.kind, "link": "/vault", "icon": "key", "color": ""}
                      for s in db.query(Secret).filter(Secret.user_id == user.id,
                                                       Secret.name.ilike(like)).limit(limit).all()]
    out["apis"] = [{"id": a.id, "title": a.name, "subtitle": f"{a.method} {a.url[:70]}",
                    "meta": a.collection, "link": f"/projects/{a.project_id}?tab=api",
                    "icon": "git-branch", "color": ""}
                   for a in db.query(ApiEntry).filter(ApiEntry.project_id.in_(pids),
                                                      or_(ApiEntry.name.ilike(like),
                                                          ApiEntry.url.ilike(like))).limit(limit).all()]
    out["databases"] = [{"id": d.id, "title": d.name, "subtitle": f"{d.provider} · {d.host}",
                         "meta": d.database, "link": f"/projects/{d.project_id}?tab=database",
                         "icon": "database", "color": ""}
                        for d in db.query(DatabaseConnection)
                        .filter(DatabaseConnection.project_id.in_(pids),
                                or_(DatabaseConnection.name.ilike(like),
                                    DatabaseConnection.database.ilike(like))).limit(limit).all()]

    total = sum(len(v) for v in out.values())
    return {"query": q, "total": total, "groups": {k: v for k, v in out.items() if v},
            "tookMs": round((time.perf_counter() - started) * 1000, 2)}


@router.get("/workspace")
def workspace(user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    """PRD §27 — Pinned / Recent / Favorites / Collections / Archived."""
    base = db.query(Project).filter(Project.user_id == user.id)
    collections: dict[str, list] = {}
    for p in base.filter(Project.collection != "", Project.archived == False).all():   # noqa: E712
        collections.setdefault(p.collection, []).append(project_dto(db, p))
    return {
        "pinned": [project_dto(db, p) for p in base.filter(Project.pinned == True,     # noqa: E712
                                                           Project.archived == False).all()],  # noqa: E712
        "favorites": [project_dto(db, p) for p in base.filter(Project.favorite == True,  # noqa: E712
                                                              Project.archived == False).all()],  # noqa: E712
        "recent": [project_dto(db, p) for p in base.filter(Project.archived == False)   # noqa: E712
                   .order_by(Project.last_opened.desc().nullslast()).limit(8).all()],
        "archived": [project_dto(db, p) for p in base.filter(Project.archived == True).all()],  # noqa: E712
        "collections": collections,
    }


@router.get("/activity")
def activity_feed(limit: int = 60, project_id: Optional[int] = None,
                  user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    q = db.query(ActivityLog).filter(ActivityLog.user_id == user.id)
    if project_id:
        q = q.filter(ActivityLog.project_id == project_id)
    names = {p.id: p.name for p in db.query(Project).filter(Project.user_id == user.id).all()}
    return [{"id": a.id, "action": a.action, "target": a.target, "detail": a.detail,
             "icon": a.icon, "projectId": a.project_id,
             "projectName": names.get(a.project_id, ""), "createdAt": iso(a.created_at)}
            for a in q.order_by(ActivityLog.created_at.desc()).limit(limit).all()]


@router.get("/notifications")
def notifications(unread_only: bool = False, user: User = Depends(get_current_user),
                  db: OrmSession = Depends(get_db)):
    q = db.query(Notification).filter(Notification.user_id == user.id)
    if unread_only:
        q = q.filter(Notification.read == False)                                # noqa: E712
    rows = q.order_by(Notification.created_at.desc()).limit(50).all()
    unread = db.query(func.count(Notification.id)).filter(
        Notification.user_id == user.id, Notification.read == False).scalar() or 0   # noqa: E712
    return {"unread": unread,
            "items": [{"id": n.id, "title": n.title, "body": n.body, "level": n.level,
                       "icon": n.icon, "link": n.link, "read": n.read,
                       "createdAt": iso(n.created_at)} for n in rows]}


@router.post("/notifications/read")
def mark_read(payload: dict, user: User = Depends(get_current_user),
              db: OrmSession = Depends(get_db)):
    q = db.query(Notification).filter(Notification.user_id == user.id)
    if ids := payload.get("ids"):
        q = q.filter(Notification.id.in_(ids))
    q.update({Notification.read: True}, synchronize_session=False)
    db.commit()
    return {"ok": True}


@router.delete("/notifications")
def clear_notifications(user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user.id).delete()
    db.commit()
    return {"ok": True}


@router.get("/storage")
def storage_analytics(user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    """PRD §34 — Storage Analytics, compression, duplicate detection."""
    pids = [p.id for p in db.query(Project.id).filter(Project.user_id == user.id).all()]
    by_project = (db.query(Project.name, Project.color, func.coalesce(func.sum(File.size), 0),
                           func.count(File.id))
                  .join(File, File.project_id == Project.id)
                  .filter(Project.user_id == user.id, File.deleted == False)     # noqa: E712
                  .group_by(Project.id).order_by(func.sum(File.size).desc()).all())
    by_kind = dict(db.query(File.kind, func.coalesce(func.sum(File.size), 0))
                   .filter(File.project_id.in_(pids), File.deleted == False)     # noqa: E712
                   .group_by(File.kind).all())
    logical = sum(int(v) for v in by_kind.values())
    physical = storage.physical_usage()
    dupes = (db.query(func.count(File.id)).filter(File.project_id.in_(pids),
                                                  File.deleted == False)          # noqa: E712
             .group_by(File.sha256).having(func.count(File.id) > 1).all())
    trash = db.query(func.coalesce(func.sum(File.size), 0)).filter(
        File.project_id.in_(pids), File.deleted == True).scalar() or 0            # noqa: E712
    return {"logical": logical, "physical": physical, "saved": max(logical - physical, 0),
            "quota": int(STORAGE_QUOTA_GB * 1024 ** 3),
            "percent": round(physical / (STORAGE_QUOTA_GB * 1024 ** 3) * 100, 2),
            "byProject": [{"name": n, "color": c, "size": int(s), "files": f}
                          for n, c, s, f in by_project],
            "byKind": {k: int(v) for k, v in by_kind.items()},
            "duplicateGroups": len(dupes), "recycleBin": int(trash),
            "snapshots": int(db.query(func.coalesce(func.sum(Snapshot.size), 0))
                             .filter(Snapshot.project_id.in_(pids)).scalar() or 0)}
