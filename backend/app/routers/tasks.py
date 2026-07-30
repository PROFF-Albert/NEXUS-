"""PRD §17 — Tasks (+ §7 Calendar feed)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import get_current_user, iso, log_activity, notify, owned_project
from ..models import Project, Task, User, utcnow

router = APIRouter(prefix="/api", tags=["tasks"])

STATUSES = ["Todo", "In Progress", "Blocked", "Testing", "Done"]
PRIORITIES = ["Critical", "High", "Medium", "Low"]


def task_dto(t: Task, project_name: str = "") -> dict:
    return {"id": t.id, "projectId": t.project_id, "projectName": project_name,
            "parentId": t.parent_id, "name": t.name, "detail": t.detail, "status": t.status,
            "priority": t.priority, "deadline": iso(t.deadline), "reminder": iso(t.reminder),
            "progress": t.progress, "labels": t.labels or [], "dependsOn": t.depends_on or [],
            "attachments": t.attachments or [], "orderIndex": t.order_index,
            "createdAt": iso(t.created_at), "completedAt": iso(t.completed_at)}


class TaskIn(BaseModel):
    name: str
    detail: str = ""
    status: str = "Todo"
    priority: str = "Medium"
    deadline: Optional[datetime] = None
    reminder: Optional[datetime] = None
    labels: list[str] = []
    depends_on: list[int] = []
    parent_id: Optional[int] = None
    progress: int = 0


class TaskPatch(BaseModel):
    name: Optional[str] = None
    detail: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    deadline: Optional[datetime] = None
    reminder: Optional[datetime] = None
    labels: Optional[list[str]] = None
    depends_on: Optional[list[int]] = None
    attachments: Optional[list] = None
    progress: Optional[int] = None
    order_index: Optional[int] = None
    parent_id: Optional[int] = None


@router.get("/projects/{project_id}/tasks")
def list_tasks(project_id: int, status: Optional[str] = None,
               user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    q = db.query(Task).filter(Task.project_id == project_id)
    if status:
        q = q.filter(Task.status == status)
    rows = q.order_by(Task.order_index, Task.id).all()
    return [task_dto(t) for t in rows]


@router.post("/projects/{project_id}/tasks", status_code=201)
def create_task(project_id: int, payload: TaskIn, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    if payload.status not in STATUSES or payload.priority not in PRIORITIES:
        raise HTTPException(400, "Invalid status or priority")
    t = Task(project_id=project_id, **payload.model_dump())
    db.add(t)
    log_activity(db, user.id, "task.created", payload.name, project_id=project_id, icon="check-square")
    db.commit()
    db.refresh(t)
    return task_dto(t)


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, payload: TaskPatch, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    owned_project(t.project_id, db, user)
    data = payload.model_dump(exclude_unset=True)
    was_done = t.status == "Done"
    for k, v in data.items():
        setattr(t, k, v)
    if t.status == "Done" and not was_done:
        t.completed_at, t.progress = utcnow(), 100
        log_activity(db, user.id, "task.completed", t.name, project_id=t.project_id, icon="check-circle")
    elif t.status != "Done" and was_done:
        t.completed_at = None
    db.commit()
    return task_dto(t)


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    owned_project(t.project_id, db, user)
    db.query(Task).filter(Task.parent_id == task_id).delete()
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.get("/tasks")
def all_tasks(status: Optional[str] = None, due: Optional[str] = None,
              user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    """Global task board across every project."""
    q = (db.query(Task, Project.name).join(Project, Task.project_id == Project.id)
         .filter(Project.user_id == user.id))
    if status:
        q = q.filter(Task.status == status)
    if due == "overdue":
        q = q.filter(Task.deadline < utcnow(), Task.status != "Done")
    elif due == "week":
        q = q.filter(Task.deadline <= utcnow() + timedelta(days=7), Task.status != "Done")
    return [task_dto(t, name) for t, name in q.order_by(Task.deadline.is_(None),
                                                        Task.deadline.asc()).all()]


@router.get("/calendar")
def calendar(month: Optional[str] = None, user: User = Depends(get_current_user),
             db: OrmSession = Depends(get_db)):
    """PRD §7 — Calendar: deadlines, reminders and snapshot history by day."""
    from ..models import Snapshot
    rows = (db.query(Task, Project.name).join(Project, Task.project_id == Project.id)
            .filter(Project.user_id == user.id, Task.deadline.isnot(None)).all())
    events = [{"type": "task", "id": t.id, "title": t.name, "date": iso(t.deadline),
               "status": t.status, "priority": t.priority, "projectId": t.project_id,
               "projectName": pname} for t, pname in rows]
    snaps = (db.query(Snapshot, Project.name).join(Project, Snapshot.project_id == Project.id)
             .filter(Project.user_id == user.id)
             .order_by(Snapshot.created_at.desc()).limit(120).all())
    events += [{"type": "snapshot", "id": s.id, "title": s.name, "date": iso(s.created_at),
                "projectId": s.project_id, "projectName": pname} for s, pname in snaps]
    return events
