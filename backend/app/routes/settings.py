"""Settings routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas.settings import SettingUpdate
from ..services import settings as svc

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings(user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    return svc.get_settings(db, user)


@router.put("")
def put_setting(payload: SettingUpdate, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    return svc.update_setting(db, user, payload.key, payload.value)

