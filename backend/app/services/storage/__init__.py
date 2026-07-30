"""Storage service facade."""
from __future__ import annotations

from .analytics import duplicate_stats, logical_usage, physical_usage
from .client import get_backend
from .delete import delete_blob
from .download import download_url, exists, get_bytes, get_path
from .hashing import calculate_sha256, chunk_reader, stream_sha256
from .metadata import classify, guess_category, guess_icon, guess_preview, language_for
from .snapshots import blob_hashes_for_project, unique_blob_hashes
from .upload import put_bytes, put_stream

