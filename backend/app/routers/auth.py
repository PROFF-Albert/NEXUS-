"""PRD §32 — Security: password login, 2FA, session management, auto logout."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import client_ip, get_current_user, iso, log_activity
from ..models import Session, User, utcnow
from ..security import (create_access_token, hash_password, new_salt, new_session_id,
                        new_totp_secret, seal, derive_key, totp_uri, totp_verify,
                        vault_sessions, verify_password, VAULT_CANARY)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str
    totp: Optional[str] = None


class RegisterIn(BaseModel):
    email: str
    name: str = "Developer"
    password: str
    master_password: str


def _user_dto(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "avatarColor": u.avatar_color,
            "totpEnabled": u.totp_enabled, "lastLogin": iso(u.last_login),
            "createdAt": iso(u.created_at)}


@router.post("/register")
def register(payload: RegisterIn, request: Request, db: OrmSession = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    salt = new_salt()
    key = derive_key(payload.master_password, salt)
    user = User(email=payload.email.lower(), name=payload.name,
                password_hash=hash_password(payload.password),
                vault_salt=salt, vault_canary=seal(key, VAULT_CANARY.decode()))
    db.add(user)
    db.commit()
    db.refresh(user)

    from ..seed import bootstrap_user
    bootstrap_user(db, user)

    sid = new_session_id()
    db.add(Session(id=sid, user_id=user.id, ip=client_ip(request),
                   user_agent=request.headers.get("user-agent", "")[:250]))
    user.last_login = utcnow()
    log_activity(db, user.id, "account.created", user.email, icon="user")
    db.commit()
    return {"token": create_access_token(user.id, sid), "user": _user_dto(user)}


@router.post("/login")
def login(payload: LoginIn, request: Request, db: OrmSession = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if user.totp_enabled:
        if not payload.totp:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "2FA code required")
        if not totp_verify(user.totp_secret or "", payload.totp):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid 2FA code")

    sid = new_session_id()
    db.add(Session(id=sid, user_id=user.id, ip=client_ip(request),
                   user_agent=request.headers.get("user-agent", "")[:250]))
    user.last_login = utcnow()
    log_activity(db, user.id, "auth.login", user.email, icon="log-in")
    db.commit()
    return {"token": create_access_token(user.id, sid), "user": _user_dto(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return _user_dto(user)


@router.post("/logout")
def logout(request: Request, user: User = Depends(get_current_user),
           db: OrmSession = Depends(get_db)):
    sid = getattr(request.state, "session_id", None)
    if sid and (s := db.get(Session, sid)):
        s.revoked = True
    vault_sessions.close_user(user.id)
    db.commit()
    return {"ok": True}


@router.get("/sessions")
def list_sessions(request: Request, user: User = Depends(get_current_user),
                  db: OrmSession = Depends(get_db)):
    current = getattr(request.state, "session_id", None)
    rows = (db.query(Session).filter(Session.user_id == user.id, Session.revoked == False)  # noqa: E712
            .order_by(Session.last_seen.desc()).all())
    return [{"id": s.id, "ip": s.ip, "userAgent": s.user_agent, "createdAt": iso(s.created_at),
             "lastSeen": iso(s.last_seen), "current": s.id == current} for s in rows]


@router.delete("/sessions/{session_id}")
def revoke_session(session_id: str, user: User = Depends(get_current_user),
                   db: OrmSession = Depends(get_db)):
    s = db.get(Session, session_id)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Session not found")
    s.revoked = True
    db.commit()
    return {"ok": True}


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.post("/password")
def change_password(payload: PasswordChange, user: User = Depends(get_current_user),
                    db: OrmSession = Depends(get_db)):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    log_activity(db, user.id, "auth.password_changed", user.email, icon="key")
    db.commit()
    return {"ok": True}


@router.post("/2fa/setup")
def setup_2fa(user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    secret = new_totp_secret()
    user.totp_secret = secret
    db.commit()
    return {"secret": secret, "uri": totp_uri(secret, user.email)}


class TotpIn(BaseModel):
    code: str


@router.post("/2fa/enable")
def enable_2fa(payload: TotpIn, user: User = Depends(get_current_user),
               db: OrmSession = Depends(get_db)):
    if not user.totp_secret or not totp_verify(user.totp_secret, payload.code):
        raise HTTPException(400, "Invalid code")
    user.totp_enabled = True
    log_activity(db, user.id, "auth.2fa_enabled", user.email, icon="shield")
    db.commit()
    return {"ok": True}


@router.post("/2fa/disable")
def disable_2fa(payload: TotpIn, user: User = Depends(get_current_user),
                db: OrmSession = Depends(get_db)):
    if user.totp_enabled and not totp_verify(user.totp_secret or "", payload.code):
        raise HTTPException(400, "Invalid code")
    user.totp_enabled = False
    user.totp_secret = None
    log_activity(db, user.id, "auth.2fa_disabled", user.email, icon="shield-off")
    db.commit()
    return {"ok": True}


class ProfileIn(BaseModel):
    name: Optional[str] = None
    avatar_color: Optional[str] = None


@router.patch("/profile")
def update_profile(payload: ProfileIn, user: User = Depends(get_current_user),
                   db: OrmSession = Depends(get_db)):
    if payload.name:
        user.name = payload.name
    if payload.avatar_color:
        user.avatar_color = payload.avatar_color
    db.commit()
    return _user_dto(user)
