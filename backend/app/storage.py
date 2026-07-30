"""Compatibility facade for storage helpers.

The app still imports `app.storage` throughout the codebase. This module now
forwards those calls into the new storage service package so the implementation
can evolve without another wide rename.
"""
from __future__ import annotations

from .services.storage import (  # noqa: F401
    calculate_sha256, classify, chunk_reader, delete_blob, download_url, duplicate_stats, exists,
    get_backend, get_bytes, get_path, guess_category, guess_icon, guess_preview, language_for,
    logical_usage, physical_usage, put_bytes, put_stream, stream_sha256,
    blob_hashes_for_project, unique_blob_hashes,
)

