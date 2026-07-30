"""Task routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas.tasks import TaskCreate, TaskUpdate
from ..services import tasks as svc

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("")
def list_tasks(project_id: int | None = None, user: User = Depends(get_current_user),
               db: OrmSession = Depends(get_db)):
    return svc.list_tasks(db, user, project_id)


@router.post("", status_code=201)
def create_task(payload: TaskCreate, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    return svc.create_task(db, user, payload.model_dump())


@router.get("/{task_id}")
def get_task(task_id: int, user: User = Depends(get_current_user),
             db: OrmSession = Depends(get_db)):
    return svc.task_dto(svc._task_or_404(db, user, task_id))


@router.patch("/{task_id}")
def update_task(task_id: int, payload: TaskUpdate, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    return svc.update_task(db, user, task_id, payload.model_dump(exclude_unset=True))


@router.delete("/{task_id}")
def delete_task(task_id: int, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    return svc.delete_task(db, user, task_id)

