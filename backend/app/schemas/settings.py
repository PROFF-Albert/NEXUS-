"""Settings schemas."""
from __future__ import annotations

from pydantic import BaseModel


class SettingUpdate(BaseModel):
    key: str
    value: dict

