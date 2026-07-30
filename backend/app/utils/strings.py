"""String helpers."""
from __future__ import annotations

import re


def slugify(value: str, default: str = "item") -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or default


def normalize_path(path: str) -> str:
    parts = [part for part in path.replace("\\", "/").split("/") if part and part != "."]
    return "/" + "/".join(parts)

