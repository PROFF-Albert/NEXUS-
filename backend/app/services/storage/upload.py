"""Upload helpers."""
from __future__ import annotations

from typing import BinaryIO

from .client import get_backend
from .hashing import calculate_sha256, chunk_reader, stream_sha256


def put_bytes(data: bytes) -> tuple[str, int, bool]:
    return get_backend().put_bytes(data)


def put_stream(stream: BinaryIO, chunk: int = 1024 * 1024) -> tuple[str, int, bool]:
    return get_backend().put_stream(stream, chunk)

