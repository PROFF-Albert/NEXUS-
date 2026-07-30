"""File metadata classification helpers."""
from __future__ import annotations

import mimetypes
from pathlib import Path

from ...config import (ARCHIVE_EXTENSIONS, DOC_EXTENSIONS, IMAGE_EXTENSIONS,
                       TEXT_EXTENSIONS, VIDEO_EXTENSIONS)

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

ICON_BY_KIND = {
    "text": "file-text",
    "image": "image",
    "video": "video",
    "doc": "file",
    "archive": "archive",
    "binary": "file",
}

CATEGORY_BY_KIND = {
    "text": "Source Code",
    "image": "Media",
    "video": "Media",
    "doc": "Documents",
    "archive": "Archives",
    "binary": "Files",
}


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


def language_for(ext: str) -> str:
    return LANGUAGE_BY_EXT.get(ext, "text")


def guess_icon(kind: str, filename: str = "") -> str:
    if kind == "binary" and filename:
        _, kind, _ = classify(filename)
    return ICON_BY_KIND.get(kind, "file")


def guess_category(kind: str, filename: str = "") -> str:
    if kind == "binary" and filename:
        _, kind, _ = classify(filename)
    return CATEGORY_BY_KIND.get(kind, "Files")


def guess_preview(kind: str, filename: str = "") -> str:
    ext = Path(filename).suffix.lower().lstrip(".")
    if kind == "image":
        return "thumbnail"
    if kind == "video":
        return "video frame"
    if kind == "doc":
        return "document preview"
    if ext in {"py", "ts", "tsx", "js", "jsx", "go", "rs", "java", "php", "html", "css"}:
        return "code preview"
    return "generic file preview"

