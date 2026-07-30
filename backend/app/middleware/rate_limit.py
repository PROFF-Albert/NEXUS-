"""Simple in-memory rate limiting middleware."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque

from fastapi import Request, status
from fastapi.responses import JSONResponse


class RateLimitMiddleware:
    def __init__(self, app, limit: int = 240, window_seconds: int = 60) -> None:
        self.app = app
        self.limit = limit
        self.window_seconds = window_seconds
        self._buckets: dict[str, Deque[float]] = defaultdict(deque)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope, receive=receive)
        if request.url.path.startswith("/api/health"):
            await self.app(scope, receive, send)
            return
        key = f"{request.client.host if request.client else 'unknown'}:{request.url.path}"
        now = time.monotonic()
        bucket = self._buckets[key]
        while bucket and now - bucket[0] > self.window_seconds:
            bucket.popleft()
        if len(bucket) >= self.limit:
            response = JSONResponse(
                {"detail": "Rate limit exceeded"},
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            await response(scope, receive, send)
            return
        bucket.append(now)
        await self.app(scope, receive, send)

