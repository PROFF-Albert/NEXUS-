"""NEXUS API entrypoint."""
from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import FRONTEND_DIR, MAX_UPLOAD_MB, STORAGE_QUOTA_GB
from .core.exceptions import ConflictError, NEXUSError, NotFoundError, ValidationError
from .database import init_db
from .middleware.rate_limit import RateLimitMiddleware
from .routes import (activity, files, folders, notes, projects, search, settings, snapshots,
                     tasks, workspaces)
from .routers import auth


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    from .seed import seed_demo
    seed_demo()
    yield


app = FastAPI(
    title="NEXUS",
    version="2.0.0",
    description="The Private Developer Operating System",
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"], expose_headers=["*"])
app.add_middleware(RateLimitMiddleware, limit=300, window_seconds=60)


@app.middleware("http")
async def timing(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Response-Time-Ms"] = f"{(time.perf_counter() - started) * 1000:.2f}"
    return response


@app.exception_handler(NotFoundError)
async def handle_not_found(_request: Request, exc: NotFoundError):
    return JSONResponse({"detail": str(exc)}, status_code=status.HTTP_404_NOT_FOUND)


@app.exception_handler(ValidationError)
async def handle_validation(_request: Request, exc: ValidationError):
    return JSONResponse({"detail": str(exc)}, status_code=status.HTTP_400_BAD_REQUEST)


@app.exception_handler(ConflictError)
async def handle_conflict(_request: Request, exc: ConflictError):
    return JSONResponse({"detail": str(exc)}, status_code=status.HTTP_409_CONFLICT)


@app.exception_handler(NEXUSError)
async def handle_domain_error(_request: Request, exc: NEXUSError):
    return JSONResponse({"detail": str(exc)}, status_code=status.HTTP_400_BAD_REQUEST)


for _router in (
    auth.router,
    workspaces.router,
    projects.router,
    folders.router,
    files.router,
    snapshots.router,
    notes.router,
    tasks.router,
    search.router,
    settings.router,
    activity.router,
):
    app.include_router(_router)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "app": "NEXUS",
        "version": "2.0.0",
        "motto": "One Workspace. Every Project. Zero Chaos.",
        "limits": {"maxUploadMb": MAX_UPLOAD_MB, "storageQuotaGb": STORAGE_QUOTA_GB},
    }


@app.get("/api/meta")
def meta():
    from .services.tasks import PRIORITIES as TASK_PRIORITIES, STATUSES as TASK_STATUSES

    return {
        "taskStatuses": TASK_STATUSES,
        "taskPriorities": TASK_PRIORITIES,
        "categories": ["Application", "Website", "Backend", "Mobile", "Desktop",
                       "Marketplace", "Tool", "Library", "Game", "AI/ML", "Experiment"],
        "languages": ["TypeScript", "JavaScript", "Python", "Go", "Rust", "Java", "PHP", "C",
                      "C++", "C#", "Ruby", "Dart", "Kotlin", "Swift", "HTML", "SQL"],
        "frameworks": ["React", "Next.js", "React + Vite", "Vue", "Svelte", "Astro",
                       "Angular", "FastAPI", "Django", "Flask", "Express", "NestJS",
                       "Laravel", "Rails", "Flutter", "React Native", "Electron", "Tailwind"],
        "icons": ["rocket", "dumbbell", "server", "user", "shopping-cart", "layout", "atom",
                  "smartphone", "monitor", "cloud", "database", "code", "package", "cpu",
                  "globe", "zap", "book", "camera", "music", "gamepad"],
    }


if FRONTEND_DIR.exists():
    assets = FRONTEND_DIR / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        candidate = FRONTEND_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        index = FRONTEND_DIR / "index.html"
        if index.exists():
            return FileResponse(index)
        return JSONResponse({"detail": "Frontend not built"}, status_code=404)

