"""Domain exceptions used by services and routes."""
from __future__ import annotations


class NEXUSError(Exception):
    """Base application error."""


class NotFoundError(NEXUSError):
    """Raised when a resource is missing or not owned."""


class ConflictError(NEXUSError):
    """Raised when a requested change conflicts with current state."""


class ValidationError(NEXUSError):
    """Raised when user input fails validation."""

