"""PRD §22 Database Manager, §23 API Manager, §24 Deployments."""
from __future__ import annotations

import json
import socket
import time
import urllib.error
import urllib.request
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..deps import get_current_user, iso, log_activity, notify, owned_project
from ..models import ApiEntry, DatabaseConnection, Deployment, User, utcnow

router = APIRouter(prefix="/api", tags=["integrations"])

PROVIDERS_DB = ["MySQL", "PostgreSQL", "SQLite", "MongoDB", "Firebase", "Supabase", "SQL Server"]
DEFAULT_PORTS = {"MySQL": 3306, "PostgreSQL": 5432, "SQLite": 0, "MongoDB": 27017,
                 "Firebase": 443, "Supabase": 5432, "SQL Server": 1433}
PROVIDERS_HOST = ["Netlify", "Vercel", "Railway", "Render", "Firebase", "AWS", "Azure", "DigitalOcean"]


# --------------------------------------------------------------------------- #
# Databases
# --------------------------------------------------------------------------- #
def db_dto(d: DatabaseConnection) -> dict:
    return {"id": d.id, "projectId": d.project_id, "name": d.name, "provider": d.provider,
            "host": d.host, "port": d.port, "username": d.username, "database": d.database,
            "passwordSecretId": d.password_secret_id, "schema": d.schema_json or [],
            "backups": d.backups or [], "lastTest": d.last_test or {},
            "createdAt": iso(d.created_at)}


class DbIn(BaseModel):
    model_config = {"protected_namespaces": ()}

    name: str
    provider: str = "PostgreSQL"
    host: str = "localhost"
    port: Optional[int] = None
    username: str = ""
    database: str = ""
    password_secret_id: Optional[int] = None
    schema_json: list = []  # noqa: RUF012


@router.get("/projects/{project_id}/databases")
def list_dbs(project_id: int, user: User = Depends(get_current_user),
             db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    return [db_dto(d) for d in db.query(DatabaseConnection)
            .filter(DatabaseConnection.project_id == project_id).all()]


@router.post("/projects/{project_id}/databases", status_code=201)
def create_db(project_id: int, payload: DbIn, user: User = Depends(get_current_user),
              db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    data = payload.model_dump()
    data["port"] = data["port"] or DEFAULT_PORTS.get(payload.provider, 5432)
    row = DatabaseConnection(project_id=project_id, **data)
    db.add(row)
    log_activity(db, user.id, "database.added", payload.name, project_id=project_id, icon="database")
    db.commit()
    db.refresh(row)
    return db_dto(row)


@router.patch("/databases/{db_id}")
def update_db(db_id: int, payload: dict, user: User = Depends(get_current_user),
              db: OrmSession = Depends(get_db)):
    row = db.get(DatabaseConnection, db_id)
    if not row:
        raise HTTPException(404, "Connection not found")
    owned_project(row.project_id, db, user)
    for k, v in payload.items():
        if hasattr(row, k):
            setattr(row, k, v)
    db.commit()
    return db_dto(row)


@router.delete("/databases/{db_id}")
def delete_db(db_id: int, user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    row = db.get(DatabaseConnection, db_id)
    if not row:
        raise HTTPException(404, "Connection not found")
    owned_project(row.project_id, db, user)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/databases/{db_id}/test")
def test_db(db_id: int, user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    """Real TCP reachability check against host:port."""
    row = db.get(DatabaseConnection, db_id)
    if not row:
        raise HTTPException(404, "Connection not found")
    owned_project(row.project_id, db, user)
    started = time.perf_counter()
    if row.provider == "SQLite":
        result = {"ok": True, "message": "SQLite is file-based — no network check required"}
    else:
        try:
            with socket.create_connection((row.host, row.port), timeout=4):
                result = {"ok": True, "message": f"TCP handshake to {row.host}:{row.port} succeeded"}
        except Exception as exc:
            result = {"ok": False, "message": f"{type(exc).__name__}: {exc}"}
    result["latencyMs"] = round((time.perf_counter() - started) * 1000, 1)
    result["at"] = iso(utcnow())
    row.last_test = result
    db.commit()
    return result


# --------------------------------------------------------------------------- #
# APIs
# --------------------------------------------------------------------------- #
def api_dto(a: ApiEntry) -> dict:
    return {"id": a.id, "projectId": a.project_id, "collection": a.collection, "name": a.name,
            "kind": a.kind, "method": a.method, "url": a.url, "headers": a.headers or {},
            "body": a.body, "auth": a.auth or {}, "variables": a.variables or {},
            "lastResponse": a.last_response or {}, "createdAt": iso(a.created_at)}


class ApiIn(BaseModel):
    name: str
    collection: str = "Default"
    kind: str = "REST"
    method: str = "GET"
    url: str = ""
    headers: dict = {}
    body: str = ""
    auth: dict = {}
    variables: dict = {}


@router.get("/projects/{project_id}/apis")
def list_apis(project_id: int, user: User = Depends(get_current_user),
              db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    return [api_dto(a) for a in db.query(ApiEntry)
            .filter(ApiEntry.project_id == project_id)
            .order_by(ApiEntry.collection, ApiEntry.order_index, ApiEntry.id).all()]


@router.post("/projects/{project_id}/apis", status_code=201)
def create_api(project_id: int, payload: ApiIn, user: User = Depends(get_current_user),
               db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    row = ApiEntry(project_id=project_id, **payload.model_dump())
    db.add(row)
    log_activity(db, user.id, "api.added", payload.name, project_id=project_id, icon="git-branch")
    db.commit()
    db.refresh(row)
    return api_dto(row)


@router.patch("/apis/{api_id}")
def update_api(api_id: int, payload: dict, user: User = Depends(get_current_user),
               db: OrmSession = Depends(get_db)):
    row = db.get(ApiEntry, api_id)
    if not row:
        raise HTTPException(404, "Request not found")
    owned_project(row.project_id, db, user)
    for k, v in payload.items():
        if hasattr(row, k):
            setattr(row, k, v)
    db.commit()
    return api_dto(row)


@router.delete("/apis/{api_id}")
def delete_api(api_id: int, user: User = Depends(get_current_user),
               db: OrmSession = Depends(get_db)):
    row = db.get(ApiEntry, api_id)
    if not row:
        raise HTTPException(404, "Request not found")
    owned_project(row.project_id, db, user)
    db.delete(row)
    db.commit()
    return {"ok": True}


def _interpolate(text: str, variables: dict) -> str:
    for k, v in (variables or {}).items():
        text = text.replace("{{" + k + "}}", str(v))
    return text


@router.post("/apis/{api_id}/send")
def send_api(api_id: int, user: User = Depends(get_current_user),
             db: OrmSession = Depends(get_db)):
    """Execute the stored request server-side (no CORS problems)."""
    row = db.get(ApiEntry, api_id)
    if not row:
        raise HTTPException(404, "Request not found")
    owned_project(row.project_id, db, user)

    url = _interpolate(row.url, row.variables)
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "URL must start with http:// or https://")

    headers = {k: _interpolate(str(v), row.variables) for k, v in (row.headers or {}).items()}
    auth = row.auth or {}
    if auth.get("type") == "bearer" and auth.get("token"):
        headers["Authorization"] = f"Bearer {_interpolate(auth['token'], row.variables)}"
    elif auth.get("type") == "apikey" and auth.get("key"):
        headers[auth.get("header", "X-API-Key")] = _interpolate(auth["key"], row.variables)

    body = None
    if row.kind == "GraphQL":
        headers.setdefault("Content-Type", "application/json")
        body = json.dumps({"query": _interpolate(row.body, row.variables)}).encode()
        method = "POST"
    else:
        method = row.method.upper()
        if row.body and method in {"POST", "PUT", "PATCH", "DELETE"}:
            headers.setdefault("Content-Type", "application/json")
            body = _interpolate(row.body, row.variables).encode()

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read(2_000_000)
            result = {"status": resp.status, "headers": dict(resp.headers),
                      "body": raw.decode("utf-8", "replace"), "size": len(raw)}
    except urllib.error.HTTPError as exc:
        raw = exc.read(2_000_000)
        result = {"status": exc.code, "headers": dict(exc.headers or {}),
                  "body": raw.decode("utf-8", "replace"), "size": len(raw)}
    except Exception as exc:
        result = {"status": 0, "headers": {}, "body": f"{type(exc).__name__}: {exc}", "size": 0}
    result["timeMs"] = round((time.perf_counter() - started) * 1000, 1)
    result["at"] = iso(utcnow())
    row.last_response = result
    db.commit()
    return result


@router.post("/projects/{project_id}/apis/import")
def import_postman(project_id: int, payload: dict, user: User = Depends(get_current_user),
                   db: OrmSession = Depends(get_db)):
    """PRD §23 — Import Postman Collections (v2.1 schema)."""
    owned_project(project_id, db, user)
    collection_name = (payload.get("info") or {}).get("name", "Imported")
    imported = 0

    def walk(items, folder=""):
        nonlocal imported
        for item in items or []:
            if "item" in item:
                walk(item["item"], f"{folder}/{item.get('name','')}".strip("/"))
                continue
            req = item.get("request") or {}
            url = req.get("url")
            if isinstance(url, dict):
                url = url.get("raw", "")
            headers = {h.get("key"): h.get("value") for h in (req.get("header") or [])
                       if h.get("key")}
            body = ((req.get("body") or {}).get("raw")) or ""
            db.add(ApiEntry(project_id=project_id,
                            collection=folder or collection_name,
                            name=item.get("name", "Request"),
                            method=(req.get("method") or "GET").upper(),
                            url=url or "", headers=headers, body=body))
            imported += 1

    walk(payload.get("item"))
    log_activity(db, user.id, "api.imported", collection_name, project_id=project_id,
                 detail=f"{imported} requests", icon="download")
    db.commit()
    return {"imported": imported, "collection": collection_name}


@router.get("/projects/{project_id}/apis/export")
def export_postman(project_id: int, user: User = Depends(get_current_user),
                   db: OrmSession = Depends(get_db)):
    p = owned_project(project_id, db, user)
    rows = db.query(ApiEntry).filter(ApiEntry.project_id == project_id).all()
    return {
        "info": {"name": f"{p.name} — NEXUS export",
                 "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
        "item": [{"name": a.name,
                  "request": {"method": a.method, "url": {"raw": a.url},
                              "header": [{"key": k, "value": v} for k, v in (a.headers or {}).items()],
                              "body": {"mode": "raw", "raw": a.body} if a.body else None}}
                 for a in rows],
    }


# --------------------------------------------------------------------------- #
# Deployments
# --------------------------------------------------------------------------- #
def dep_dto(d: Deployment) -> dict:
    return {"id": d.id, "projectId": d.project_id, "environment": d.environment,
            "provider": d.provider, "url": d.url, "commit": d.commit, "status": d.status,
            "durationS": d.duration_s, "logs": d.logs, "envVars": d.env_vars or {},
            "active": d.active, "createdAt": iso(d.created_at)}


class DeployIn(BaseModel):
    environment: str = "production"
    provider: str = "Vercel"
    url: str = ""
    commit: str = ""
    status: str = "success"
    duration_s: float = 0
    logs: str = ""
    env_vars: dict = {}


@router.get("/projects/{project_id}/deployments")
def list_deps(project_id: int, user: User = Depends(get_current_user),
              db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    return [dep_dto(d) for d in db.query(Deployment)
            .filter(Deployment.project_id == project_id)
            .order_by(Deployment.created_at.desc()).all()]


@router.post("/projects/{project_id}/deployments", status_code=201)
def create_dep(project_id: int, payload: DeployIn, user: User = Depends(get_current_user),
               db: OrmSession = Depends(get_db)):
    owned_project(project_id, db, user)
    for old in db.query(Deployment).filter(Deployment.project_id == project_id,
                                           Deployment.environment == payload.environment).all():
        old.active = False
    row = Deployment(project_id=project_id, active=True, **payload.model_dump())
    db.add(row)
    log_activity(db, user.id, "deployment.created", f"{payload.provider} · {payload.environment}",
                 project_id=project_id, detail=payload.url, icon="cloud")
    if payload.status == "failed":
        notify(db, user.id, "Deployment failed", f"{payload.provider} · {payload.environment}",
               level="error", icon="cloud-off", link=f"/projects/{project_id}?tab=deployments")
    else:
        notify(db, user.id, "Deployment finished", payload.url or payload.provider,
               level="success", icon="cloud", link=f"/projects/{project_id}?tab=deployments")
    db.commit()
    db.refresh(row)
    return dep_dto(row)


@router.post("/deployments/{dep_id}/rollback")
def rollback(dep_id: int, user: User = Depends(get_current_user),
             db: OrmSession = Depends(get_db)):
    row = db.get(Deployment, dep_id)
    if not row:
        raise HTTPException(404, "Deployment not found")
    owned_project(row.project_id, db, user)
    for other in db.query(Deployment).filter(Deployment.project_id == row.project_id,
                                             Deployment.environment == row.environment).all():
        other.active = False
    clone = Deployment(project_id=row.project_id, environment=row.environment,
                       provider=row.provider, url=row.url, commit=row.commit,
                       status="success", duration_s=row.duration_s, active=True,
                       env_vars=row.env_vars,
                       logs=f"↩ Rolled back to deployment #{row.id} ({iso(row.created_at)})\n{row.logs}")
    db.add(clone)
    log_activity(db, user.id, "deployment.rollback", row.url or row.provider,
                 project_id=row.project_id, icon="rotate-ccw")
    db.commit()
    db.refresh(clone)
    return dep_dto(clone)


@router.delete("/deployments/{dep_id}")
def delete_dep(dep_id: int, user: User = Depends(get_current_user),
               db: OrmSession = Depends(get_db)):
    row = db.get(Deployment, dep_id)
    if not row:
        raise HTTPException(404, "Deployment not found")
    owned_project(row.project_id, db, user)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/providers")
def providers():
    return {"databases": PROVIDERS_DB, "hosting": PROVIDERS_HOST, "defaultPorts": DEFAULT_PORTS}
