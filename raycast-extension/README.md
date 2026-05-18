# Kokoro TTS — Raycast Extension

A polished local text-to-speech extension with **two backends**:

- **macOS `say`** (default, works on every Mac with no install)
- **Local Kokoro 82M server** (optional, premium voice quality)

Hit a hotkey to read selected text aloud. Hit another to stop. Voice picker, speed control, per-utterance overrides, clipboard support, and a HUD that tells you what's happening.

## Commands

| Command | What it does |
|---|---|
| **Speak Selection** | Captures the current selection and reads it aloud. Native `getSelectedText()` first, Cmd-C + sentinel clipboard fallback for apps like Terminal. |
| **Stop Speaking** | Cancels any in-progress utterance. |
| **Speak Clipboard** | Reads the clipboard contents aloud. |
| **Speak Text** | Form with a text area, per-utterance voice override, speed control, and cleanup toggle. |
| **Voices** | Browse voices grouped by backend. Preview, set per-backend defaults, recheck server status. |

## Preferences

- **TTS Backend** — `Auto` (default), `Kokoro server`, or `System (macOS say)`.
  - **Auto** tries the Kokoro server first; falls back to `say` if unreachable.
  - **Kokoro** forces the server even if down (you'll get a toast with recovery).
  - **System** uses `say` exclusively, ignoring any Kokoro server.
- **Kokoro server URL** — defaults to `http://127.0.0.1:8123`. Only relevant when the Kokoro backend is in use.

## Setup

### macOS `say` backend (default — zero install)

Works out of the box. Optional upgrade: download Apple's neural voices.

1. System Settings → Accessibility → Spoken Content → System Voice → **Manage Voices**
2. Look for voices marked **(Premium)** or **(Enhanced)** — e.g. Ava (Premium), Zoe (Premium), Evan (Enhanced)
3. Download the ones you like (~50–200MB each, one-time)
4. They'll appear immediately in the **Voices** command

### Kokoro server backend (optional)

Better voice quality, requires running a small local Python server.

See the [main repo README](../README.md) for installation. Once it's running on `127.0.0.1:8123`, the extension auto-detects it and adds the Kokoro voices to the picker.

## How it works

### Selection capture (`src/lib/selection.ts`)

Two-tier strategy:

1. **Native** (`@raycast/api`'s `getSelectedText()`) — uses macOS's `NSServicesMenuRequestor`. Fast, no clipboard side effects. Doesn't work in Terminal/iTerm/Warp or some Electron apps.
2. **Cmd-C + sentinel fallback** — saves the clipboard, writes a unique sentinel, fires `Cmd-C` via AppleScript, polls for 150ms, restores. Works in any app that responds to Cmd-C.

The first **Speak Selection** invocation prompts for Accessibility permission for the AppleScript Cmd-C path. Grant once via System Settings → Privacy & Security → Accessibility → toggle Raycast on.

### Backend dispatch (`src/lib/api.ts`)

`speak()` is the public surface. It reads the `backend` preference and dispatches:

- `"say"` → `lib/backend/say.ts` (spawn `/usr/bin/say` as a detached child, track PID in `/tmp/kokoro-tts-say.pid`)
- `"kokoro"` → `lib/backend/kokoro.ts` (POST to `serverUrl/speak`)
- `"auto"` → ping `kokoroHealth()` with a 1.5s timeout; use Kokoro if reachable, otherwise say

Each backend tracks its own default voice in `LocalStorage` (different voice IDs, can't share). Speed is shared.

### Text cleanup (`src/lib/cleanup.ts`)

Markdown, code fences, URLs, ANSI codes, headers, lists — all stripped before speaking. Direct TypeScript port of the server's regex pipeline so the `say` backend gets the same behavior. Togglable per-utterance in **Speak Text**.

## Development

```
npm install
npm run dev    # registers with Raycast, hot-reloads on changes
npm run build  # production build (used by ray submit)
npm run lint   # ESLint + Raycast checks
```

For an always-running dev server across reboots, drop a LaunchAgent plist at `~/Library/LaunchAgents/local.kokoro-raycast.plist` that runs `start-dev.sh`. Sample plist:

```xml
<plist version="1.0">
  <dict>
    <key>Label</key><string>local.kokoro-raycast</string>
    <key>ProgramArguments</key>
    <array><string>/absolute/path/to/raycast-extension/start-dev.sh</string></array>
    <key>WorkingDirectory</key><string>/absolute/path/to/raycast-extension</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>30</integer>
    <key>StandardOutPath</key><string>/tmp/kokoro-raycast-dev.log</string>
    <key>StandardErrorPath</key><string>/tmp/kokoro-raycast-dev.log</string>
    <key>EnvironmentVariables</key>
    <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  </dict>
</plist>
```

Load it with `launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/local.kokoro-raycast.plist`.

## Credits

- **macOS system voices** courtesy of Apple Inc., used under the [macOS Software License Agreement](https://www.apple.com/legal/sla/) (System Voices clause). System Voices are licensed by Apple for personal, non-commercial use only.
- **Kokoro 82M model** by [hexgrad](https://huggingface.co/hexgrad/Kokoro-82M), licensed under Apache 2.0.
- **misaki** G2P library by [hexgrad](https://github.com/hexgrad/misaki), licensed under Apache 2.0.
- **eSpeak NG** for phoneme fallback, licensed under GPL-3.0-or-later.
- **Raycast** for the extension platform.

This extension is not affiliated with Apple Inc., hexgrad, the eSpeak NG project, or Raycast Technologies Ltd.

## License

MIT. See [LICENSE](LICENSE).
