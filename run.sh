#!/usr/bin/env bash
# NEXUS — one-command launcher.
#   ./run.sh          start the app on http://localhost:8000
#   ./run.sh build    rebuild the frontend, then start
#   ./run.sh test     run the backend smoke test suite
#   ./run.sh dev      run backend + vite dev server with hot reload
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${NEXUS_PORT:-8000}"
export NEXUS_DATA_DIR="${NEXUS_DATA_DIR:-$ROOT/data}"
export NEXUS_FRONTEND_DIR="${NEXUS_FRONTEND_DIR:-$ROOT/frontend}"

banner() {
  printf '\n\033[1;35m  N E X U S\033[0m  ·  The Private Developer Operating System\n'
  printf '  \033[2mOne Workspace. Every Project. Zero Chaos.\033[0m\n\n'
}

ensure_python_deps() {
  python3 - <<'PY' 2>/dev/null || pip install -q -r "$ROOT/backend/requirements.txt"
import fastapi, uvicorn, sqlalchemy, jwt, cryptography  # noqa
PY
}

build_frontend() {
  echo "▸ Building frontend…"
  cd "$ROOT/web"
  [ -d node_modules ] || npm install --no-audit --no-fund
  npx vite build
  cd "$ROOT"
}

case "${1:-start}" in
  build)
    banner; ensure_python_deps; build_frontend
    exec python3 -m uvicorn app.main:app --app-dir "$ROOT/backend" --host 0.0.0.0 --port "$PORT"
    ;;
  test)
    banner; ensure_python_deps
    exec python3 -W ignore "$ROOT/backend/smoke_test.py"
    ;;
  dev)
    banner; ensure_python_deps
    python3 -m uvicorn app.main:app --app-dir "$ROOT/backend" --host 127.0.0.1 --port "$PORT" --reload &
    BACK=$!
    trap 'kill $BACK 2>/dev/null || true' EXIT
    cd "$ROOT/web"
    [ -d node_modules ] || npm install --no-audit --no-fund
    exec npx vite
    ;;
  *)
    banner; ensure_python_deps
    [ -f "$ROOT/frontend/index.html" ] || build_frontend
    echo "▸ Serving on http://localhost:$PORT"
    echo "▸ Demo login: dev@nexus.local / nexus   (vault master password: master-key)"
    echo
    exec python3 -m uvicorn app.main:app --app-dir "$ROOT/backend" --host 0.0.0.0 --port "$PORT"
    ;;
esac
