#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.campcloud-dev"

MYSQL_CONTAINER_NAME="${MYSQL_CONTAINER_NAME:-campcloud-mysql}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

log() {
  printf '[campcloud-dev] %s\n' "$*"
}

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

stop_pid_file_process() {
  local pid_file="$1"
  local label="$2"

  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  rm -f "$pid_file"

  if [[ -z "$pid" ]] || ! is_pid_running "$pid"; then
    return 1
  fi

  log "Stopping ${label} process ${pid}"
  kill "$pid" >/dev/null 2>&1 || true

  local index
  for ((index = 1; index <= 20; index += 1)); do
    if ! is_pid_running "$pid"; then
      return 0
    fi
    sleep 0.5
  done

  log "Force killing ${label} process ${pid}"
  kill -9 "$pid" >/dev/null 2>&1 || true
  return 0
}

stop_port_process() {
  local port="$1"
  local label="$2"
  local stopped=1
  local pid

  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    stopped=0
    log "Stopping ${label} process ${pid} on port ${port}"
    kill "$pid" >/dev/null 2>&1 || true
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)

  return "$stopped"
}

stop_mysql_container() {
  if ! command -v docker >/dev/null 2>&1; then
    log 'Docker not installed, skipping MySQL container shutdown'
    return 0
  fi

  local running_name
  running_name="$(docker ps --filter "name=^/${MYSQL_CONTAINER_NAME}$" --format '{{.Names}}' | head -n 1)"
  if [[ -z "$running_name" ]]; then
    log "MySQL container ${MYSQL_CONTAINER_NAME} is not running"
    return 0
  fi

  log "Stopping MySQL container ${MYSQL_CONTAINER_NAME}"
  docker stop "$MYSQL_CONTAINER_NAME" >/dev/null
}

mkdir -p "$RUN_DIR"

stop_pid_file_process "$BACKEND_PID_FILE" 'backend' || stop_port_process "$BACKEND_PORT" 'backend' || true
stop_pid_file_process "$FRONTEND_PID_FILE" 'frontend' || stop_port_process "$FRONTEND_PORT" 'frontend' || true
stop_mysql_container

log 'CampCloud dev services stopped'
