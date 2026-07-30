"""Download and read helpers."""
from __future__ import annotations

from pathlib import Path

from .client import get_backend


def get_bytes(sha: str) -> bytes:
    return get_backend().get_bytes(sha)


def get_path(sha: str) -> Path:
    return get_backend().get_path(sha)


def exists(sha: str) -> bool:
    return get_backend().exists(sha)


def download_url(sha: str, filename: str = "", expires_in: int = 3600,
                 download: bool = False) -> str | None:
    return get_backend().download_url(sha, filename=filename, expires_in=expires_in,
                                      download=download)
