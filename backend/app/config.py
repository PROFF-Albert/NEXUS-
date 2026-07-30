"""NEXUS — configuration.

Everything is driven by environment variables so the same codebase runs
from a laptop (SQLite + local disk) up to a NAS/server (PostgreSQL + MinIO).
"""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent          # nexus/
DATA_DIR = Path(os.getenv("NEXUS_DATA_DIR", BASE_DIR / "data"))
BLOB_DIR = DATA_DIR / "blobs"
SNAPSHOT_DIR = DATA_DIR / "snapshots"
EXPORT_DIR = DATA_DIR / "exports"
FRONTEND_DIR = Path(os.getenv("NEXUS_FRONTEND_DIR", BASE_DIR / "frontend"))

for _d in (DATA_DIR, BLOB_DIR, SNAPSHOT_DIR, EXPORT_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# PostgreSQL in production:  postgresql+psycopg://nexus:nexus@localhost/nexus
DATABASE_URL = os.getenv("NEXUS_DATABASE_URL", f"sqlite:///{DATA_DIR / 'nexus.db'}")

SECRET_KEY = os.getenv("NEXUS_SECRET_KEY", "dev-only-change-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("NEXUS_TOKEN_MINUTES", "720"))     # auto-logout window
VAULT_SESSION_MINUTES = int(os.getenv("NEXUS_VAULT_MINUTES", "15"))     # vault re-lock
PBKDF2_ROUNDS = int(os.getenv("NEXUS_PBKDF2_ROUNDS", "200000"))

MAX_UPLOAD_MB = int(os.getenv("NEXUS_MAX_UPLOAD_MB", "512"))
STORAGE_QUOTA_GB = float(os.getenv("NEXUS_STORAGE_QUOTA_GB", "50"))

R2_ENDPOINT_URL = os.getenv("NEXUS_R2_ENDPOINT_URL", "")
R2_ACCESS_KEY_ID = os.getenv("NEXUS_R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("NEXUS_R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.getenv("NEXUS_R2_BUCKET", "nexus-files")
R2_REGION_NAME = os.getenv("NEXUS_R2_REGION_NAME", "auto")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("NEXUS_AI_MODEL", "gpt-4o-mini")
AI_MODE = os.getenv("NEXUS_AI_MODE", "auto")   # auto | remote | local

DEMO_EMAIL = os.getenv("NEXUS_DEMO_EMAIL", "dev@nexus.local")
DEMO_PASSWORD = os.getenv("NEXUS_DEMO_PASSWORD", "nexus")
DEMO_MASTER = os.getenv("NEXUS_DEMO_MASTER", "master-key")

TEXT_EXTENSIONS = {
    "html", "htm", "css", "scss", "js", "jsx", "ts", "tsx", "py", "java", "php",
    "go", "rs", "c", "h", "cpp", "hpp", "cs", "rb", "swift", "kt", "dart", "sql",
    "json", "yaml", "yml", "toml", "ini", "env", "md", "markdown", "txt", "sh",
    "bash", "xml", "svg", "vue", "svelte", "graphql", "prisma", "dockerfile",
}
IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"}
VIDEO_EXTENSIONS = {"mp4", "webm", "mov", "mkv", "avi", "m4v"}
DOC_EXTENSIONS = {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "csv"}
ARCHIVE_EXTENSIONS = {"zip", "tar", "gz", "rar", "7z"}
