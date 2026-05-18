#!/usr/bin/env bash
# @raycast.schemaVersion 1
# @raycast.title Speak Selection
# @raycast.mode silent
# @raycast.packageName Kokoro TTS
# @raycast.icon 🔊
# @raycast.description Read the highlighted text aloud via local Kokoro TTS
#
# Grabs the current selection by:
#   1. saving the existing clipboard
#   2. writing a unique sentinel to the clipboard
#   3. firing Cmd-C via AppleScript
#   4. checking whether the sentinel was overwritten (i.e. something was selected)
#   5. restoring the original clipboard
# Sends the captured text to the local Kokoro server. New requests preempt
# any in-progress utterance on the server side.
set -euo pipefail

PORT=8123
SENTINEL="__kokoro_selection_${$}_$(date +%s%N)__"

OLD_CLIP="$(pbpaste || true)"
printf '%s' "$SENTINEL" | pbcopy

osascript -e 'tell application "System Events" to keystroke "c" using command down'
sleep 0.15

NEW_CLIP="$(pbpaste || true)"

# Restore original clipboard contents no matter what happens next.
printf '%s' "$OLD_CLIP" | pbcopy

if [ "$NEW_CLIP" = "$SENTINEL" ] || [ -z "$NEW_CLIP" ]; then
  # Nothing was selected — exit silently so Raycast doesn't beep.
  exit 0
fi

# JSON-encode safely (handles newlines, quotes, unicode).
PAYLOAD="$(printf '%s' "$NEW_CLIP" | python3 -c 'import json,sys; print(json.dumps({"text": sys.stdin.read()}))')"

curl -fsS -X POST "http://127.0.0.1:${PORT}/speak" \
  -H 'Content-Type: application/json' \
  --data-binary "$PAYLOAD" >/dev/null
