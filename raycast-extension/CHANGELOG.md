# Kokoro TTS Changelog

## [Initial Version] - {PR_MERGE_DATE}

### Backends

- **Dual-backend architecture**: macOS `say` (default, no install) and optional local Kokoro 82M server
- **Auto-detection**: extension probes the Kokoro server's `/health` endpoint; falls back to `say` if unreachable
- **TTS Backend preference**: user can pin to Kokoro, force System (`say`), or use Auto

### Commands

- **Speak Selection** — captures the current selection (native + Cmd-C clipboard sentinel fallback) and reads it aloud
- **Stop Speaking** — cancels in-progress utterance
- **Speak Clipboard** — reads the clipboard contents aloud
- **Speak Text** — form view with multiline text area, per-utterance voice override, speed dropdown, cleanup toggle
- **Voices** — browse Kokoro and macOS voices grouped by source, preview any, set per-backend defaults

### Voice picker

- **macOS voices** discovered dynamically via `say -v "?"`; grouped by tier (Premium / Enhanced / Standard) and language
- **Kokoro voices** static catalog of 19 American English voices (af_* female, am_* male) shown when the server is reachable
- **Per-backend defaults** stored separately in `LocalStorage`; speed is shared
- **Speed control** (0.75× – 2×) in the search-bar accessory of the Voices command and per-utterance in Speak Text

### Polish

- Smart text cleanup: strips markdown, code fences, URLs, ANSI escape codes before speaking (togglable per utterance)
- HUD feedback on every command (selection preview, voice + speed echo)
- `showFailureToast` with "Open Preferences" recovery on any reachability failure
- `useCachedPromise` + `useLocalStorage` + `useForm` throughout, per Raycast's current best practices
- Custom per-command icons; light/dark-mode-safe gradient styling

### Server side (`kokoro_server.py`)

- Single persistent `sd.OutputStream` fed by a queue (no AudioUnit churn → no crashes on rapid preempt)
- Default-output-device watcher follows system changes (Bluetooth connect/disconnect, headphone routing, mute)
- `/voices` endpoint with 19 voices + per-request `voice`, `speed`, `clean` parameters
- Server-side text cleanup matching the extension's TypeScript port
