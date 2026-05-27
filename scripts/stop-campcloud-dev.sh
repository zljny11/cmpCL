#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.campcloud-dev"

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

collect_child_pids() {
  local parent_pid="$1"
  local child_pid

  while IFS= read -r child_pid; do
    [[ -n "$child_pid" ]] || continue
    collect_child_pids "$child_pid"
    printf '%s\n' "$child_pid"
  done < <(pgrep -P "$parent_pid" 2>/dev/null || true)
}

stop_pid_tree() {
  local pid="$1"
  local label="$2"
  local child_pid
  local pids=()

  if ! is_pid_running "$pid"; then
    return 0
  fi

  while IFS= read -r child_pid; do
    [[ -n "$child_pid" ]] || continue
    pids+=("$child_pid")
  done < <(collect_child_pids "$pid")
  pids+=("$pid")

  log "Stopping ${label} PID tree: ${pids[*]}"
  kill "${pids[@]}" >/dev/null 2>&1 || true
  sleep 1

  local survivors=()
  local current_pid
  for current_pid in "${pids[@]}"; do
    if is_pid_running "$current_pid"; then
      survivors+=("$current_pid")
    fi
  done

  if [[ "${#survivors[@]}" -gt 0 ]]; then
    log "Force stopping ${label} PID tree: ${survivors[*]}"
    kill -9 "${survivors[@]}" >/dev/null 2>&1 || true
  fi
}

stop_from_pid_file() {
  local pid_file="$1"
  local label="$2"

  cleanup_stale_pid_file "$pid_file"
  if [[ ! -f "$pid_file" ]]; then
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]]; then
    stop_pid_tree "$pid" "$label"
  fi

  rm -f "$pid_file"
}

stop_port_listener() {
  local port="$1"
  local label="$2"
  local pid

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    stop_pid_tree "$pid" "${label} port ${port}"
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
}

stop_by_pattern() {
  local pattern="$1"
  local label="$2"
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    log "Stopping residual ${label}: ${pattern}"
    pkill -f "$pattern" >/dev/null 2>&1 || true
  fi
}

main() {
  mkdir -p "$RUN_DIR"

  stop_from_pid_file "$BACKEND_PID_FILE" "backend"
  stop_from_pid_file "$FRONTEND_PID_FILE" "frontend"

  stop_port_listener "$BACKEND_PORT" "backend"
  stop_port_listener "$FRONTEND_PORT" "frontend"

  stop_by_pattern "node scripts/dev-server.js" "backend dev server"
  stop_by_pattern "vite --host 127.0.0.1 --port ${FRONTEND_PORT}" "frontend vite server"
  stop_by_pattern "vite --force" "frontend vite server"
  stop_by_pattern "npm run start:dev" "backend npm wrapper"
  stop_by_pattern "npm run dev -- --host 127.0.0.1 --port ${FRONTEND_PORT} --force" "frontend npm wrapper"

  rm -f "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"
  log 'AICampCloud dev processes stopped'
}

main "$@"
