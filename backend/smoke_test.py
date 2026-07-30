"""End-to-end smoke test — exercises the whole PRD surface against a live app."""
from __future__ import annotations

import io
import json
import os
import shutil
import sys
import tempfile
import time
import zipfile

TMP = tempfile.mkdtemp(prefix="nexus-test-")
os.environ["NEXUS_DATA_DIR"] = TMP
os.environ["NEXUS_AI_MODE"] = "local"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

PASS, FAIL = 0, 0
FAILURES: list[str] = []


def check(label: str, cond: bool, extra: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  \033[32m✓\033[0m {label}")
    else:
        FAIL += 1
        FAILURES.append(label)
        print(f"  \033[31m✗\033[0m {label} {extra}")


def section(name: str) -> None:
    print(f"\n\033[1;36m{name}\033[0m")


with TestClient(app) as c:
    section("§32 Auth, sessions & 2FA")
    r = c.get("/api/health")
    check("health endpoint", r.status_code == 200 and r.json()["app"] == "NEXUS")
    r = c.post("/api/auth/login", json={"email": "dev@nexus.local", "password": "nexus"})
    check("demo login", r.status_code == 200, r.text[:120])
    token = r.json()["token"]
    H = {"Authorization": f"Bearer {token}"}
    check("seeded user name", r.json()["user"]["name"] == "Kwame Mensah")
    check("wrong password rejected",
          c.post("/api/auth/login", json={"email": "dev@nexus.local", "password": "x"}).status_code == 401)
    check("unauthenticated blocked", c.get("/api/dashboard").status_code == 401)
    check("session listed", len(c.get("/api/auth/sessions", headers=H).json()) >= 1)
    sec = c.post("/api/auth/2fa/setup", headers=H).json()["secret"]
    from app.security import totp_now
    check("2FA enable with valid TOTP",
          c.post("/api/auth/2fa/enable", headers=H, json={"code": totp_now(sec)}).status_code == 200)
    check("login now demands 2FA",
          c.post("/api/auth/login", json={"email": "dev@nexus.local", "password": "nexus"}).status_code == 401)
    check("login with 2FA works",
          c.post("/api/auth/login", json={"email": "dev@nexus.local", "password": "nexus",
                                          "totp": totp_now(sec)}).status_code == 200)
    c.post("/api/auth/2fa/disable", headers=H, json={"code": totp_now(sec)})

    section("§8 Dashboard (<100ms target)")
    t0 = time.perf_counter()
    d = c.get("/api/dashboard", headers=H)
    ms = (time.perf_counter() - t0) * 1000
    check(f"dashboard 200 in {ms:.1f}ms", d.status_code == 200)
    dd = d.json()
    for key in ("recentProjects", "pinnedProjects", "storage", "tasksDue", "latestSnapshots",
                "activity", "recentFiles", "quickNotes", "stats", "heatmap"):
        check(f"dashboard.{key}", key in dd)
    check("seeded projects present", dd["stats"]["projects"] >= 4)
    check(f"server-side render {dd['generatedInMs']}ms < 100ms", dd["generatedInMs"] < 100)

    section("§9 Projects (<5s create) & §26 Templates")
    tpls = c.get("/api/templates", headers=H).json()
    check(f"8 builtin templates ({len(tpls)})", len([t for t in tpls if t["builtin"]]) == 8)
    py_tpl = next(t for t in tpls if t["name"] == "Python API")
    t0 = time.perf_counter()
    r = c.post("/api/projects", headers=H, json={"name": "Test Service", "description": "created by smoke test",
                                                 "language": "Python", "framework": "FastAPI",
                                                 "status": "Planning", "template_id": py_tpl["id"],
                                                 "tags": ["test"]})
    create_s = time.perf_counter() - t0
    check(f"project created in {create_s*1000:.0f}ms (<5s)", r.status_code == 201 and create_s < 5)
    pid = r.json()["id"]
    tree = c.get(f"/api/projects/{pid}/tree", headers=H).json()
    check("template scaffolded files", len(tree["files"]) == 3, str(len(tree["files"])))
    check("template scaffolded folders", len(tree["folders"]) == 4, str(len(tree["folders"])))
    check("template tasks applied", len(c.get(f"/api/projects/{pid}/tasks", headers=H).json()) == 3)
    check("invalid status rejected",
          c.post("/api/projects", headers=H, json={"name": "x", "status": "Nope"}).status_code == 400)
    check("patch project",
          c.patch(f"/api/projects/{pid}", headers=H, json={"status": "Development", "favorite": True}
                  ).json()["status"] == "Development")
    check("cross-user isolation", c.get("/api/projects/999999", headers=H).status_code == 404)

    section("§12 File Manager")
    fr = c.post(f"/api/projects/{pid}/folders", headers=H, json={"name": "src", "color": "#f59e0b"})
    check("folder create", fr.status_code == 201)
    fid = fr.json()["id"]
    up = c.post(f"/api/projects/{pid}/files/upload", headers=H,
                files=[("files", ("hello.py", b"print('hello world')\n", "text/x-python")),
                       ("files", ("logo.png", b"\x89PNG\r\n\x1a\n" + b"0" * 500, "image/png"))],
                data={"folder_id": str(fid)})
    check("multi-file upload", up.status_code == 201 and len(up.json()["files"]) == 2, up.text[:150])
    file_id = up.json()["files"][0]["id"]
    up2 = c.post(f"/api/projects/{pid}/files/upload", headers=H,
                 files=[("files", ("copy.py", b"print('hello world')\n", "text/x-python"))])
    check("content-addressed dedup detected", up2.json()["deduplicated"] == 1)
    up3 = c.post(f"/api/projects/{pid}/files/upload", headers=H,
                 files=[("files", ("deep.txt", b"nested", "text/plain"))],
                 data={"paths": "a/b/c/deep.txt"})
    check("drag-drop rebuilds folder tree", up3.status_code == 201)
    check("nested folders created",
          any(f["path"] == "/a/b/c/" for f in c.get(f"/api/projects/{pid}/tree", headers=H).json()["files"]))
    check("duplicate report", len(c.get(f"/api/projects/{pid}/duplicates", headers=H).json()) >= 1)
    dup = c.post(f"/api/projects/{pid}/files/{file_id}/duplicate", headers=H)
    check("file duplicate action", dup.status_code == 201 and "copy" in dup.json()["name"])
    check("rename file",
          c.patch(f"/api/projects/{pid}/files/{file_id}", headers=H,
                  json={"name": "renamed.py"}).json()["name"] == "renamed.py")
    z = c.get(f"/api/projects/{pid}/export", headers=H)
    check("ZIP export", z.status_code == 200 and z.headers["content-type"] == "application/zip")
    with zipfile.ZipFile(io.BytesIO(z.content)) as zf:
        check(f"zip contains files ({len(zf.namelist())})", len(zf.namelist()) >= 6)

    section("§12 Recycle Bin")
    c.delete(f"/api/projects/{pid}/files/{dup.json()['id']}", headers=H)
    check("soft delete → bin", len(c.get(f"/api/projects/{pid}/recycle-bin", headers=H).json()) == 1)
    c.post(f"/api/projects/{pid}/files/{dup.json()['id']}/restore", headers=H)
    check("restore from bin", len(c.get(f"/api/projects/{pid}/recycle-bin", headers=H).json()) == 0)

    section("§13 Code Viewer & versioning")
    body = c.get(f"/api/projects/{pid}/files/{file_id}/content", headers=H).json()
    check("text content served", body["content"].startswith("print"))
    check("language detected", body["language"] == "python")
    c.put(f"/api/projects/{pid}/files/{file_id}/content", headers=H,
          json={"content": "print('v2')\nprint('more')\n", "note": "edit 1"})
    c.put(f"/api/projects/{pid}/files/{file_id}/content", headers=H,
          json={"content": "print('v3')\n", "note": "edit 2"})
    revs = c.get(f"/api/projects/{pid}/files/{file_id}/revisions", headers=H).json()
    check(f"revision history ({len(revs)})", len(revs) == 3)
    dif = c.get(f"/api/projects/{pid}/files/{file_id}/diff?version=1", headers=H).json()
    check("version diff computed", dif["added"] >= 1 and dif["removed"] >= 1)
    c.post(f"/api/projects/{pid}/files/{file_id}/restore/1", headers=H)
    check("restore old revision",
          c.get(f"/api/projects/{pid}/files/{file_id}/content", headers=H).json()["content"].startswith("print('hello"))
    binf = c.get(f"/api/projects/{pid}/files/{up.json()['files'][1]['id']}/content", headers=H).json()
    check("binary flagged not decoded", binf["binary"] is True)
    check("raw media stream", c.get(f"/api/projects/{pid}/files/{up.json()['files'][1]['id']}/raw",
                                    headers=H).status_code == 200)

    section("§14 Snapshots & restore")
    snap = c.post(f"/api/projects/{pid}/snapshots", headers=H,
                  json={"name": "v1.0", "description": "first cut"})
    check("snapshot created", snap.status_code == 201, snap.text[:150])
    sid = snap.json()["id"]
    check(f"snapshot has bytes ({snap.json()['size']})", snap.json()["size"] > 0)
    check("snapshot download", c.get(f"/api/projects/{pid}/snapshots/{sid}/download",
                                     headers=H).status_code == 200)
    before = len(c.get(f"/api/projects/{pid}/tree", headers=H).json()["files"])
    c.post(f"/api/projects/{pid}/files", headers=H, json={"name": "TEMP.md", "content": "junk"})
    c.delete(f"/api/projects/{pid}/files/{file_id}?permanent=true", headers=H)
    res = c.post(f"/api/projects/{pid}/snapshots/{sid}/restore", headers=H)
    check("restore succeeded", res.status_code == 200, res.text[:150])
    after = c.get(f"/api/projects/{pid}/tree", headers=H).json()["files"]
    check(f"file count restored ({before} → {len(after)})", len(after) == before)
    check("deleted file is back", any(f["name"] == "renamed.py" for f in after))
    check("post-restore junk gone", not any(f["name"] == "TEMP.md" for f in after))
    check("safety snapshot auto-created",
          len(c.get(f"/api/projects/{pid}/snapshots", headers=H).json()) == 2)
    restored_id = next(f["id"] for f in after if f["name"] == "renamed.py")
    check("restored blob readable",
          "print" in c.get(f"/api/projects/{pid}/files/{restored_id}/content", headers=H).json()["content"])

    section("§17 Tasks & §7 Calendar")
    t = c.post(f"/api/projects/{pid}/tasks", headers=H,
               json={"name": "Ship v1", "priority": "Critical", "deadline": "2026-08-05T10:00:00Z",
                     "labels": ["release"]})
    check("task created", t.status_code == 201)
    tid = t.json()["id"]
    sub = c.post(f"/api/projects/{pid}/tasks", headers=H,
                 json={"name": "Subtask: changelog", "parent_id": tid})
    check("subtask created", sub.json()["parentId"] == tid)
    done = c.patch(f"/api/tasks/{tid}", headers=H, json={"status": "Done"})
    check("completing sets progress 100", done.json()["progress"] == 100)
    check("completedAt stamped", done.json()["completedAt"] is not None)
    check("bad priority rejected",
          c.post(f"/api/projects/{pid}/tasks", headers=H,
                 json={"name": "x", "priority": "Ultra"}).status_code == 400)
    check("global task board", len(c.get("/api/tasks", headers=H).json()) > 5)
    check("calendar events", len(c.get("/api/calendar", headers=H).json()) > 0)

    section("§16 Notes & §18 Documentation")
    n = c.post("/api/notes", headers=H, json={"title": "Design decisions", "body": "# H1\n- [ ] todo",
                                              "project_id": pid, "pinned": True})
    check("note created", n.status_code == 201)
    doc = c.post("/api/notes", headers=H, json={"title": "Installation", "doc_type": "doc",
                                                "category": "Installation", "project_id": pid,
                                                "body": "pip install -r requirements.txt"})
    check("doc created", doc.status_code == 201)
    check("notes and docs separated",
          len(c.get(f"/api/notes?project_id={pid}&doc_type=note", headers=H).json()) == 1 and
          len(c.get(f"/api/notes?project_id={pid}&doc_type=doc", headers=H).json()) >= 1)
    check("8 doc sections", len(c.get("/api/doc-sections", headers=H).json()) == 8)

    section("§21 Secrets Vault (AES-256)")
    check("vault starts locked", c.get("/api/vault/status", headers=H).json()["unlocked"] is False)
    check("locked vault blocks writes",
          c.post("/api/vault/secrets", headers=H,
                 json={"name": "X", "value": "y"}).status_code == 423)
    check("wrong master password rejected",
          c.post("/api/vault/unlock", headers=H, json={"master_password": "wrong"}).status_code == 401)
    vt = c.post("/api/vault/unlock", headers=H, json={"master_password": "master-key"})
    check("vault unlock", vt.status_code == 200)
    VH = {**H, "X-Vault-Token": vt.json()["vaultToken"]}
    s = c.post("/api/vault/secrets", headers=VH,
               json={"name": "STRIPE_KEY", "value": "sk_live_super_secret_value_123",
                     "kind": "API Key", "project_id": pid})
    check("secret stored", s.status_code == 201)
    sec_id = s.json()["id"]
    listing = json.dumps(c.get("/api/vault/secrets", headers=VH).json())
    check("plaintext NEVER in list response", "sk_live_super_secret_value_123" not in listing)
    check("hint is masked", "•" in s.json()["hint"])
    rev = c.post(f"/api/vault/secrets/{sec_id}/reveal", headers=VH)
    check("reveal returns exact plaintext", rev.json()["value"] == "sk_live_super_secret_value_123")
    from app.database import SessionLocal
    from app.models import Secret as SecretModel
    _db = SessionLocal()
    stored = _db.get(SecretModel, sec_id).ciphertext
    _db.close()
    check("DB stores ciphertext only", "sk_live" not in stored and len(stored) > 30)
    envx = c.get(f"/api/vault/env-export/{pid}", headers=VH).json()["content"]
    check(".env export renders", "STRIPE_KEY=sk_live_super_secret_value_123" in envx)
    audit = c.get("/api/vault/audit", headers=VH).json()
    check("audit trail records reveal", any(a["action"] == "secret.revealed" for a in audit))
    check("audit records failed unlock", any(a["action"] == "unlock.failed" for a in audit))
    c.post("/api/vault/lock", headers=VH)
    check("lock revokes key",
          c.post(f"/api/vault/secrets/{sec_id}/reveal", headers=VH).status_code == 423)

    section("§22 Database Manager")
    dbr = c.post(f"/api/projects/{pid}/databases", headers=H,
                 json={"name": "Main DB", "provider": "MySQL", "host": "127.0.0.1",
                       "username": "root", "database": "test"})
    check("connection saved", dbr.status_code == 201)
    check("default port inferred", dbr.json()["port"] == 3306)
    tst = c.post(f"/api/databases/{dbr.json()['id']}/test", headers=H).json()
    check("connection test returns verdict", "ok" in tst and "latencyMs" in tst)
    check("7 providers listed", len(c.get("/api/providers", headers=H).json()["databases"]) == 7)

    section("§23 API Manager")
    a = c.post(f"/api/projects/{pid}/apis", headers=H,
               json={"name": "Ping", "method": "GET", "url": "https://api.github.com/zen",
                     "collection": "Smoke"})
    check("request saved", a.status_code == 201)
    postman = {"info": {"name": "Imported Suite"},
               "item": [{"name": "Get users", "request": {"method": "GET",
                                                          "url": {"raw": "https://x.dev/users"},
                                                          "header": [{"key": "Accept", "value": "application/json"}]}},
                        {"name": "Folder", "item": [{"name": "Nested", "request": {
                            "method": "POST", "url": {"raw": "https://x.dev/n"},
                            "body": {"mode": "raw", "raw": "{}"}}}]}]}
    imp = c.post(f"/api/projects/{pid}/apis/import", headers=H, json=postman)
    check("postman import (incl. nested)", imp.json()["imported"] == 2, imp.text[:120])
    exp = c.get(f"/api/projects/{pid}/apis/export", headers=H).json()
    check("postman export schema", "schema.getpostman.com" in exp["info"]["schema"])
    check("export round-trips items", len(exp["item"]) == 3)

    section("§24 Deployments")
    d1 = c.post(f"/api/projects/{pid}/deployments", headers=H,
                json={"environment": "production", "provider": "Vercel",
                      "url": "https://test.vercel.app", "status": "success", "commit": "abc123"})
    check("deployment recorded", d1.status_code == 201 and d1.json()["active"] is True)
    d2 = c.post(f"/api/projects/{pid}/deployments", headers=H,
                json={"environment": "production", "provider": "Vercel",
                      "url": "https://test-2.vercel.app", "status": "failed"})
    check("failed deploy notifies",
          any("Deployment failed" == n["title"] for n in c.get("/api/notifications", headers=H).json()["items"]))
    rb = c.post(f"/api/deployments/{d1.json()['id']}/rollback", headers=H)
    check("rollback creates active deployment", rb.json()["active"] and "Rolled back" in rb.json()["logs"])
    check("8 hosting providers", len(c.get("/api/providers", headers=H).json()["hosting"]) == 8)

    section("§25 Global Search (<1s)")
    t0 = time.perf_counter()
    sr = c.get("/api/search?q=Iron", headers=H).json()
    el = (time.perf_counter() - t0) * 1000
    check(f"search in {el:.1f}ms (<1000ms)", el < 1000)
    check("finds project", any(g["title"] == "Iron Republic" for g in sr["groups"].get("projects", [])))
    sr2 = c.get("/api/search?q=STRIPE", headers=H).json()
    hits = json.dumps(sr2)
    check("secret findable by name", "STRIPE_KEY" in hits)
    check("secret VALUE never leaked in search", "sk_live_super_secret_value_123" not in hits)
    sr3 = c.get("/api/search?q=booking", headers=H).json()
    check("cross-entity search", len(sr3["groups"]) >= 2, str(list(sr3["groups"])))

    section("§27 Workspace / §28 Activity / §29 Notifications")
    ws = c.get("/api/workspace", headers=H).json()
    for k in ("pinned", "favorites", "recent", "archived", "collections"):
        check(f"workspace.{k}", k in ws)
    check("archived project separated", len(ws["archived"]) == 1)
    check("collections grouped", "Client Work" in ws["collections"])
    check("activity feed populated", len(c.get("/api/activity", headers=H).json()) > 10)
    nots = c.get("/api/notifications", headers=H).json()
    check("notifications + unread count", nots["unread"] > 0)
    c.post("/api/notifications/read", headers=H, json={})
    check("mark all read", c.get("/api/notifications", headers=H).json()["unread"] == 0)

    section("§34 Storage analytics")
    st = c.get("/api/storage", headers=H).json()
    check("logical vs physical tracked", st["logical"] > 0 and st["physical"] > 0)
    check("dedup savings computed", st["saved"] >= 0)
    check("per-project breakdown", len(st["byProject"]) >= 3)
    check("duplicate groups counted", st["duplicateGroups"] >= 1)

    section("§15 Timeline / §10 Analytics / Logs")
    check("project timeline", len(c.get(f"/api/projects/{pid}/timeline", headers=H).json()) > 3)
    an = c.get(f"/api/projects/{pid}/analytics", headers=H).json()
    check("analytics storage by kind", len(an["storageByKind"]) >= 1)
    check("analytics task breakdown", len(an["tasksByStatus"]) >= 1)
    check("project logs", len(c.get(f"/api/projects/{pid}/logs", headers=H).json()) > 0)

    section("§31 AI Assistant (local engine)")
    caps = c.get("/api/ai/capabilities", headers=H).json()
    check("13 capabilities exposed", len(caps["capabilities"]) == 13, str(len(caps["capabilities"])))
    rd = c.post("/api/ai/ask", headers=H, json={"action": "generate_readme", "project_id": pid}).json()
    check("README grounded in real project", "Test Service" in rd["content"])
    check("README lists real env vars", "STRIPE_KEY" in rd["content"])
    rv = c.post("/api/ai/ask", headers=H, json={"action": "review_project", "project_id": pid}).json()
    check("review returns findings", "Recommendations" in rv["content"])
    sv = c.post("/api/ai/ask", headers=H, json={"action": "security_review", "project_id": pid}).json()
    check("security review runs", "Security review" in sv["content"])
    c.post(f"/api/projects/{pid}/files", headers=H,
           json={"name": "leak.py", "content": 'AWS = "AKIAIOSFODNN7EXAMPLE"\n'})
    sv2 = c.post("/api/ai/ask", headers=H, json={"action": "security_review", "project_id": pid}).json()
    check("scanner detects hard-coded AWS key", "AWS access key id" in sv2["content"])
    sm = c.post("/api/ai/ask", headers=H, json={"action": "summarize", "project_id": pid}).json()
    check("summary cites task progress", "tasks complete" in sm["content"])
    saved = c.post("/api/ai/save-doc", headers=H,
                   json={"project_id": pid, "title": "AI README", "body": rd["content"]})
    check("AI output saved to docs", saved.status_code == 201)

    section("§30 Settings & §33 Backup")
    stg = c.get("/api/settings", headers=H).json()
    check("6 setting groups", len(stg) == 6)
    c.put("/api/settings", headers=H, json={"key": "appearance", "value": {"accent": "#f43f5e"}})
    check("setting persisted",
          c.get("/api/settings", headers=H).json()["appearance"]["accent"] == "#f43f5e")
    check("defaults merged", c.get("/api/settings", headers=H).json()["appearance"]["theme"] == "dark")
    check("11 shortcuts", len(c.get("/api/settings/shortcuts", headers=H).json()) == 11)
    exp = c.get("/api/settings/export", headers=H)
    check("workspace export", exp.status_code == 200 and len(exp.content) > 1000)
    with zipfile.ZipFile(io.BytesIO(exp.content)) as zf:
        man = json.loads(zf.read("workspace.json"))
        check("export has all projects", len(man["projects"]) >= 5)
        check("export ships blobs", any(n.startswith("blobs/") for n in zf.namelist()))
        check("export ciphertext only", "sk_live_super_secret_value_123" not in json.dumps(man))
    before_n = len(c.get("/api/projects?archived=false", headers=H).json())
    imp = c.post("/api/settings/import", headers=H,
                 files={"file": ("ws.zip", exp.content, "application/zip")})
    check("workspace import", imp.status_code == 200 and imp.json()["projects"] >= 5, imp.text[:150])
    check("import merged projects",
          len(c.get("/api/projects?archived=false", headers=H).json()) > before_n)
    check("secrets re-imported with same salt", imp.json()["secrets"] >= 1)
    ab = c.post("/api/settings/auto-backup/run", headers=H)
    check("auto-backup snapshots every project", len(ab.json()["snapshots"]) >= 5)

    section("§37 Schema & meta")
    from app.database import engine
    from sqlalchemy import inspect
    tables = set(inspect(engine).get_table_names())
    expected = {"users", "projects", "folders", "files", "snapshots", "tasks", "notes",
                "secrets", "apis", "deployments", "db_connections", "templates",
                "notifications", "activity_logs", "settings"}
    check(f"all PRD tables exist ({len(tables)})", expected.issubset(tables),
          str(expected - tables))
    m = c.get("/api/meta").json()
    check("7 project statuses", len(m["projectStatuses"]) == 7)
    check("5 task statuses", len(m["taskStatuses"]) == 5)
    check("4 priorities", len(m["taskPriorities"]) == 4)

    section("Cleanup")
    check("project delete cascades",
          c.delete(f"/api/projects/{pid}", headers=H).status_code == 200)
    check("logout revokes session", c.post("/api/auth/logout", headers=H).status_code == 200)
    check("revoked token rejected", c.get("/api/dashboard", headers=H).status_code == 401)

shutil.rmtree(TMP, ignore_errors=True)
total = PASS + FAIL
print(f"\n{'='*62}")
print(f"  \033[1mNEXUS smoke test\033[0m — \033[32m{PASS} passed\033[0m, "
      f"{'\033[31m' + str(FAIL) + ' failed\033[0m' if FAIL else '0 failed'} / {total}")
if FAILURES:
    print("  Failures:")
    for f in FAILURES:
        print(f"   · {f}")
print(f"{'='*62}")
sys.exit(1 if FAIL else 0)
