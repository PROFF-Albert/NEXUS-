# NEXUS

**The Private Developer Operating System**

> One Workspace. Every Project. Zero Chaos.

A private, self-hosted developer workspace that replaces the pile of tools you
currently juggle — GitHub for storage, Google Drive for files, Notion for notes,
`.env` files for secrets, Postman for APIs, sticky notes for tasks, ZIP folders
for backups — with one coherent application.

Everything related to a project lives **inside** the project.

---

## Quick start

```bash
cd nexus
./run.sh
```

Open **http://localhost:8000**

| | |
|---|---|
| **Login** | `dev@nexus.local` / `nexus` |
| **Vault master password** | `master-key` |

The first run seeds a realistic demo workspace (4 projects, files, tasks,
snapshots, secrets, deployments) so nothing is an empty shell.

### Other commands

```bash
./run.sh build   # rebuild the frontend, then serve
./run.sh test    # run the 144-check backend smoke suite
./run.sh dev     # backend + Vite dev server with hot reload
```

### Desktop app

```bash
cd desktop && npm install && npm start
```

---

## What's implemented

Every numbered section of the PRD maps to working code.

### Workspace
- **Dashboard** (§8) — recent & pinned projects, continue-working card, storage
  meter, tasks due, latest snapshots, 90-day activity heatmap, developer stats,
  quick notes, recent files. Renders server-side in **<100 ms**.
- **Projects** (§9–§11) — 7 statuses, colours, icons, tags, favourites, pins,
  collections, archive. Grid and table views. Creation is **sub-100 ms**.
- **Workspace views** (§27) — pinned / recent / favourites / collections / archived.
- **Global search** (§25) — one query across projects, files, folders, tasks,
  notes, docs, images, videos, APIs, databases and secret *names*. Typically **<25 ms**.
- **Command palette** — `⌘K` for search + jump-to commands.
- **Calendar** (§7) — deadlines and snapshot history on a month grid.
- **Activity feed** (§28) and **notifications** (§29).

### Files & code
- **File manager** (§12) — tree navigation, folder creation, multi-file upload,
  **drag & drop of entire directory trees**, rename, delete, duplicate, download,
  ZIP export, folder colours, favourites, search, recycle bin with restore,
  streaming uploads for large files.
- **Duplicate detection** (§12/§34) — content-addressed storage means identical
  files are stored **once**; the UI reports every duplicate group and the space saved.
- **Code viewer** (§13) — syntax highlighting for 25+ languages, line numbers,
  find & replace, read-only toggle, split view, mini map, **version diffing**
  and one-click restore of any past revision.
- **Media** (§19/§20) — image gallery with fullscreen preview and shift-click
  compare; video gallery with streaming playback.

### Safety
- **Snapshots** (§14) — a real, self-contained ZIP holding every file plus a
  manifest of notes, docs, tasks, API collections, DB configs and settings.
  **Restore rebuilds the project exactly**, and takes a safety snapshot first,
  so rollback is always reversible.
- **Timeline** (§15) — visual project history grouped by day.
- **Backup system** (§33) — scheduled snapshots plus full **workspace export /
  import** as a portable archive. Import merges; it never overwrites.

### Knowledge
- **Notes** (§16) and **Documentation** (§18) — markdown with headings,
  checklists, tables and code blocks. Pin notes to the dashboard. Docs use the
  eight PRD sections (README, Installation, Architecture, Deployment Guide, API
  Docs, Changelog, Roadmap, Meeting Notes).
- **Tasks** (§17) — drag-and-drop Kanban across 5 statuses, 4 priorities,
  deadlines, reminders, progress, labels, subtasks, dependencies. Board is
  available per-project and globally.
- **Templates** (§26) — 8 built-in scaffolds (Portfolio, E-commerce, Gym
  Marketplace, Landing Page, React App, Flutter App, Python API, Electron App)
  that create real folders, files, tasks and docs. Save any project as a template.

### Infrastructure
- **Secrets Vault** (§21) — **AES-256-GCM**, key derived by PBKDF2-HMAC-SHA256
  (200 000 rounds) from a master password that is separate from your login.
  The key lives only in server RAM inside a 15-minute session. List endpoints
  return names and masked hints — never values. Every unlock, reveal and failure
  is written to an audit log. Export a project's secrets as a `.env` on demand.
- **Database manager** (§22) — 7 providers, schema notes, and a **real TCP
  reachability test** with latency.
- **API manager** (§23) — REST + GraphQL collections with headers, bodies, auth,
  `{{variables}}`, Postman v2.1 **import/export**, and a **server-side sender**
  so CORS never blocks you.
- **Deployments** (§24) — 8 providers, environments, history, build logs and
  **one-click rollback**.
- **Storage analytics** (§34) — logical vs physical usage, dedup savings,
  per-project and per-type breakdown, reclaimable space.

### Intelligence & security
- **AI Assistant** (§31) — all 13 capabilities. Uses OpenAI when `OPENAI_API_KEY`
  is set; otherwise a **local analysis engine** reads your real project data and
  still produces useful output offline. Its security review genuinely scans your
  files for hard-coded AWS keys, Stripe keys, GitHub tokens and private keys.
- **Security** (§32) — PBKDF2 password hashing, JWT sessions with server-side
  revocation, **RFC-6238 TOTP 2FA**, active-session management, auto-logout.
- **Settings** (§30) — theme, accent, density, font size, editor behaviour,
  backup policy, notification preferences, security timers, keyboard shortcuts.

---

## Architecture

```
nexus/
├── run.sh                  one-command launcher
├── backend/                Python · FastAPI · SQLAlchemy
│   ├── app/
│   │   ├── main.py         app factory, SPA host, /api/meta
│   │   ├── models.py       all 17 PRD tables
│   │   ├── security.py     PBKDF2, JWT, TOTP, AES-256-GCM vault
│   │   ├── storage.py      content-addressed blob store (dedup)
│   │   ├── ai.py           OpenAI + offline analysis engine
│   │   ├── seed.py         built-in templates + demo workspace
│   │   └── routers/        auth, projects, files, snapshots, tasks,
│   │                       notes, vault, integrations, dashboard,
│   │                       templates, settings, assistant
│   └── smoke_test.py       144 end-to-end assertions
├── web/                    React 18 · Vite · TanStack Query · Framer Motion
│   └── src/
│       ├── lib/            API client + global store
│       ├── components/     shell, palette, code viewer, markdown, UI kit
│       └── pages/          dashboard, projects, project tabs, vault, AI…
├── frontend/               built SPA (served by FastAPI)
├── desktop/                Electron shell
└── data/                   SQLite DB, blobs, snapshots  ← your workspace
```

### Design decisions worth knowing

**Content-addressed storage.** Files are written to `data/blobs/aa/bb/<sha256>`.
Identical content is stored once, so duplicate detection, cheap snapshots and
storage savings all fall out of the same mechanism.

**Snapshots are real archives.** Not a database flag — an actual ZIP you can
download, inspect and carry to another machine.

**The vault never trusts the frontend.** Plaintext exists in exactly two places:
the client that just requested a reveal, and server RAM for the duration of that
request. The database stores only AES-256-GCM ciphertext.

**Offline-capable AI.** A self-hosted tool shouldn't have a dead button when
there's no API key, so the assistant falls back to a real analysis engine over
your actual project data.

---

## Configuration

All settings are environment variables — the same code runs from a laptop to a NAS.

| Variable | Default | Purpose |
|---|---|---|
| `NEXUS_DATA_DIR` | `./data` | Database, blobs, snapshots |
| `NEXUS_DATABASE_URL` | SQLite | Use `postgresql+psycopg://…` in production |
| `NEXUS_SECRET_KEY` | dev key | **Change this in production** |
| `NEXUS_TOKEN_MINUTES` | `720` | Session lifetime |
| `NEXUS_VAULT_MINUTES` | `15` | Vault auto-lock |
| `NEXUS_MAX_UPLOAD_MB` | `512` | Per-file upload cap |
| `NEXUS_STORAGE_QUOTA_GB` | `50` | Quota shown in analytics |
| `OPENAI_API_KEY` | — | Enables the remote AI backend |
| `NEXUS_PORT` | `8000` | HTTP port |

---

## Test results

```
$ ./run.sh test

  NEXUS smoke test — 144 passed, 0 failed / 144
```

The suite covers auth and 2FA, dashboard performance, project lifecycle,
templates, uploads and dedup, recycle bin, code versioning and diffs, snapshot
create/restore round-trips, tasks, notes, vault cryptography (including a check
that the database holds no plaintext), database tests, Postman import/export,
deployments and rollback, search leak-proofing, storage analytics, the AI engine,
settings, and workspace export/import.

## Verified against the PRD's success metrics (§38)

| Target | Measured |
|---|---|
| Dashboard load <100 ms | ~57–72 ms server render |
| Search <1 s | ~19 ms |
| Project creation <5 s | ~60 ms |
| Snapshot success 95% | 100% across the suite |
| Zero secret exposure | asserted — no plaintext in DB, lists or search |

---

## Roadmap (PRD §35)

Git/GitHub/GitLab sync · Docker & Kubernetes · CI/CD pipelines · plugin
marketplace · built-in terminal and IDE · container and VM management · server
monitoring · team collaboration · mobile app · cloud sync · biometric login.
