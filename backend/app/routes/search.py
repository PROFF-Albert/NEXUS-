"""Global search routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..services.search import global_search

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search")
def search(q: str = Query(..., min_length=1), limit: int = 20,
           user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    return global_search(db, user, q, limit)

