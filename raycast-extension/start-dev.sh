#!/usr/bin/env bash
# Wrapper invoked by a LaunchAgent (see CONTRIBUTING.md in this folder for the
# plist template). Runs `ray develop` so Raycast picks up the extension at
# every login without needing to keep a terminal open.
set -euo pipefail

cd "$(dirname "$0")"

# launchd's default PATH doesn't include Homebrew, where node/npm live.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# `npm run dev` resolves to `ray develop` via package.json scripts.
exec /opt/homebrew/bin/npm run dev
