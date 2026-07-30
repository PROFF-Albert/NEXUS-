"""Legacy local-disk storage backend.

This is kept as a fallback and migration safety copy of the original
content-addressed blob store while the service layer moves toward R2.
"""
from __future__ import annotations

import hashlib
import mimetypes
import os
import shutil
from pathlib import Path
from typing import BinaryIO

from .config import (ARCHIVE_EXTENSIONS, BLOB_DIR, DOC_EXTENSIONS, IMAGE_EXTENSIONS,
                     TEXT_EXTENSIONS, VIDEO_EXTENSIONS)


def _blob_path(sha: str) -> Path:
    return BLOB_DIR / sha[:2] / sha[2:4] / sha


def put_bytes(data: bytes) -> tuple[str, int, bool]:
    sha = hashlib.sha256(data).hexdigest()
    path = _blob_path(sha)
    if path.exists():
        return sha, len(data), True
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)
    return sha, len(data), False


def put_stream(stream: BinaryIO, chunk: int = 1024 * 1024) -> tuple[str, int, bool]:
    hasher = hashlib.sha256()
    tmp = BLOB_DIR / f".upload-{os.urandom(8).hex()}"
    size = 0
    with tmp.open("wb") as out:
        while True:
            buf = stream.read(chunk)
            if not buf:
                break
            hasher.update(buf)
            out.write(buf)
            size += len(buf)
    sha = hasher.hexdigest()
    dest = _blob_path(sha)
    if dest.exists():
        tmp.unlink(missing_ok=True)
        return sha, size, True
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(tmp), str(dest))
    return sha, size, False


def get_bytes(sha: str) -> bytes:
    path = _blob_path(sha)
    return path.read_bytes() if path.exists() else b""


def get_path(sha: str) -> Path:
    return _blob_path(sha)


def exists(sha: str) -> bool:
    return _blob_path(sha).exists()


def delete(sha: str) -> bool:
    path = _blob_path(sha)
    if not path.exists():
        return False
    path.unlink()
    return True


def physical_usage() -> int:
    total = 0
    for root, _dirs, files in os.walk(BLOB_DIR):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def classify(filename: str) -> tuple[str, str, str]:
    ext = Path(filename).suffix.lower().lstrip(".")
    if not ext and filename.lower() in {"dockerfile", "makefile", "procfile", ".env"}:
        ext = filename.lower().lstrip(".")
    if ext in IMAGE_EXTENSIONS:
        kind = "image"
    elif ext in VIDEO_EXTENSIONS:
        kind = "video"
    elif ext in TEXT_EXTENSIONS:
        kind = "text"
    elif ext in DOC_EXTENSIONS:
        kind = "doc"
    elif ext in ARCHIVE_EXTENSIONS:
        kind = "archive"
    else:
        kind = "binary"
    mime = mimetypes.guess_type(filename)[0] or (
        "text/plain" if kind == "text" else "application/octet-stream")
    return ext, kind, mime


LANGUAGE_BY_EXT = {
    "js": "javascript", "jsx": "javascript", "ts": "typescript", "tsx": "typescript",
    "py": "python", "java": "java", "php": "php", "go": "go", "rs": "rust",
    "c": "c", "h": "c", "cpp": "cpp", "hpp": "cpp", "cs": "csharp", "rb": "ruby",
    "html": "html", "htm": "html", "css": "css", "scss": "scss", "json": "json",
    "yaml": "yaml", "yml": "yaml", "md": "markdown", "markdown": "markdown",
    "sql": "sql", "sh": "bash", "bash": "bash", "xml": "xml", "svg": "xml",
    "toml": "toml", "ini": "ini", "env": "bash", "vue": "html", "svelte": "html",
    "dart": "dart", "kt": "kotlin", "swift": "swift", "graphql": "graphql",
    "dockerfile": "docker", "txt": "text",
}


def language_for(ext: str) -> str:
    return LANGUAGE_BY_EXT.get(ext, "text")

