"""PRD §16 Notes and §18 Documentation (same store, discriminated by doc_type)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import get_current_user, iso, log_activity, owned_project
from ..models import Note, User

router = APIRouter(prefix="/api", tags=["notes"])

DOC_SECTIONS = ["README", "Installation", "Architecture", "Deployment Guide",
                "API Docs", "Changelog", "Roadmap", "Meeting Notes"]


def note_dto(n: Note) -> dict:
    return {"id": n.id, "projectId": n.project_id, "title": n.title, "body": n.body,
            "category": n.category, "docType": n.doc_type, "pinned": n.pinned,
            "checklist": n.checklist or [], "createdAt": iso(n.created_at),
            "updatedAt": iso(n.updated_at)}


class NoteIn(BaseModel):
    title: str = "Untitled note"
    body: str = ""
    category: str = "General"
    doc_type: str = "note"
    pinned: bool = False
    checklist: list = []
    project_id: Optional[int] = None


class NotePatch(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None
    pinned: Optional[bool] = None
    checklist: Optional[list] = None


@router.get("/notes")
def list_notes(project_id: Optional[int] = None, doc_type: str = "note",
               q: Optional[str] = None, user: User = Depends(get_current_user),
               db: OrmSession = Depends(get_db)):
    query = db.query(Note).filter(Note.user_id == user.id, Note.doc_type == doc_type)
    if project_id:
        query = query.filter(Note.project_id == project_id)
    elif project_id == 0:
        query = query.filter(Note.project_id.is_(None))
    if q:
        like = f"%{q}%"
        query = query.filter(Note.title.ilike(like) | Note.body.ilike(like))
    return [note_dto(n) for n in query.order_by(Note.pinned.desc(), Note.updated_at.desc()).all()]


@router.post("/notes", status_code=201)
def create_note(payload: NoteIn, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    if payload.project_id:
        owned_project(payload.project_id, db, user)
    n = Note(user_id=user.id, **payload.model_dump())
    db.add(n)
    log_activity(db, user.id, "note.created" if payload.doc_type == "note" else "doc.created",
                 payload.title, project_id=payload.project_id, icon="file-text")
    db.commit()
    db.refresh(n)
    return note_dto(n)


@router.patch("/notes/{note_id}")
def update_note(note_id: int, payload: NotePatch, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    n = db.get(Note, note_id)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Note not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(n, k, v)
    db.commit()
    return note_dto(n)


@router.delete("/notes/{note_id}")
def delete_note(note_id: int, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    n = db.get(Note, note_id)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Note not found")
    db.delete(n)
    db.commit()
    return {"ok": True}


@router.get("/doc-sections")
def doc_sections():
    return DOC_SECTIONS
