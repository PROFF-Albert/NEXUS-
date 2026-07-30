"""Notes service."""
from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session as OrmSession

from ..core.exceptions import NotFoundError
from ..models import Note, Project, User
from .activity import record


def note_dto(note: Note) -> dict:
    return {
        "id": note.id,
        "projectId": note.project_id,
        "title": note.title,
        "body": note.body,
        "category": note.category,
        "docType": note.doc_type,
        "pinned": note.pinned,
        "checklist": note.checklist or [],
        "createdAt": note.created_at.isoformat() if note.created_at else None,
        "updatedAt": note.updated_at.isoformat() if note.updated_at else None,
    }


def create_note(db: OrmSession, user: User, data: dict) -> dict:
    note = Note(user_id=user.id, project_id=data.get("project_id"), title=data["title"],
                body=data.get("body", ""), category=data.get("category", "General"),
                doc_type=data.get("doc_type", "note"), pinned=bool(data.get("pinned", False)))
    db.add(note)
    db.flush()
    record(db, user_id=user.id, action="note.created", target=note.title,
           project_id=note.project_id, icon="file-text")
    db.commit()
    return note_dto(note)


def list_notes(db: OrmSession, user: User, project_id: int | None = None,
               doc_type: str | None = None) -> list[dict]:
    q = db.query(Note).filter(Note.user_id == user.id)
    if project_id is not None:
        q = q.filter(Note.project_id == project_id)
    if doc_type:
        q = q.filter(Note.doc_type == doc_type)
    rows = q.order_by(Note.pinned.desc(), Note.updated_at.desc()).all()
    return [note_dto(row) for row in rows]


def get_note(db: OrmSession, user: User, note_id: int) -> Note:
    note = db.get(Note, note_id)
    if not note or note.user_id != user.id:
        raise NotFoundError("Note not found")
    return note


def update_note(db: OrmSession, user: User, note_id: int, data: dict) -> dict:
    note = get_note(db, user, note_id)
    for key in ("title", "body", "category", "doc_type", "project_id"):
        if key in data and data[key] is not None:
            setattr(note, key, data[key])
    if "pinned" in data and data["pinned"] is not None:
        note.pinned = bool(data["pinned"])
    db.commit()
    record(db, user_id=user.id, action="note.updated", target=note.title,
           project_id=note.project_id, icon="edit-3")
    db.commit()
    return note_dto(note)


def delete_note(db: OrmSession, user: User, note_id: int) -> dict:
    note = get_note(db, user, note_id)
    title = note.title
    project_id = note.project_id
    db.delete(note)
    record(db, user_id=user.id, action="note.deleted", target=title,
           project_id=project_id, icon="trash-2")
    db.commit()
    return {"ok": True}


def search_notes(db: OrmSession, user: User, q: str, limit: int = 20) -> list[dict]:
    like = f"%{q}%"
    rows = (db.query(Note)
            .filter(Note.user_id == user.id,
                    or_(Note.title.ilike(like), Note.body.ilike(like)))
            .order_by(Note.updated_at.desc()).limit(limit).all())
    return [note_dto(row) for row in rows]

