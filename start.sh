#!/usr/bin/env bash
# Activate the venv and run the Kokoro server (blocking).
# To run in the background: ./start.sh > /tmp/kokoro-tts.log 2>&1 &
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  echo "ERROR: .venv/ not found. Run ./setup.sh first." >&2
  exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate
exec python kokoro_server.py
