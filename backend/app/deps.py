"""Shared FastAPI dependencies + activity/notification helpers."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session as OrmSession

from .database import get_db
from .models import ActivityLog, Notification, Project, Session, User, utcnow
from .security import decode_token


def get_current_user(request: Request,
                     authorization: Optional[str] = Header(None),
                     db: OrmSession = Depends(get_db)) -> User:
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    elif request.query_params.get("token"):
        token = request.query_params["token"]        # media <img>/<video> tags
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    payload = decode_token(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")

    sess = db.get(Session, payload.get("sid", ""))
    if not sess or sess.revoked:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked")

    user = db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")

    sess.last_seen = utcnow()
    db.commit()
    request.state.session_id = sess.id
    return user


def owned_project(project_id: int, db: OrmSession, user: User) -> Project:
    proj = db.get(Project, project_id)
    if not proj or proj.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return proj


def log_activity(db: OrmSession, user_id: int, action: str, target: str = "",
                 project_id: int | None = None, detail: str = "", icon: str = "activity") -> None:
    db.add(ActivityLog(user_id=user_id, project_id=project_id, action=action,
                       target=target, detail=detail, icon=icon))


def notify(db: OrmSession, user_id: int, title: str, body: str = "",
           level: str = "info", icon: str = "bell", link: str = "") -> None:
    db.add(Notification(user_id=user_id, title=title, body=body,
                        level=level, icon=icon, link=link))


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()
