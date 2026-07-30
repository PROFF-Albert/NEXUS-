"""Settings service."""
from __future__ import annotations

from sqlalchemy.orm import Session as OrmSession

from ..models import Setting, User
from .activity import record

DEFAULTS = {
    "appearance": {"theme": "dark", "accent": "#6366f1", "fontSize": 14,
                   "density": "comfortable", "glass": True, "animations": True},
    "editor": {"autosave": True, "autosaveDelayMs": 1200, "minimap": True,
               "lineNumbers": True, "wordWrap": False, "tabSize": 2},
    "backup": {"auto": True, "frequency": "daily", "keepLast": 10,
               "storageLocation": "local"},
    "notifications": {"snapshot": True, "storage": True, "tasks": True,
                      "deployments": True, "sound": False},
    "security": {"autoLogoutMinutes": 720, "vaultLockMinutes": 15, "clipboardClearSeconds": 30},
    "general": {"language": "en", "startPage": "dashboard", "confirmDeletes": True},
}


def get_settings(db: OrmSession, user: User) -> dict:
    rows = {row.key: row.value for row in db.query(Setting).filter(Setting.user_id == user.id).all()}
    return {key: {**value, **(rows.get(key) or {})} for key, value in DEFAULTS.items()}


def update_setting(db: OrmSession, user: User, key: str, value: dict) -> dict:
    row = db.query(Setting).filter(Setting.user_id == user.id, Setting.key == key).first()
    if row:
        row.value = {**(row.value or {}), **value}
    else:
        row = Setting(user_id=user.id, key=key, value=value)
        db.add(row)
    record(db, user_id=user.id, action="settings.changed", target=key, icon="sliders")
    db.commit()
    return get_settings(db, user)

