#!/usr/bin/env bash
# @raycast.schemaVersion 1
# @raycast.title Stop Speaking
# @raycast.mode silent
# @raycast.packageName Kokoro TTS
# @raycast.icon 🔇
# @raycast.description Stop any in-progress Kokoro TTS playback
set -euo pipefail

curl -fsS -X POST "http://127.0.0.1:8123/stop" >/dev/null || true
