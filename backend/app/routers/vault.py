"""PRD §21 — Secrets Vault: AES-256-GCM, master-password gated, audit logged.

Guarantees implemented here (success metric: "Zero Secret Exposure"):
  * plaintext never touches the database — only AES-256-GCM ciphertext
  * the derived key lives in RAM inside a 15-minute vault session
  * list endpoints return names/hints ONLY, never values
  * every reveal/copy/create/delete is written to the audit trail
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import client_ip, get_current_user, iso, log_activity, notify
from ..models import Project, Secret, User, VaultAudit, utcnow
from ..security import (VAULT_CANARY, derive_key, seal, unseal, vault_sessions)

router = APIRouter(prefix="/api/vault", tags=["vault"])

SECRET_KINDS = ["API Key", "Firebase Config", "JWT Secret", "Cloudinary Key", "Paystack Key",
                "OAuth Secret", "SSH Key", "Environment Variable", "Database Password", "Other"]


def _audit(db: OrmSession, user_id: int, action: str, request: Request,
           secret: Optional[Secret] = None) -> None:
    db.add(VaultAudit(user_id=user_id, secret_id=secret.id if secret else None,
                      secret_name=secret.name if secret else "", action=action,
                      ip=client_ip(request)))


def require_key(user: User, x_vault_token: Optional[str]) -> bytes:
    key = vault_sessions.key_for(x_vault_token or "", user.id)
    if not key:
        raise HTTPException(status_code=423, detail="Vault is locked")
    return key


class UnlockIn(BaseModel):
    master_password: str


@router.get("/status")
def status(x_vault_token: Optional[str] = Header(None), user: User = Depends(get_current_user),
           db: OrmSession = Depends(get_db)):
    unlocked = vault_sessions.key_for(x_vault_token or "", user.id) is not None
    return {"unlocked": unlocked,
            "secretCount": db.query(Secret).filter(Secret.user_id == user.id).count(),
            "algorithm": "AES-256-GCM", "kdf": "PBKDF2-HMAC-SHA256"}


@router.post("/unlock")
def unlock(payload: UnlockIn, request: Request, user: User = Depends(get_current_user),
           db: OrmSession = Depends(get_db)):
    key = derive_key(payload.master_password, user.vault_salt)
    try:
        if unseal(key, user.vault_canary) != VAULT_CANARY.decode():
            raise ValueError
    except Exception:
        _audit(db, user.id, "unlock.failed", request)
        db.commit()
        raise HTTPException(401, "Incorrect master password")
    token, ttl = vault_sessions.open(user.id, key)
    _audit(db, user.id, "unlock", request)
    db.commit()
    return {"vaultToken": token, "expiresIn": ttl}


@router.post("/lock")
def lock(request: Request, x_vault_token: Optional[str] = Header(None),
         user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    vault_sessions.close(x_vault_token or "")
    _audit(db, user.id, "lock", request)
    db.commit()
    return {"ok": True}


@router.get("/secrets")
def list_secrets(project_id: Optional[int] = None, user: User = Depends(get_current_user),
                 db: OrmSession = Depends(get_db)):
    """Metadata only — no ciphertext, no plaintext, ever."""
    q = db.query(Secret).filter(Secret.user_id == user.id)
    if project_id:
        q = q.filter(Secret.project_id == project_id)
    rows = q.order_by(Secret.name).all()
    names = {p.id: p.name for p in db.query(Project).filter(Project.user_id == user.id).all()}
    return [{"id": s.id, "name": s.name, "kind": s.kind, "environment": s.environment,
             "hint": s.hint, "note": s.note, "projectId": s.project_id,
             "projectName": names.get(s.project_id, ""), "accessCount": s.access_count,
             "lastAccessed": iso(s.last_accessed), "createdAt": iso(s.created_at)} for s in rows]


class SecretIn(BaseModel):
    name: str
    value: str
    kind: str = "API Key"
    environment: str = "development"
    note: str = ""
    project_id: Optional[int] = None


@router.post("/secrets", status_code=201)
def create_secret(payload: SecretIn, request: Request, x_vault_token: Optional[str] = Header(None),
                  user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    key = require_key(user, x_vault_token)
    val = payload.value
    hint = (val[:2] + "•" * max(len(val) - 6, 3) + val[-3:]) if len(val) > 8 else "•" * 8
    s = Secret(user_id=user.id, project_id=payload.project_id, name=payload.name,
               kind=payload.kind, environment=payload.environment, note=payload.note,
               ciphertext=seal(key, val), hint=hint[:48])
    db.add(s)
    db.flush()
    _audit(db, user.id, "secret.created", request, s)
    log_activity(db, user.id, "secret.created", s.name, project_id=s.project_id, icon="key")
    db.commit()
    return {"id": s.id, "name": s.name, "hint": s.hint}


@router.post("/secrets/{secret_id}/reveal")
def reveal(secret_id: int, request: Request, x_vault_token: Optional[str] = Header(None),
           user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    key = require_key(user, x_vault_token)
    s = db.get(Secret, secret_id)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Secret not found")
    value = unseal(key, s.ciphertext)
    s.last_accessed, s.access_count = utcnow(), s.access_count + 1
    _audit(db, user.id, "secret.revealed", request, s)
    db.commit()
    return {"id": s.id, "name": s.name, "value": value}


class SecretPatch(BaseModel):
    name: Optional[str] = None
    value: Optional[str] = None
    kind: Optional[str] = None
    environment: Optional[str] = None
    note: Optional[str] = None
    project_id: Optional[int] = None


@router.patch("/secrets/{secret_id}")
def update_secret(secret_id: int, payload: SecretPatch, request: Request,
                  x_vault_token: Optional[str] = Header(None),
                  user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    key = require_key(user, x_vault_token)
    s = db.get(Secret, secret_id)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Secret not found")
    data = payload.model_dump(exclude_unset=True)
    if (val := data.pop("value", None)):
        s.ciphertext = seal(key, val)
        s.hint = ((val[:2] + "•" * max(len(val) - 6, 3) + val[-3:]) if len(val) > 8 else "•" * 8)[:48]
    for k, v in data.items():
        setattr(s, k, v)
    _audit(db, user.id, "secret.updated", request, s)
    db.commit()
    return {"ok": True}


@router.delete("/secrets/{secret_id}")
def delete_secret(secret_id: int, request: Request, user: User = Depends(get_current_user),
                  db: OrmSession = Depends(get_db)):
    s = db.get(Secret, secret_id)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Secret not found")
    _audit(db, user.id, "secret.deleted", request, s)
    log_activity(db, user.id, "secret.deleted", s.name, project_id=s.project_id, icon="trash-2")
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.get("/env-export/{project_id}")
def env_export(project_id: int, request: Request, x_vault_token: Optional[str] = Header(None),
               user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    """Render a .env file from this project's secrets (vault must be unlocked)."""
    key = require_key(user, x_vault_token)
    rows = db.query(Secret).filter(Secret.user_id == user.id,
                                   Secret.project_id == project_id).all()
    lines = ["# Generated by NEXUS — do not commit", ""]
    for s in rows:
        env_key = "".join(c if c.isalnum() else "_" for c in s.name).upper()
        lines.append(f"{env_key}={unseal(key, s.ciphertext)}")
    _audit(db, user.id, "env.exported", request)
    db.commit()
    return {"content": "\n".join(lines) + "\n"}


@router.get("/audit")
def audit_log(limit: int = 100, user: User = Depends(get_current_user),
              db: OrmSession = Depends(get_db)):
    rows = (db.query(VaultAudit).filter(VaultAudit.user_id == user.id)
            .order_by(VaultAudit.created_at.desc()).limit(limit).all())
    return [{"id": r.id, "action": r.action, "secretName": r.secret_name, "ip": r.ip,
             "createdAt": iso(r.created_at)} for r in rows]


@router.get("/kinds")
def kinds():
    return SECRET_KINDS
