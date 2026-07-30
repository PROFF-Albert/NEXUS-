FROM node:20-bookworm-slim AS frontend-build

WORKDIR /app

COPY web/package*.json ./web/
RUN cd web && npm ci

COPY web ./web
RUN cd web && npm run build

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NEXUS_DATA_DIR=/app/data \
    NEXUS_FRONTEND_DIR=/app/frontend \
    NEXUS_PORT=8000

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY --from=frontend-build /app/frontend ./frontend

RUN mkdir -p /app/data

EXPOSE 8000

CMD ["sh", "-c", "python -m uvicorn app.main:app --app-dir /app/backend --host 0.0.0.0 --port ${PORT:-8000}"]
