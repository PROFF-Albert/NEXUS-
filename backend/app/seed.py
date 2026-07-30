"""Built-in templates (PRD §26) + a realistic demo workspace for first run."""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session as OrmSession

from . import storage
from .config import DEMO_EMAIL, DEMO_MASTER, DEMO_PASSWORD
from .database import SessionLocal
from .models import (ActivityLog, ApiEntry, DatabaseConnection, Deployment, File, FileRevision,
                     Folder, Note, Notification, Project, Secret, Snapshot, Task, Template,
                     User, utcnow)
from .security import VAULT_CANARY, derive_key, hash_password, new_salt, seal

# --------------------------------------------------------------------------- #
BUILTIN_TEMPLATES = [
    {
        "name": "Portfolio", "icon": "user", "color": "#8b5cf6", "category": "Website",
        "language": "TypeScript", "framework": "React",
        "description": "Personal portfolio with projects grid, about and contact form.",
        "payload": {
            "folders": ["/src", "/src/components", "/src/sections", "/public", "/docs"],
            "files": [
                {"path": "/README.md", "content": "# {{PROJECT_NAME}}\n\nPersonal portfolio site.\n"},
                {"path": "/src/App.tsx", "content": "export default function App() {\n  return <main className=\"portfolio\">Hello</main>;\n}\n"},
                {"path": "/src/sections/Hero.tsx", "content": "export const Hero = () => <section id=\"hero\" />;\n"},
                {"path": "/src/components/ProjectCard.tsx", "content": "export const ProjectCard = () => null;\n"},
            ],
            "tasks": [{"name": "Design hero section", "priority": "High"},
                      {"name": "Add projects grid", "priority": "High"},
                      {"name": "Wire contact form", "priority": "Medium"},
                      {"name": "Lighthouse pass ≥ 95", "priority": "Low"}],
            "docs": [{"title": "README", "category": "README",
                      "body": "# {{PROJECT_NAME}}\n\n## Goal\nShowcase work and convert visitors."}],
        },
    },
    {
        "name": "E-commerce", "icon": "shopping-cart", "color": "#f59e0b", "category": "Application",
        "language": "TypeScript", "framework": "Next.js",
        "description": "Storefront with catalogue, cart, checkout and orders.",
        "payload": {
            "folders": ["/app", "/app/products", "/app/cart", "/lib", "/prisma", "/docs"],
            "files": [
                {"path": "/README.md", "content": "# {{PROJECT_NAME}}\n\nE-commerce storefront.\n"},
                {"path": "/prisma/schema.prisma", "content": "model Product {\n  id    String @id @default(cuid())\n  name  String\n  price Int\n}\n"},
                {"path": "/lib/cart.ts", "content": "export type CartItem = { id: string; qty: number };\n"},
            ],
            "tasks": [{"name": "Product catalogue", "priority": "Critical"},
                      {"name": "Cart persistence", "priority": "High"},
                      {"name": "Payment integration", "priority": "Critical"},
                      {"name": "Order emails", "priority": "Medium"}],
            "docs": [{"title": "Architecture", "category": "Architecture",
                      "body": "## Layers\n- app/ routes\n- lib/ domain logic\n- prisma/ data"}],
        },
    },
    {
        "name": "Gym Marketplace", "icon": "dumbbell", "color": "#10b981", "category": "Marketplace",
        "language": "TypeScript", "framework": "React",
        "description": "Two-sided marketplace connecting gyms, trainers and members.",
        "payload": {
            "folders": ["/src", "/src/features", "/src/features/gyms", "/src/features/booking", "/docs"],
            "files": [
                {"path": "/README.md", "content": "# {{PROJECT_NAME}}\n\nGym marketplace.\n"},
                {"path": "/src/features/gyms/types.ts", "content": "export interface Gym { id: string; name: string; city: string; }\n"},
                {"path": "/src/features/booking/useBooking.ts", "content": "export const useBooking = () => ({});\n"},
            ],
            "tasks": [{"name": "Gym onboarding flow", "priority": "Critical"},
                      {"name": "Search + filters by city", "priority": "High"},
                      {"name": "Booking calendar", "priority": "High"},
                      {"name": "Payout schedule", "priority": "Medium"}],
            "docs": [{"title": "Roadmap", "category": "Roadmap",
                      "body": "## Phase 1\nGym profiles\n## Phase 2\nBookings\n## Phase 3\nPayouts"}],
        },
    },
    {
        "name": "Landing Page", "icon": "layout", "color": "#ec4899", "category": "Website",
        "language": "HTML", "framework": "Tailwind",
        "description": "High-converting single page with hero, features, pricing and CTA.",
        "payload": {
            "folders": ["/assets", "/css"],
            "files": [
                {"path": "/index.html", "content": "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><title>{{PROJECT_NAME}}</title></head>\n<body class=\"bg-zinc-950 text-white\"></body>\n</html>\n"},
                {"path": "/css/styles.css", "content": ":root { --accent: #6366f1; }\n"},
            ],
            "tasks": [{"name": "Write hero copy", "priority": "High"},
                      {"name": "Pricing table", "priority": "Medium"},
                      {"name": "Analytics + conversion tracking", "priority": "Medium"}],
            "docs": [],
        },
    },
    {
        "name": "React App", "icon": "atom", "color": "#06b6d4", "category": "Application",
        "language": "TypeScript", "framework": "React + Vite",
        "description": "Vite + React + TypeScript starter with routing and query layer.",
        "payload": {
            "folders": ["/src", "/src/components", "/src/hooks", "/src/pages", "/public"],
            "files": [
                {"path": "/package.json", "content": "{\n  \"name\": \"app\",\n  \"private\": true,\n  \"scripts\": { \"dev\": \"vite\", \"build\": \"vite build\" }\n}\n"},
                {"path": "/src/main.tsx", "content": "import { createRoot } from 'react-dom/client';\ncreateRoot(document.getElementById('root')!).render(<App />);\n"},
                {"path": "/src/App.tsx", "content": "export default function App() { return <h1>{{PROJECT_NAME}}</h1>; }\n"},
            ],
            "tasks": [{"name": "Set up routing", "priority": "High"},
                      {"name": "Add TanStack Query", "priority": "Medium"},
                      {"name": "Configure ESLint + Prettier", "priority": "Low"}],
            "docs": [],
        },
    },
    {
        "name": "Flutter App", "icon": "smartphone", "color": "#3b82f6", "category": "Mobile",
        "language": "Dart", "framework": "Flutter",
        "description": "Cross-platform mobile app skeleton with state management.",
        "payload": {
            "folders": ["/lib", "/lib/screens", "/lib/widgets", "/assets"],
            "files": [
                {"path": "/lib/main.dart", "content": "import 'package:flutter/material.dart';\n\nvoid main() => runApp(const MyApp());\n"},
                {"path": "/pubspec.yaml", "content": "name: app\nenvironment:\n  sdk: '>=3.0.0 <4.0.0'\n"},
            ],
            "tasks": [{"name": "App shell + navigation", "priority": "High"},
                      {"name": "Theme + dark mode", "priority": "Medium"},
                      {"name": "Release to TestFlight", "priority": "Low"}],
            "docs": [],
        },
    },
    {
        "name": "Python API", "icon": "server", "color": "#22c55e", "category": "Backend",
        "language": "Python", "framework": "FastAPI",
        "description": "FastAPI service with SQLAlchemy, auth and Docker.",
        "payload": {
            "folders": ["/app", "/app/routers", "/app/models", "/tests"],
            "files": [
                {"path": "/app/main.py", "content": "from fastapi import FastAPI\n\napp = FastAPI(title=\"{{PROJECT_NAME}}\")\n\n@app.get(\"/health\")\ndef health():\n    return {\"ok\": True}\n"},
                {"path": "/requirements.txt", "content": "fastapi\nuvicorn[standard]\nsqlalchemy\npydantic\n"},
                {"path": "/Dockerfile", "content": "FROM python:3.12-slim\nWORKDIR /srv\nCOPY . .\nRUN pip install -r requirements.txt\nCMD [\"uvicorn\", \"app.main:app\", \"--host\", \"0.0.0.0\"]\n"},
            ],
            "tasks": [{"name": "Define data models", "priority": "High"},
                      {"name": "JWT authentication", "priority": "Critical"},
                      {"name": "Write pytest suite", "priority": "Medium"}],
            "docs": [{"title": "API Docs", "category": "API Docs",
                      "body": "## GET /health\nReturns service liveness."}],
        },
    },
    {
        "name": "Electron App", "icon": "monitor", "color": "#a855f7", "category": "Desktop",
        "language": "JavaScript", "framework": "Electron",
        "description": "Desktop shell with main/renderer split and auto-update.",
        "payload": {
            "folders": ["/src", "/src/main", "/src/renderer", "/build"],
            "files": [
                {"path": "/src/main/index.js", "content": "const { app, BrowserWindow } = require('electron');\napp.whenReady().then(() => new BrowserWindow({ width: 1280, height: 800 }));\n"},
                {"path": "/package.json", "content": "{\n  \"name\": \"desktop\",\n  \"main\": \"src/main/index.js\"\n}\n"},
            ],
            "tasks": [{"name": "Window state persistence", "priority": "Medium"},
                      {"name": "Auto-update channel", "priority": "High"},
                      {"name": "Code signing", "priority": "Medium"}],
            "docs": [],
        },
    },
]


def ensure_templates(db: OrmSession) -> None:
    for spec in BUILTIN_TEMPLATES:
        if db.query(Template).filter(Template.name == spec["name"],
                                     Template.builtin == True).first():          # noqa: E712
            continue
        db.add(Template(builtin=True, user_id=None, **spec))
    db.commit()


def bootstrap_user(db: OrmSession, user: User) -> None:
    db.add(Note(user_id=user.id, title="Welcome to NEXUS",
                body=("**One Workspace. Every Project. Zero Chaos.**\n\n"
                      "- Press `⌘K` anywhere for global search\n"
                      "- `⌘N` creates a project in under 5 seconds\n"
                      "- `⌘⇧S` snapshots the project you're in\n"
                      "- Unlock the Vault to store keys with AES-256 encryption"),
                category="General", pinned=True))
    db.add(Notification(user_id=user.id, title="Welcome to NEXUS",
                        body="Your private developer operating system is ready.",
                        level="success", icon="rocket"))
    db.commit()


# --------------------------------------------------------------------------- #
def _add_file(db: OrmSession, project: Project, folder: Folder | None, name: str, content: str):
    sha, size, _ = storage.put_bytes(content.encode())
    ext, kind, mime = storage.classify(name)
    f = File(project_id=project.id, folder_id=folder.id if folder else None, name=name,
             path=folder.path if folder else "/", extension=ext, kind=kind, mime=mime,
             size=size, sha256=sha, blob_key=sha)
    db.add(f)
    db.flush()
    db.add(FileRevision(file_id=f.id, version=1, blob_key=sha, size=size, sha256=sha,
                        note="initial"))
    return f


def _folder(db: OrmSession, project: Project, name: str, parent: Folder | None = None) -> Folder:
    path = f"{parent.path if parent else '/'}{name}/"
    d = Folder(project_id=project.id, parent_id=parent.id if parent else None,
               name=name, path=path)
    db.add(d)
    db.flush()
    return d


def seed_demo() -> None:
    """Create the demo account on first run so the app is never an empty shell."""
    db = SessionLocal()
    try:
        ensure_templates(db)
        if db.query(User).filter(User.email == DEMO_EMAIL).first():
            return

        salt = new_salt()
        key = derive_key(DEMO_MASTER, salt)
        user = User(email=DEMO_EMAIL, name="Kwame Mensah",
                    password_hash=hash_password(DEMO_PASSWORD), vault_salt=salt,
                    vault_canary=seal(key, VAULT_CANARY.decode()), avatar_color="#6366f1")
        db.add(user)
        db.commit()
        db.refresh(user)

        now = utcnow()

        # ---------------- Project 1: Gym marketplace ----------------
        p1 = Project(user_id=user.id, name="Iron Republic", description="Gym & trainer marketplace for Accra — book sessions, manage memberships, split payouts.",
                     category="Marketplace", framework="React + Vite", language="TypeScript",
                     status="Development", color="#10b981", icon="dumbbell",
                     tags=["marketplace", "payments", "mobile-first"], pinned=True, favorite=True,
                     collection="Client Work", last_opened=now - timedelta(hours=2))
        db.add(p1)
        db.commit()
        db.refresh(p1)

        src = _folder(db, p1, "src")
        comps = _folder(db, p1, "components", src)
        feats = _folder(db, p1, "features", src)
        booking = _folder(db, p1, "booking", feats)
        _folder(db, p1, "public")
        docs_f = _folder(db, p1, "docs")

        _add_file(db, p1, None, "package.json",
                  '{\n  "name": "iron-republic",\n  "private": true,\n  "type": "module",\n'
                  '  "scripts": {\n    "dev": "vite",\n    "build": "tsc && vite build",\n'
                  '    "preview": "vite preview"\n  },\n  "dependencies": {\n'
                  '    "react": "^18.3.1",\n    "react-router-dom": "^6.26.0",\n'
                  '    "@tanstack/react-query": "^5.51.0"\n  }\n}\n')
        _add_file(db, p1, None, "README.md",
                  "# Iron Republic\n\nGym & trainer marketplace.\n\n## Stack\nReact · Vite · TypeScript · Supabase\n\n## Run\n```bash\nnpm install\nnpm run dev\n```\n")
        _add_file(db, p1, src, "main.tsx",
                  "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\n"
                  "import { QueryClient, QueryClientProvider } from '@tanstack/react-query';\n"
                  "import App from './App';\nimport './index.css';\n\n"
                  "const queryClient = new QueryClient();\n\n"
                  "createRoot(document.getElementById('root')!).render(\n"
                  "  <StrictMode>\n    <QueryClientProvider client={queryClient}>\n"
                  "      <App />\n    </QueryClientProvider>\n  </StrictMode>,\n);\n")
        _add_file(db, p1, src, "App.tsx",
                  "import { BrowserRouter, Route, Routes } from 'react-router-dom';\n"
                  "import { GymList } from './features/GymList';\n\n"
                  "export default function App() {\n  return (\n    <BrowserRouter>\n"
                  "      <Routes>\n        <Route path=\"/\" element={<GymList />} />\n"
                  "      </Routes>\n    </BrowserRouter>\n  );\n}\n")
        _add_file(db, p1, comps, "GymCard.tsx",
                  "interface Props {\n  name: string;\n  city: string;\n  rating: number;\n  price: number;\n}\n\n"
                  "export function GymCard({ name, city, rating, price }: Props) {\n"
                  "  return (\n    <article className=\"gym-card\">\n      <h3>{name}</h3>\n"
                  "      <p>{city} · ★ {rating.toFixed(1)}</p>\n"
                  "      <span>GH₵ {price}/session</span>\n    </article>\n  );\n}\n")
        _add_file(db, p1, booking, "useBooking.ts",
                  "import { useMutation } from '@tanstack/react-query';\n\n"
                  "export interface BookingInput {\n  gymId: string;\n  trainerId?: string;\n  startsAt: string;\n}\n\n"
                  "export function useBooking() {\n  return useMutation({\n"
                  "    mutationFn: async (input: BookingInput) => {\n"
                  "      const res = await fetch('/api/bookings', {\n"
                  "        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n"
                  "        body: JSON.stringify(input),\n      });\n"
                  "      if (!res.ok) throw new Error('Booking failed');\n      return res.json();\n"
                  "    },\n  });\n}\n")
        _add_file(db, p1, docs_f, "payouts.md",
                  "# Payout rules\n\n- Platform fee: 12%\n- Trainer share: 70%\n- Gym share: 18%\n- Settlement: every Friday 17:00 GMT\n")

        for name, status, prio, days in [
            ("Gym onboarding flow", "Done", "Critical", -8),
            ("Search + filter by city", "Done", "High", -4),
            ("Booking calendar UI", "In Progress", "Critical", 2),
            ("Paystack split payments", "In Progress", "Critical", 4),
            ("Trainer payout schedule", "Blocked", "High", 6),
            ("Push notifications", "Todo", "Medium", 12),
            ("Load test 1k concurrent", "Testing", "Medium", 9),
            ("Accessibility audit", "Todo", "Low", 20),
        ]:
            db.add(Task(project_id=p1.id, name=name, status=status, priority=prio,
                        deadline=now + timedelta(days=days),
                        progress=100 if status == "Done" else (60 if status == "In Progress" else 0),
                        completed_at=now + timedelta(days=days) if status == "Done" else None,
                        labels=["frontend"] if "UI" in name else []))

        db.add(Note(user_id=user.id, project_id=p1.id, title="Paystack integration notes",
                    body=("## Split payments\n\nUse subaccounts per gym. Platform keeps 12%.\n\n"
                          "```ts\nconst tx = await paystack.transaction.initialize({\n"
                          "  email, amount, subaccount, transaction_charge: fee,\n});\n```\n\n"
                          "⚠️ Test keys only until KYC clears."),
                    category="Integration", pinned=True))
        db.add(Note(user_id=user.id, project_id=p1.id, title="README", doc_type="doc",
                    category="README",
                    body="# Iron Republic\n\nTwo-sided marketplace for gyms and trainers in Accra.\n\n"
                         "## Features\n- Gym discovery\n- Session booking\n- Split payouts\n"))
        db.add(Note(user_id=user.id, project_id=p1.id, title="Deployment Guide", doc_type="doc",
                    category="Deployment Guide",
                    body="## Production\n1. `npm run build`\n2. Push to `main` → Vercel auto-deploys\n"
                         "3. Verify `/health`\n4. Snapshot in NEXUS before announcing\n"))

        db.add(DatabaseConnection(project_id=p1.id, name="Supabase — production",
                                  provider="Supabase", host="db.supabase.co", port=5432,
                                  username="postgres", database="iron_republic",
                                  schema_json=[{"table": "gyms", "columns": 11},
                                               {"table": "trainers", "columns": 9},
                                               {"table": "bookings", "columns": 14},
                                               {"table": "payouts", "columns": 8}]))
        db.add(ApiEntry(project_id=p1.id, collection="Bookings", name="List gyms",
                        method="GET", url="https://api.github.com/zen",
                        headers={"Accept": "application/json"}))
        db.add(ApiEntry(project_id=p1.id, collection="Bookings", name="Create booking",
                        method="POST", url="https://httpbin.org/post",
                        headers={"Content-Type": "application/json"},
                        body='{\n  "gymId": "gym_123",\n  "startsAt": "2026-08-01T09:00:00Z"\n}'))
        db.add(Deployment(project_id=p1.id, environment="production", provider="Vercel",
                          url="https://ironrepublic.app", commit="a91f3c2", status="success",
                          duration_s=42.6, active=True,
                          logs="✓ Build cached\n✓ 214 modules transformed\n✓ Deployed to production\n"))
        db.add(Deployment(project_id=p1.id, environment="preview", provider="Vercel",
                          url="https://iron-republic-git-booking.vercel.app", commit="7d2e881",
                          status="success", duration_s=38.1, active=True,
                          logs="✓ Preview deployment ready\n"))

        for name, kind, val in [
            ("Paystack Secret Key", "Paystack Key", "sk_test_9f3c1a7b22e4d5f6a8b9c0d1e2f3a4b5"),
            ("Supabase Service Role", "API Key", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.token"),
            ("JWT Signing Secret", "JWT Secret", "ir_jwt_4f8a2c9e7b1d3f5a6c8e0b2d4f6a8c1e"),
        ]:
            hint = val[:2] + "•" * 8 + val[-3:]
            db.add(Secret(user_id=user.id, project_id=p1.id, name=name, kind=kind,
                          environment="development", ciphertext=seal(key, val), hint=hint))

        db.add(Snapshot(project_id=p1.id, name="v0.4.0", description="Booking calendar MVP",
                        author=user.name, size=184320, file_count=7, archive_key="",
                        manifest={"summary": {"folders": 6, "notes": 3, "tasks": 8, "apis": 2}},
                        created_at=now - timedelta(days=3)))

        # ---------------- Project 2: Python API ----------------
        p2 = Project(user_id=user.id, name="Ledger API", description="Double-entry accounting service with idempotent postings and audit trail.",
                     category="Backend", framework="FastAPI", language="Python",
                     status="Testing", color="#22c55e", icon="server",
                     tags=["fintech", "api"], collection="Side Projects",
                     last_opened=now - timedelta(days=1))
        db.add(p2)
        db.commit()
        db.refresh(p2)
        app_f = _folder(db, p2, "app")
        routers_f = _folder(db, p2, "routers", app_f)
        tests_f = _folder(db, p2, "tests")
        _add_file(db, p2, app_f, "main.py",
                  "from fastapi import FastAPI\n\nfrom .routers import postings\n\n"
                  "app = FastAPI(title=\"Ledger API\", version=\"1.2.0\")\n"
                  "app.include_router(postings.router)\n\n\n"
                  "@app.get(\"/health\")\ndef health() -> dict:\n    return {\"ok\": True}\n")
        _add_file(db, p2, routers_f, "postings.py",
                  "from fastapi import APIRouter, HTTPException\nfrom pydantic import BaseModel\n\n"
                  "router = APIRouter(prefix=\"/postings\", tags=[\"postings\"])\n\n\n"
                  "class Posting(BaseModel):\n    debit: str\n    credit: str\n    amount: int\n\n\n"
                  "@router.post(\"\")\ndef create(posting: Posting):\n"
                  "    if posting.amount <= 0:\n        raise HTTPException(400, \"amount must be positive\")\n"
                  "    return {\"id\": \"pst_1\", **posting.model_dump()}\n")
        _add_file(db, p2, tests_f, "test_postings.py",
                  "def test_rejects_negative_amount(client):\n"
                  "    res = client.post('/postings', json={'debit': 'a', 'credit': 'b', 'amount': -1})\n"
                  "    assert res.status_code == 400\n")
        _add_file(db, p2, None, "requirements.txt", "fastapi\nuvicorn[standard]\nsqlalchemy\npytest\n")
        for name, status, prio in [("Idempotency keys", "Done", "Critical"),
                                   ("Trial balance endpoint", "Testing", "High"),
                                   ("Audit log immutability", "In Progress", "Critical"),
                                   ("OpenAPI examples", "Todo", "Low")]:
            db.add(Task(project_id=p2.id, name=name, status=status, priority=prio,
                        progress=100 if status == "Done" else 40))
        db.add(DatabaseConnection(project_id=p2.id, name="Local Postgres", provider="PostgreSQL",
                                  host="localhost", port=5432, username="ledger", database="ledger_dev"))
        db.add(Note(user_id=user.id, project_id=p2.id, title="API Docs", doc_type="doc",
                    category="API Docs",
                    body="## POST /postings\nCreates a balanced double-entry posting.\n\n"
                         "| field | type |\n|---|---|\n| debit | string |\n| credit | string |\n| amount | int |\n"))

        # ---------------- Project 3: Portfolio (completed) ----------------
        p3 = Project(user_id=user.id, name="Personal Portfolio", description="Static portfolio site — case studies, writing and contact.",
                     category="Website", framework="Astro", language="TypeScript",
                     status="Completed", color="#8b5cf6", icon="user", tags=["personal"],
                     favorite=True, last_opened=now - timedelta(days=9))
        db.add(p3)
        db.commit()
        db.refresh(p3)
        _add_file(db, p3, None, "index.astro", "---\nconst title = 'Kwame Mensah';\n---\n<h1>{title}</h1>\n")
        db.add(Deployment(project_id=p3.id, environment="production", provider="Netlify",
                          url="https://kwame.dev", status="success", duration_s=19.4, active=True,
                          logs="✓ Site is live\n"))
        db.add(Task(project_id=p3.id, name="Write case study #3", status="Done",
                    priority="Medium", progress=100, completed_at=now - timedelta(days=10)))

        # ---------------- Project 4: archived ----------------
        p4 = Project(user_id=user.id, name="Weather CLI", description="Terminal weather client in Rust — shelved after v1.",
                     category="Tool", framework="", language="Rust", status="Archived",
                     color="#f97316", icon="cloud", tags=["cli"], archived=True,
                     last_opened=now - timedelta(days=64))
        db.add(p4)
        db.commit()
        db.refresh(p4)
        _add_file(db, p4, None, "main.rs",
                  "fn main() {\n    println!(\"weather: 31°C, humid — Accra\");\n}\n")

        # ---------------- activity + notifications ----------------
        events = [
            ("project.created", "Iron Republic", p1.id, "folder-plus", 30),
            ("files.uploaded", "7 file(s)", p1.id, "upload", 29),
            ("task.completed", "Gym onboarding flow", p1.id, "check-circle", 8),
            ("secret.created", "Paystack Secret Key", p1.id, "key", 7),
            ("database.added", "Supabase — production", p1.id, "database", 6),
            ("snapshot.created", "v0.4.0", p1.id, "camera", 3),
            ("deployment.created", "Vercel · production", p1.id, "cloud", 2),
            ("file.edited", "useBooking.ts", p1.id, "edit-3", 1),
            ("project.created", "Ledger API", p2.id, "folder-plus", 21),
            ("task.completed", "Idempotency keys", p2.id, "check-circle", 5),
            ("deployment.created", "Netlify · production", p3.id, "cloud", 12),
            ("project.archived", "Weather CLI", p4.id, "archive", 40),
        ]
        for action, target, pid, icon, days_ago in events:
            db.add(ActivityLog(user_id=user.id, project_id=pid, action=action, target=target,
                               icon=icon, created_at=now - timedelta(days=days_ago)))

        db.add(Note(user_id=user.id, project_id=None, title="Quick scratchpad",
                    body="- Ping designer about the booking flow\n- Renew domain in September\n- Try Bun for the next side project",
                    pinned=True, category="Personal"))
        for title, body, level, icon in [
            ("Snapshot complete", "Iron Republic · v0.4.0 saved (180 KB)", "success", "camera"),
            ("Task due soon", "Booking calendar UI is due in 2 days", "warning", "clock"),
            ("Deployment finished", "https://ironrepublic.app is live", "success", "cloud"),
        ]:
            db.add(Notification(user_id=user.id, title=title, body=body, level=level, icon=icon))

        db.commit()
    finally:
        db.close()
