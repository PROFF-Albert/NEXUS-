"""PRD §31 — AI Assistant endpoints."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session as OrmSession

from .. import ai
from ..config import OPENAI_API_KEY
from ..database import get_db
from ..deps import get_current_user, log_activity, owned_project
from ..models import Note, User

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/capabilities")
def capabilities():
    return {"capabilities": ai.CAPABILITIES,
            "engine": "openai" if OPENAI_API_KEY else "local",
            "model": ai.OPENAI_MODEL if OPENAI_API_KEY else "nexus-local-analysis"}


class AskIn(BaseModel):
    prompt: str = ""
    action: str = "chat"
    project_id: Optional[int] = None
    file_id: Optional[int] = None
    history: list = []


@router.post("/ask")
def ask(payload: AskIn, user: User = Depends(get_current_user),
        db: OrmSession = Depends(get_db)):
    project = owned_project(payload.project_id, db, user) if payload.project_id else None
    result = ai.run(db, project, payload.action, payload.prompt, payload.file_id, payload.history)
    log_activity(db, user.id, "ai.used", payload.action,
                 project_id=project.id if project else None,
                 detail=result["engine"], icon="sparkles")
    db.commit()
    return result


class SaveDocIn(BaseModel):
    project_id: int
    title: str
    body: str
    category: str = "README"


@router.post("/save-doc", status_code=201)
def save_doc(payload: SaveDocIn, user: User = Depends(get_current_user),
             db: OrmSession = Depends(get_db)):
    """Persist an AI answer straight into project Documentation."""
    owned_project(payload.project_id, db, user)
    n = Note(user_id=user.id, project_id=payload.project_id, title=payload.title,
             body=payload.body, category=payload.category, doc_type="doc")
    db.add(n)
    log_activity(db, user.id, "doc.created", payload.title, project_id=payload.project_id,
                 detail="via AI Assistant", icon="sparkles")
    db.commit()
    db.refresh(n)
    return {"id": n.id, "title": n.title}
