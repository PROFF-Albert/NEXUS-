"""PRD §26 — Templates: reusable project scaffolds."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session as OrmSession

from .. import storage
from ..database import get_db
from ..deps import get_current_user, iso, log_activity, owned_project
from ..models import File, FileRevision, Folder, Note, Project, Task, Template, User

router = APIRouter(prefix="/api/templates", tags=["templates"])


def tpl_dto(t: Template) -> dict:
    p = t.payload or {}
    return {"id": t.id, "name": t.name, "description": t.description, "icon": t.icon,
            "color": t.color, "language": t.language, "framework": t.framework,
            "category": t.category, "builtin": t.builtin, "uses": t.uses,
            "contents": {"files": len(p.get("files", [])), "folders": len(p.get("folders", [])),
                         "tasks": len(p.get("tasks", [])), "docs": len(p.get("docs", []))},
            "createdAt": iso(t.created_at)}


@router.get("")
def list_templates(user: User = Depends(get_current_user), db: OrmSession = Depends(get_db)):
    rows = (db.query(Template).filter(or_(Template.user_id == user.id, Template.builtin == True))  # noqa: E712
            .order_by(Template.builtin.desc(), Template.uses.desc(), Template.name).all())
    return [tpl_dto(t) for t in rows]


def apply_template(db: OrmSession, user: User, project: Project, template_id: int) -> None:
    """Materialise a template into a freshly-created project."""
    t = db.get(Template, template_id)
    if not t or (t.user_id and t.user_id != user.id and not t.builtin):
        return
    payload = t.payload or {}
    project.language = project.language or t.language
    project.framework = project.framework or t.framework
    project.category = t.category or project.category

    folder_ids: dict[str, int] = {}
    for path in payload.get("folders", []):
        parent_id, built = None, ""
        for part in [p for p in path.strip("/").split("/") if p]:
            built = f"{built}/{part}"
            if built not in folder_ids:
                row = Folder(project_id=project.id, parent_id=parent_id, name=part,
                             path=f"{built}/")
                db.add(row)
                db.flush()
                folder_ids[built] = row.id
            parent_id = folder_ids[built]

    for spec in payload.get("files", []):
        full = spec["path"].strip("/")
        folder_key = "/" + "/".join(full.split("/")[:-1]) if "/" in full else ""
        name = full.split("/")[-1]
        content = spec.get("content", "").replace("{{PROJECT_NAME}}", project.name)
        sha, size, _ = storage.put_bytes(content.encode())
        ext, kind, mime = storage.classify(name)
        f = File(project_id=project.id, folder_id=folder_ids.get(folder_key),
                 name=name, path=(folder_key + "/") if folder_key else "/",
                 extension=ext, kind=kind, mime=mime, size=size, sha256=sha, blob_key=sha)
        db.add(f)
        db.flush()
        db.add(FileRevision(file_id=f.id, version=1, blob_key=sha, size=size,
                            sha256=sha, note=f"from template {t.name}"))

    for task in payload.get("tasks", []):
        db.add(Task(project_id=project.id, name=task["name"],
                    status=task.get("status", "Todo"), priority=task.get("priority", "Medium"),
                    labels=task.get("labels", [])))
    for doc in payload.get("docs", []):
        db.add(Note(project_id=project.id, user_id=user.id, title=doc["title"],
                    body=doc.get("body", "").replace("{{PROJECT_NAME}}", project.name),
                    category=doc.get("category", "README"), doc_type="doc"))

    t.uses += 1
    log_activity(db, user.id, "template.applied", t.name, project_id=project.id, icon="package")


class TemplateFromProject(BaseModel):
    project_id: int
    name: str
    description: str = ""
    include_files: bool = True
    include_tasks: bool = True
    include_docs: bool = True


@router.post("/from-project", status_code=201)
def create_from_project(payload: TemplateFromProject, user: User = Depends(get_current_user),
                        db: OrmSession = Depends(get_db)):
    p = owned_project(payload.project_id, db, user)
    data: dict = {"folders": [], "files": [], "tasks": [], "docs": []}
    if payload.include_files:
        data["folders"] = [d.path.rstrip("/") for d in db.query(Folder)
                           .filter(Folder.project_id == p.id, Folder.deleted == False).all()  # noqa: E712
                           if d.path.strip("/")]
        for f in db.query(File).filter(File.project_id == p.id, File.deleted == False,        # noqa: E712
                                       File.kind == "text").all():
            if f.size <= 256 * 1024:
                data["files"].append({"path": f"{f.path}{f.name}".replace("//", "/"),
                                      "content": storage.get_bytes(f.sha256).decode("utf-8", "replace")})
    if payload.include_tasks:
        data["tasks"] = [{"name": t.name, "status": "Todo", "priority": t.priority,
                          "labels": t.labels} for t in db.query(Task)
                         .filter(Task.project_id == p.id).all()]
    if payload.include_docs:
        data["docs"] = [{"title": n.title, "body": n.body, "category": n.category}
                        for n in db.query(Note).filter(Note.project_id == p.id,
                                                       Note.doc_type == "doc").all()]
    t = Template(user_id=user.id, name=payload.name, description=payload.description,
                 icon=p.icon, color=p.color, language=p.language, framework=p.framework,
                 category=p.category, payload=data)
    db.add(t)
    log_activity(db, user.id, "template.created", payload.name, icon="package")
    db.commit()
    db.refresh(t)
    return tpl_dto(t)


@router.delete("/{template_id}")
def delete_template(template_id: int, user: User = Depends(get_current_user),
                    db: OrmSession = Depends(get_db)):
    t = db.get(Template, template_id)
    if not t or t.builtin or t.user_id != user.id:
        raise HTTPException(404, "Template not found or read-only")
    db.delete(t)
    db.commit()
    return {"ok": True}
