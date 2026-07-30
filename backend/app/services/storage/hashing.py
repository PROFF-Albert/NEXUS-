"""Hashing helpers for content-addressed storage."""
from __future__ import annotations

import hashlib
from typing import BinaryIO, Iterator


def chunk_reader(stream: BinaryIO, chunk_size: int = 1024 * 1024) -> Iterator[bytes]:
    while True:
        chunk = stream.read(chunk_size)
        if not chunk:
            break
        yield chunk


def calculate_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stream_sha256(stream: BinaryIO, chunk_size: int = 1024 * 1024) -> tuple[str, int]:
    hasher = hashlib.sha256()
    size = 0
    for chunk in chunk_reader(stream, chunk_size):
        hasher.update(chunk)
        size += len(chunk)
    return hasher.hexdigest(), size

