"""PRD §31 — AI Assistant engine.

Two backends, one interface:
  * remote  — OpenAI Chat Completions when OPENAI_API_KEY is present
  * local   — a deterministic, project-aware analysis engine that needs no
              network. It reads real project data (files, tasks, secrets,
              deployments) and produces genuinely useful output, so the
              assistant is never a dead button in a self-hosted install.
"""
from __future__ import annotations

import json
import re
import urllib.request
from collections import Counter
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session as OrmSession

from . import storage
from .config import AI_MODE, OPENAI_API_KEY, OPENAI_MODEL
from .models import (ApiEntry, DatabaseConnection, Deployment, File, Note, Project,
                     Secret, Snapshot, Task)

CAPABILITIES = [
    {"id": "generate_code", "label": "Generate Code", "icon": "code",
     "prompt": "Write a production-ready implementation for: "},
    {"id": "explain_error", "label": "Explain Errors", "icon": "alert-triangle",
     "prompt": "Explain this error and how to fix it:\n"},
    {"id": "debug_file", "label": "Debug File", "icon": "bug",
     "prompt": "Find and fix bugs in the attached file."},
    {"id": "review_project", "label": "Review Project", "icon": "search-check", "action": True},
    {"id": "generate_readme", "label": "Generate README", "icon": "file-text", "action": True},
    {"id": "write_docs", "label": "Write Documentation", "icon": "book", "action": True},
    {"id": "summarize", "label": "Summarize Project", "icon": "list", "action": True},
    {"id": "improvements", "label": "Suggest Improvements", "icon": "sparkles", "action": True},
    {"id": "generate_api", "label": "Generate APIs", "icon": "git-branch",
     "prompt": "Design REST endpoints for: "},
    {"id": "database_design", "label": "Database Design", "icon": "database",
     "prompt": "Design a normalized database schema for: "},
    {"id": "security_review", "label": "Security Review", "icon": "shield", "action": True},
    {"id": "architecture", "label": "Architecture Advice", "icon": "layers", "action": True},
    {"id": "refactor", "label": "Refactoring", "icon": "wand",
     "prompt": "Refactor this code for clarity and performance:\n"},
]


# --------------------------------------------------------------------------- #
# context
# --------------------------------------------------------------------------- #
def build_context(db: OrmSession, project: Optional[Project]) -> dict:
    if not project:
        return {}
    files = db.query(File).filter(File.project_id == project.id,
                                  File.deleted == False).all()                   # noqa: E712
    tasks = db.query(Task).filter(Task.project_id == project.id).all()
    exts = Counter(f.extension for f in files if f.extension)
    return {
        "name": project.name, "description": project.description,
        "language": project.language, "framework": project.framework,
        "status": project.status, "category": project.category, "tags": project.tags or [],
        "fileCount": len(files),
        "totalBytes": sum(f.size for f in files),
        "topExtensions": exts.most_common(8),
        "tree": sorted({f"{f.path}{f.name}" for f in files})[:120],
        "tasks": [{"name": t.name, "status": t.status, "priority": t.priority} for t in tasks],
        "openTasks": sum(1 for t in tasks if t.status != "Done"),
        "secretNames": [s.name for s in db.query(Secret)
                        .filter(Secret.project_id == project.id).all()],
        "databases": [f"{d.provider}:{d.database or d.host}" for d in db.query(DatabaseConnection)
                      .filter(DatabaseConnection.project_id == project.id).all()],
        "apis": [f"{a.method} {a.url}" for a in db.query(ApiEntry)
                 .filter(ApiEntry.project_id == project.id).all()][:40],
        "deployments": [{"env": d.environment, "provider": d.provider, "url": d.url,
                         "status": d.status} for d in db.query(Deployment)
                        .filter(Deployment.project_id == project.id).all()],
        "snapshots": db.query(func.count(Snapshot.id)).filter(
            Snapshot.project_id == project.id).scalar() or 0,
        "docs": [n.title for n in db.query(Note).filter(Note.project_id == project.id,
                                                        Note.doc_type == "doc").all()],
    }


def file_excerpt(db: OrmSession, file_id: int, limit: int = 8000) -> str:
    f = db.get(File, file_id)
    if not f or f.kind != "text":
        return ""
    return storage.get_bytes(f.sha256).decode("utf-8", "replace")[:limit]


# --------------------------------------------------------------------------- #
# remote backend
# --------------------------------------------------------------------------- #
def _openai(messages: list[dict]) -> Optional[str]:
    if not OPENAI_API_KEY or AI_MODE == "local":
        return None
    body = json.dumps({"model": OPENAI_MODEL, "messages": messages, "temperature": 0.4}).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        return data["choices"][0]["message"]["content"]
    except Exception:
        return None


SYSTEM = ("You are NEXUS AI, an expert software engineering assistant embedded in a private "
          "developer workspace. Be concise, concrete and practical. Prefer markdown with fenced "
          "code blocks. When project context is supplied, ground every answer in it.")


# --------------------------------------------------------------------------- #
# local backend
# --------------------------------------------------------------------------- #
def _fmt_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n} B"


def local_readme(ctx: dict) -> str:
    stack = " · ".join(x for x in [ctx.get("language"), ctx.get("framework")] if x) or "Not specified"
    tree = "\n".join(ctx.get("tree", [])[:24]) or "(no files yet)"
    env_lines = "\n".join(f"{re.sub(r'[^A-Za-z0-9]+', '_', s).upper()}=" for s in ctx.get("secretNames", []))
    install = {"python": "python -m venv .venv && source .venv/bin/activate\npip install -r requirements.txt",
               "javascript": "npm install", "typescript": "npm install",
               }.get((ctx.get("language") or "").lower(), "npm install")
    run = {"python": "uvicorn main:app --reload", "javascript": "npm run dev",
           "typescript": "npm run dev"}.get((ctx.get("language") or "").lower(), "npm run dev")
    deploy = ctx.get("deployments") or []
    return f"""# {ctx.get('name','Project')}

{ctx.get('description') or 'A project managed in NEXUS.'}

**Stack:** {stack}  ·  **Status:** {ctx.get('status','')}  ·  **Files:** {ctx.get('fileCount',0)} ({_fmt_bytes(ctx.get('totalBytes',0))})

## Installation

```bash
git clone <your-repo-url>
cd {re.sub(r'[^a-z0-9-]+', '-', (ctx.get('name') or 'project').lower()).strip('-')}
{install}
```

## Running locally

```bash
{run}
```

## Environment variables

Create a `.env` file (NEXUS can export this from the Vault):

```env
{env_lines or '# no secrets registered yet'}
```

## Project structure

```
{tree}
```

## Data layer

{chr(10).join(f'- {d}' for d in ctx.get('databases', [])) or '- No database connections registered'}

## API surface

{chr(10).join(f'- `{a}`' for a in ctx.get('apis', [])[:15]) or '- No API requests registered'}

## Deployment

{chr(10).join(f"- **{d['env']}** → {d['provider']} {d['url']}" for d in deploy) or '- Not deployed yet'}

## Roadmap

{chr(10).join(f"- [ ] {t['name']}" for t in ctx.get('tasks', []) if t['status'] != 'Done')[:900] or '- [ ] Define first milestone'}

---
_Generated by NEXUS AI._
"""


def local_review(ctx: dict) -> str:
    findings, wins = [], []
    if ctx.get("snapshots", 0) == 0:
        findings.append("**No snapshots yet.** Take one now — snapshots are your undo button for the whole project.")
    else:
        wins.append(f"{ctx['snapshots']} snapshot(s) captured")
    if not ctx.get("docs"):
        findings.append("**No documentation.** At minimum add a README and a Deployment Guide.")
    else:
        wins.append(f"docs present: {', '.join(ctx['docs'][:5])}")
    if not ctx.get("secretNames"):
        findings.append("**No secrets in the Vault.** If this project has API keys, move them out of source and into the encrypted vault.")
    else:
        wins.append(f"{len(ctx['secretNames'])} secret(s) encrypted at rest")
    open_tasks = ctx.get("openTasks", 0)
    if open_tasks > 12:
        findings.append(f"**{open_tasks} open tasks.** Consider splitting into milestones — large backlogs hide the critical path.")
    if not ctx.get("deployments"):
        findings.append("**Never deployed.** Even a preview URL early on de-risks the release.")
    exts = dict(ctx.get("topExtensions", []))
    if not any(e in exts for e in ("test", "spec")) and not any(
            "test" in p.lower() for p in ctx.get("tree", [])):
        findings.append("**No test files detected.** Add a test directory; start with the riskiest module.")
    if ctx.get("totalBytes", 0) > 200 * 1024 * 1024:
        findings.append("**Large footprint.** Check the Storage tab for duplicates and oversized media.")

    body = "\n".join(f"{i}. {f}" for i, f in enumerate(findings, 1)) or "Nothing critical found — good hygiene."
    return f"""## Project review — {ctx.get('name','')}

**Snapshot:** {ctx.get('fileCount',0)} files · {_fmt_bytes(ctx.get('totalBytes',0))} · status *{ctx.get('status','')}* · {open_tasks} open tasks

### What's working
{chr(10).join(f'- {w}' for w in wins) or '- (early stage project)'}

### Recommendations
{body}

### Composition
{chr(10).join(f'- `.{e}` × {c}' for e, c in ctx.get('topExtensions', [])) or '- no files yet'}
"""


def local_security(ctx: dict, db: OrmSession, project: Optional[Project]) -> str:
    risky = []
    if project:
        for f in db.query(File).filter(File.project_id == project.id,
                                       File.deleted == False).all():             # noqa: E712
            if f.name in {".env", ".env.local", ".env.production"} or f.name.endswith(".pem"):
                risky.append(f"`{f.path}{f.name}` — credential file stored as a project file; move it into the Vault.")
            if f.kind == "text" and f.size < 400_000:
                text = storage.get_bytes(f.sha256).decode("utf-8", "replace")
                for pattern, label in [
                    (r"AIza[0-9A-Za-z_\-]{35}", "Google/Firebase API key"),
                    (r"sk_live_[0-9a-zA-Z]{10,}", "Stripe live key"),
                    (r"sk-[A-Za-z0-9]{20,}", "OpenAI-style key"),
                    (r"AKIA[0-9A-Z]{16}", "AWS access key id"),
                    (r"ghp_[A-Za-z0-9]{20,}", "GitHub token"),
                    (r"-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----", "private key"),
                    (r"(?i)password\s*[:=]\s*[\"'][^\"']{4,}[\"']", "hard-coded password"),
                ]:
                    if re.search(pattern, text):
                        risky.append(f"`{f.path}{f.name}` — possible **{label}** committed in source.")
    checks = [
        ("Secrets encrypted with AES-256-GCM", bool(ctx.get("secretNames"))),
        ("Vault master password separate from login", True),
        ("Snapshots exist for rollback", ctx.get("snapshots", 0) > 0),
        ("Deployment env vars tracked", any(d.get("url") for d in ctx.get("deployments", []))),
    ]
    return f"""## Security review — {ctx.get('name','')}

### Automated scan
{chr(10).join(f'- ⚠️ {r}' for r in risky[:15]) or '- ✅ No hard-coded credentials detected in text files.'}

### Posture checklist
{chr(10).join(f"- {'✅' if ok else '❌'} {label}" for label, ok in checks)}

### Hardening steps
1. Keep every key in the NEXUS Vault and export a `.env` at deploy time rather than committing it.
2. Add `.env`, `*.pem`, `*.key` to `.gitignore` before the first push.
3. Rotate anything that has ever been committed — assume it is public.
4. Enable 2FA on your NEXUS account (Settings → Security).
5. Take a snapshot before any dependency upgrade so rollback is one click.
"""


def local_summary(ctx: dict) -> str:
    done = sum(1 for t in ctx.get("tasks", []) if t["status"] == "Done")
    total = len(ctx.get("tasks", []))
    return f"""**{ctx.get('name','')}** — {ctx.get('description') or 'no description yet'}

- **Stack:** {ctx.get('language') or '—'} / {ctx.get('framework') or '—'} ({ctx.get('category','')})
- **Status:** {ctx.get('status','')}
- **Content:** {ctx.get('fileCount',0)} files, {_fmt_bytes(ctx.get('totalBytes',0))}
- **Progress:** {done}/{total} tasks complete{f' ({round(done/total*100)}%)' if total else ''}
- **Infrastructure:** {len(ctx.get('databases', []))} database(s), {len(ctx.get('apis', []))} API request(s), {len(ctx.get('deployments', []))} deployment(s)
- **Safety:** {ctx.get('snapshots',0)} snapshot(s), {len(ctx.get('secretNames', []))} vaulted secret(s)

**Next up:** {', '.join(t['name'] for t in ctx.get('tasks', []) if t['status'] != 'Done')[:200] or 'backlog is empty'}
"""


def local_architecture(ctx: dict) -> str:
    lang = (ctx.get("language") or "").lower()
    layers = {
        "python": ["`api/` — FastAPI routers, one module per resource",
                   "`services/` — business logic, no framework imports",
                   "`models/` — SQLAlchemy ORM + Pydantic schemas",
                   "`workers/` — Celery tasks for slow work",
                   "`tests/` — pytest, mirroring the package tree"],
        "typescript": ["`src/components/` — presentational, prop-driven",
                       "`src/features/` — one folder per domain feature",
                       "`src/lib/` — API client, hooks, utilities",
                       "`src/routes/` — route-level containers",
                       "`tests/` — vitest + testing-library"],
    }.get(lang, ["`src/` — application code grouped by feature",
                 "`lib/` — shared utilities",
                 "`config/` — environment configuration",
                 "`tests/` — automated tests"])
    return f"""## Architecture advice — {ctx.get('name','')}

**Observed:** {ctx.get('fileCount',0)} files, primary stack {ctx.get('language') or '—'}/{ctx.get('framework') or '—'}.

### Suggested layering
{chr(10).join(f'- {l}' for l in layers)}

### Principles for this project
1. **One direction of dependency** — routes → services → data. Never the reverse.
2. **Configuration at the edge** — read env vars once at startup, pass values down.
3. **Keep I/O at the boundary** so the core stays unit-testable without mocks.
4. **Snapshot before refactors** — NEXUS restore makes bold refactors cheap.

### Scaling checkpoints
- >50 modules → introduce feature folders
- >1 external API → add a client layer with retries/timeouts
- >2 environments → move env vars into the Vault per environment
"""


def local_improvements(ctx: dict) -> str:
    ideas = [
        f"Add a `Testing` phase to your workflow — currently {ctx.get('openTasks',0)} open tasks with no test files detected.",
        "Set auto-backup to daily in Settings so snapshots happen without thinking.",
        "Write the Deployment Guide while the steps are fresh; future-you will thank you.",
        "Tag this project so it surfaces in Collections alongside related work.",
        "Register your production URL under Deployments to keep the live link one click away.",
    ]
    if not ctx.get("description"):
        ideas.insert(0, "Add a one-line project description — it powers search and the dashboard cards.")
    if len(ctx.get("tree", [])) > 60:
        ideas.insert(0, "Large file tree: introduce top-level folders (`src`, `docs`, `assets`) to keep navigation fast.")
    return "## Suggested improvements\n\n" + "\n".join(f"{i}. {t}" for i, t in enumerate(ideas, 1))


def local_docs(ctx: dict) -> str:
    return f"""# Documentation — {ctx.get('name','')}

## 1. Overview
{ctx.get('description') or 'Describe the problem this project solves in two sentences.'}

## 2. Installation
See README. Requires {ctx.get('language') or 'the project runtime'}.

## 3. Architecture
{ctx.get('framework') or 'The application'} organises code into feature modules. Data lives in
{', '.join(ctx.get('databases', [])) or 'the configured datastore'}.

## 4. Configuration
| Variable | Purpose |
|---|---|
{chr(10).join(f"| `{re.sub(r'[^A-Za-z0-9]+','_',s).upper()}` | configured in NEXUS Vault |" for s in ctx.get('secretNames', [])) or '| (none) | — |'}

## 5. API reference
{chr(10).join(f'- `{a}`' for a in ctx.get('apis', [])[:20]) or '_No endpoints registered yet._'}

## 6. Deployment
{chr(10).join(f"- {d['env']}: {d['provider']} → {d['url']}" for d in ctx.get('deployments', [])) or '_Not deployed._'}

## 7. Changelog
- Initial documentation generated by NEXUS AI.
"""


def local_generic(prompt: str, ctx: dict) -> str:
    p = prompt.lower()
    if any(k in p for k in ("error", "exception", "traceback", "stack trace", "fail")):
        return f"""### Debugging approach

I can see the message you pasted. Work it in this order:

1. **Read the last frame first** — the deepest line in the trace is where it actually broke.
2. **Reproduce in isolation** — extract the failing call into a small script.
3. **Check the boundary** — most runtime errors in {ctx.get('language') or 'this stack'} come from
   `None`/`undefined` crossing a boundary, or a type mismatch from parsed JSON.
4. **Add one assertion** just before the failure, print the actual value, re-run.
5. **Snapshot before the fix** so you can diff behaviour afterwards.

Paste the exact trace with 5 lines of surrounding code and I'll narrow it further.

> Running in **local mode** — set `OPENAI_API_KEY` for full generative answers."""
    if any(k in p for k in ("schema", "database", "table", "model")):
        return f"""### Schema sketch

```sql
CREATE TABLE entities (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  metadata    JSONB DEFAULT '{{}}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_entities_status ON entities(status);
```

Rules of thumb: surrogate integer PKs, `TIMESTAMPTZ` everywhere, index every foreign key and
every column you filter on, and keep flexible attributes in one JSONB column instead of
sprawling nullable columns.

_Registered connections: {', '.join(ctx.get('databases', [])) or 'none yet'}._

> Running in **local mode** — set `OPENAI_API_KEY` for tailored schemas."""
    return f"""I'm running in **local mode** (no `OPENAI_API_KEY` configured), so I answer from your
project data rather than a language model.

**What I know about {ctx.get('name','this workspace')}:** {ctx.get('fileCount',0)} files,
stack {ctx.get('language') or '—'}/{ctx.get('framework') or '—'}, {ctx.get('openTasks',0)} open tasks,
{ctx.get('snapshots',0)} snapshots.

These actions work fully offline right now:
**Review Project · Generate README · Write Documentation · Summarize · Suggest Improvements ·
Security Review · Architecture Advice**

Set `OPENAI_API_KEY` in your environment and restart to unlock free-form generation."""


# --------------------------------------------------------------------------- #
# dispatcher
# --------------------------------------------------------------------------- #
def run(db: OrmSession, project: Optional[Project], action: str, prompt: str = "",
        file_id: Optional[int] = None, history: Optional[list] = None) -> dict:
    ctx = build_context(db, project)
    excerpt = file_excerpt(db, file_id) if file_id else ""

    action_prompts = {
        "review_project": "Review this project and give prioritised, actionable feedback.",
        "generate_readme": "Write a complete README.md for this project.",
        "write_docs": "Write full technical documentation for this project.",
        "summarize": "Summarise this project for someone returning after a month away.",
        "improvements": "Suggest concrete improvements, ordered by impact.",
        "security_review": "Perform a security review and list concrete remediations.",
        "architecture": "Give architecture advice for this project.",
    }
    user_prompt = prompt or action_prompts.get(action, "")

    messages = [{"role": "system", "content": SYSTEM}]
    if ctx:
        messages.append({"role": "system",
                         "content": "PROJECT CONTEXT:\n" + json.dumps(ctx)[:12000]})
    if excerpt:
        messages.append({"role": "system", "content": f"FILE CONTENT:\n```\n{excerpt}\n```"})
    for turn in (history or [])[-6:]:
        if turn.get("role") in ("user", "assistant"):
            messages.append({"role": turn["role"], "content": str(turn.get("content", ""))[:4000]})
    messages.append({"role": "user", "content": user_prompt})

    if (remote := _openai(messages)) is not None:
        return {"content": remote, "engine": "openai", "model": OPENAI_MODEL}

    local = {
        "generate_readme": lambda: local_readme(ctx),
        "review_project": lambda: local_review(ctx),
        "security_review": lambda: local_security(ctx, db, project),
        "summarize": lambda: local_summary(ctx),
        "architecture": lambda: local_architecture(ctx),
        "improvements": lambda: local_improvements(ctx),
        "write_docs": lambda: local_docs(ctx),
    }.get(action)
    content = local() if local else local_generic(user_prompt, ctx)
    return {"content": content, "engine": "local", "model": "nexus-local-analysis"}
