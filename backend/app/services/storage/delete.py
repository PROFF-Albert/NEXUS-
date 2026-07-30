"""Blob deletion helpers."""
from __future__ import annotations

from .client import get_backend


def delete_blob(sha: str) -> bool:
    return get_backend().delete(sha)

