#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/campcloud-web"
SERVER_DIR="$ROOT_DIR/campcloud-server"
RUN_DIR="$ROOT_DIR/.campcloud-dev"
LOG_DIR="$RUN_DIR/logs"

MYSQL_CONTAINER_NAME="${MYSQL_CONTAINER_NAME:-campcloud-mysql}"
MYSQL_IMAGE="${MYSQL_IMAGE:-mysql:8.4}"
MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3308}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-password}"
MYSQL_DATABASE="${MYSQL_DATABASE:-campcloud}"

BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

mkdir -p "$LOG_DIR"

log() {
  printf '[campcloud-dev] %s\n' "$*"
}

fail() {
  printf '[campcloud-dev] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

cleanup_stale_pid_file() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -z "$pid" ]] || ! is_pid_running "$pid"; then
      rm -f "$pid_file"
    fi
  fi
}

port_is_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-60}"
  local sleep_seconds="${3:-1}"

  local index
  for ((index = 1; index <= attempts; index += 1)); do
    if curl -fsS -o /dev/null "$url"; then
      return 0
    fi
    sleep "$sleep_seconds"
  done

  return 1
}

wait_for_mysql() {
  local attempts="${1:-60}"
  local sleep_seconds="${2:-1}"

  local index
  for ((index = 1; index <= attempts; index += 1)); do
    if mysqladmin ping -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$sleep_seconds"
  done

  return 1
}

ensure_docker_ready() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if command -v open >/dev/null 2>&1; then
    log 'Docker daemon not ready, opening Docker Desktop'
    open -a Docker >/dev/null 2>&1 || true
  fi

  local index
  for ((index = 1; index <= 90; index += 1)); do
    if docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  fail 'Docker daemon did not become ready in time'
}

ensure_mysql_container() {
  local existing_name
  existing_name="$(docker ps -a --filter "name=^/${MYSQL_CONTAINER_NAME}$" --format '{{.Names}}' | head -n 1)"

  if [[ -z "$existing_name" ]]; then
    log "Creating MySQL container ${MYSQL_CONTAINER_NAME}"
    docker run -d \
      --name "$MYSQL_CONTAINER_NAME" \
      -e "MYSQL_ROOT_PASSWORD=$MYSQL_PASSWORD" \
      -e "MYSQL_DATABASE=$MYSQL_DATABASE" \
      -p "$MYSQL_PORT:3306" \
      "$MYSQL_IMAGE" >/dev/null
  else
    local running_name
    running_name="$(docker ps --filter "name=^/${MYSQL_CONTAINER_NAME}$" --format '{{.Names}}' | head -n 1)"
    if [[ -z "$running_name" ]]; then
      log "Starting existing MySQL container ${MYSQL_CONTAINER_NAME}"
      docker start "$MYSQL_CONTAINER_NAME" >/dev/null
    else
      log "MySQL container ${MYSQL_CONTAINER_NAME} already running"
    fi
  fi

  log "Waiting for MySQL on ${MYSQL_HOST}:${MYSQL_PORT}"
  wait_for_mysql 90 2 || fail 'MySQL did not become ready in time'
}

prepare_backend() {
  log 'Preparing backend Prisma client and database schema'
  (
    cd "$SERVER_DIR"
    npm run prisma:generate >/dev/null
    npx prisma migrate deploy >/dev/null
    npm run prisma:seed >/dev/null
  )
}

start_backend() {
  cleanup_stale_pid_file "$BACKEND_PID_FILE"

  if port_is_listening "$BACKEND_PORT"; then
    log "Backend port ${BACKEND_PORT} already listening, reusing existing process"
    return 0
  fi

  log "Starting backend on port ${BACKEND_PORT}"
  (
    cd "$SERVER_DIR"
    nohup npm run start:dev >"$BACKEND_LOG" 2>&1 &
    echo $! >"$BACKEND_PID_FILE"
  )

  wait_for_http "http://127.0.0.1:${BACKEND_PORT}/api/v1/auth/me" 60 1 || {
    tail -n 80 "$BACKEND_LOG" >&2 || true
    fail 'Backend did not become ready in time'
  }
}

start_frontend() {
  cleanup_stale_pid_file "$FRONTEND_PID_FILE"

  if port_is_listening "$FRONTEND_PORT"; then
    log "Frontend port ${FRONTEND_PORT} already listening, reusing existing process"
    return 0
  fi

  log 'Resetting Vite optimize cache'
  rm -rf "$WEB_DIR/node_modules/.vite"
  mkdir -p "$WEB_DIR/node_modules/.vite"

  log "Starting frontend on port ${FRONTEND_PORT}"
  (
    cd "$WEB_DIR"
    nohup npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" --force >"$FRONTEND_LOG" 2>&1 &
    echo $! >"$FRONTEND_PID_FILE"
  )

  wait_for_http "http://127.0.0.1:${FRONTEND_PORT}/" 60 1 || {
    tail -n 80 "$FRONTEND_LOG" >&2 || true
    fail 'Frontend did not become ready in time'
  }
}

print_summary() {
  printf '\n'
  log "Frontend: http://127.0.0.1:${FRONTEND_PORT}/"
  log "Backend:  http://127.0.0.1:${BACKEND_PORT}/api/v1"
  log "MySQL:    ${MYSQL_HOST}:${MYSQL_PORT} (${MYSQL_CONTAINER_NAME})"
  log "Logs:     $LOG_DIR"
  log "Users:    demo / 123456, admin / 123456"
}

require_command docker
require_command mysqladmin
require_command curl
require_command lsof
require_command npm
require_command npx

ensure_docker_ready
ensure_mysql_container
prepare_backend
start_backend
start_frontend
print_summary
