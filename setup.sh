#!/usr/bin/env bash
# Preflight system deps, create .venv/, install Python deps.
# Does NOT install Homebrew, Python, or espeak-ng — stops with a message instead.
set -euo pipefail

cd "$(dirname "$0")"
HERE="$(pwd)"

echo "==> Kokoro TTS setup"
echo "    cwd: $HERE"

missing=0

if ! command -v brew >/dev/null 2>&1; then
  echo "  [missing] Homebrew. Install from https://brew.sh and re-run." >&2
  missing=1
fi

# Find any Python >= 3.10. Try versioned brewed binaries first because
# /usr/bin/python3 on macOS is often 3.9.
PYBIN=""
for cand in python3.11 python3.12 python3.13 python3.10 python3.14 python3; do
  if command -v "$cand" >/dev/null 2>&1 \
    && "$cand" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
    PYBIN="$cand"
    break
  fi
done

if [ -z "$PYBIN" ]; then
  if command -v python3 >/dev/null 2>&1; then
    FOUND_V=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    echo "  [missing] Python 3.10+ required (only found python3 = $FOUND_V). brew install python@3.13" >&2
  else
    echo "  [missing] python3 not found. brew install python@3.13" >&2
  fi
  missing=1
fi

if ! command -v espeak-ng >/dev/null 2>&1; then
  echo "  [missing] espeak-ng. brew install espeak-ng" >&2
  missing=1
fi

if [ "$missing" -ne 0 ]; then
  echo "==> Missing system deps. Install the items above and re-run ./setup.sh." >&2
  exit 1
fi

PY_V=$("$PYBIN" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "  [ok] Homebrew"
echo "  [ok] Python $PY_V ($(command -v "$PYBIN"))"
echo "  [ok] espeak-ng"

if [ ! -d ".venv" ]; then
  echo "==> Creating venv at .venv/ (using $PYBIN)"
  "$PYBIN" -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "==> Upgrading pip"
pip install --upgrade pip

echo "==> Installing Python deps (kokoro pulls torch — ~700MB first time)"
pip install kokoro fastapi 'uvicorn[standard]' sounddevice numpy

echo
echo "==> Setup complete."
echo "    Start the server with: ./start.sh"
echo "    First start downloads ~330MB of model weights from HuggingFace."
