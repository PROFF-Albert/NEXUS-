"""Note routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas.notes import NoteCreate, NoteUpdate
from ..services import notes as svc

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get("")
def list_notes(project_id: int | None = None, doc_type: str | None = None,
               user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    return svc.list_notes(db, user, project_id, doc_type)


@router.post("", status_code=201)
def create_note(payload: NoteCreate, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    data = payload.model_dump()
    data["doc_type"] = "note"
    return svc.create_note(db, user, data)


@router.get("/{note_id}")
def get_note(note_id: int, user: User = Depends(get_current_user),
             db: OrmSession = Depends(get_db)):
    return svc.note_dto(svc.get_note(db, user, note_id))


@router.patch("/{note_id}")
def update_note(note_id: int, payload: NoteUpdate, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    return svc.update_note(db, user, note_id, payload.model_dump(exclude_unset=True))


@router.delete("/{note_id}")
def delete_note(note_id: int, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    return svc.delete_note(db, user, note_id)

