"""Task service."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session as OrmSession

from ..core.exceptions import NotFoundError, ValidationError
from ..models import Project, Task, User
from .activity import record

STATUSES = ["Todo", "In Progress", "Blocked", "Testing", "Done"]
PRIORITIES = ["Low", "Medium", "High", "Critical"]


def task_dto(task: Task) -> dict:
    return {
        "id": task.id,
        "projectId": task.project_id,
        "parentId": task.parent_id,
        "name": task.name,
        "detail": task.detail,
        "status": task.status,
        "priority": task.priority,
        "deadline": task.deadline.isoformat() if task.deadline else None,
        "reminder": task.reminder.isoformat() if task.reminder else None,
        "progress": task.progress,
        "labels": task.labels or [],
        "dependsOn": task.depends_on or [],
        "attachments": task.attachments or [],
        "orderIndex": task.order_index,
        "completedAt": task.completed_at.isoformat() if task.completed_at else None,
        "createdAt": task.created_at.isoformat() if task.created_at else None,
        "updatedAt": task.updated_at.isoformat() if task.updated_at else None,
    }


def _task_or_404(db: OrmSession, user: User, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise NotFoundError("Task not found")
    project = db.get(Project, task.project_id)
    if not project or project.user_id != user.id:
        raise NotFoundError("Task not found")
    return task


def create_task(db: OrmSession, user: User, data: dict) -> dict:
    project_id = data.get("project_id")
    if not project_id:
        raise ValidationError("project_id is required")
    project = db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise NotFoundError("Project not found")
    status = data.get("status", "Todo")
    if status not in STATUSES:
        raise ValidationError("Unsupported task status")
    priority = data.get("priority", "Medium")
    if priority not in PRIORITIES:
        raise ValidationError("Unsupported task priority")
    task = Task(project_id=project_id, parent_id=data.get("parent_id"), name=data["name"],
                detail=data.get("detail", ""), status=status, priority=priority,
                labels=data.get("labels", []), deadline=data.get("deadline"),
                reminder=data.get("reminder"), progress=int(data.get("progress", 0)),
                depends_on=data.get("depends_on", []), attachments=data.get("attachments", []))
    db.add(task)
    db.flush()
    record(db, user_id=user.id, action="task.created", target=task.name,
           project_id=project.id, icon="check-square")
    db.commit()
    return task_dto(task)


def list_tasks(db: OrmSession, user: User, project_id: int | None = None) -> list[dict]:
    q = db.query(Task).join(Project, Task.project_id == Project.id).filter(Project.user_id == user.id)
    if project_id is not None:
        q = q.filter(Task.project_id == project_id)
    rows = q.order_by(Task.order_index.asc(), Task.created_at.asc()).all()
    return [task_dto(row) for row in rows]


def update_task(db: OrmSession, user: User, task_id: int, data: dict) -> dict:
    task = _task_or_404(db, user, task_id)
    for key in ("name", "detail", "deadline", "reminder", "parent_id"):
        if key in data and data[key] is not None:
            setattr(task, key, data[key])
    if "status" in data and data["status"] is not None:
        if data["status"] not in STATUSES:
            raise ValidationError("Unsupported task status")
        task.status = data["status"]
        if task.status == "Done":
            task.completed_at = datetime.now(timezone.utc)
            task.progress = 100
    if "priority" in data and data["priority"] is not None:
        if data["priority"] not in PRIORITIES:
            raise ValidationError("Unsupported task priority")
        task.priority = data["priority"]
    if "labels" in data and data["labels"] is not None:
        task.labels = data["labels"]
    if "progress" in data and data["progress"] is not None:
        task.progress = max(0, min(100, int(data["progress"])))
    db.commit()
    record(db, user_id=user.id, action="task.updated", target=task.name,
           project_id=task.project_id, icon="edit-3")
    db.commit()
    return task_dto(task)


def delete_task(db: OrmSession, user: User, task_id: int) -> dict:
    task = _task_or_404(db, user, task_id)
    name = task.name
    project_id = task.project_id
    db.delete(task)
    record(db, user_id=user.id, action="task.deleted", target=name,
           project_id=project_id, icon="trash-2")
    db.commit()
    return {"ok": True}


def search_tasks(db: OrmSession, user: User, q: str, limit: int = 20) -> list[dict]:
    like = f"%{q}%"
    rows = (db.query(Task).join(Project, Task.project_id == Project.id)
            .filter(Project.user_id == user.id,
                    or_(Task.name.ilike(like), Task.detail.ilike(like)))
            .order_by(Task.updated_at.desc()).limit(limit).all())
    return [task_dto(row) for row in rows]

