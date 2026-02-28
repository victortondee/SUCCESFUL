#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.server.pid"
LOG_FILE="$ROOT_DIR/.server.log"
HOST="127.0.0.1"
PORT="3000"
URL="http://$HOST:$PORT/"

is_pid_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

is_http_up() {
  curl -sS -m 1 -o /dev/null "$URL" >/dev/null 2>&1
}

start_server() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && is_pid_running "$pid" && is_http_up; then
      echo "Server already running (pid $pid): $URL"
      exit 0
    fi
    rm -f "$PID_FILE"
  fi

  (
    cd "$ROOT_DIR"
    if command -v setsid >/dev/null 2>&1; then
      setsid node server.js >>"$LOG_FILE" 2>&1 < /dev/null &
    else
      nohup node server.js >>"$LOG_FILE" 2>&1 < /dev/null &
    fi
    echo $! >"$PID_FILE"
  )

  local pid
  pid="$(cat "$PID_FILE")"
  for _ in {1..20}; do
    if is_http_up; then
      echo "Server started (pid $pid): $URL"
      echo "Log: $LOG_FILE"
      exit 0
    fi
    sleep 0.15
  done

  echo "Server did not become ready. Last log lines:"
  tail -n 40 "$LOG_FILE" 2>/dev/null || true
  exit 1
}

stop_server() {
  if [[ ! -f "$PID_FILE" ]]; then
    echo "Server not running (no pid file)."
    exit 0
  fi

  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -z "${pid:-}" ]]; then
    rm -f "$PID_FILE"
    echo "Removed empty pid file."
    exit 0
  fi

  if is_pid_running "$pid"; then
    kill "$pid" >/dev/null 2>&1 || true
    for _ in {1..20}; do
      if ! is_pid_running "$pid"; then
        rm -f "$PID_FILE"
        echo "Server stopped."
        exit 0
      fi
      sleep 0.1
    done
    echo "Server is still running (pid $pid)."
    exit 1
  fi

  rm -f "$PID_FILE"
  echo "Removed stale pid file."
}

status_server() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && is_pid_running "$pid" && is_http_up; then
      echo "Running (pid $pid): $URL"
      exit 0
    fi
  fi
  echo "Not running."
  exit 1
}

case "${1:-}" in
  start) start_server ;;
  stop) stop_server ;;
  status) status_server ;;
  *)
    echo "Usage: $0 {start|stop|status}"
    exit 2
    ;;
esac
