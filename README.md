# Kokoro TTS

**Local text-to-speech for macOS, with a Raycast extension.** Highlight any text, hit a hotkey, hear it read aloud in a high-quality neural voice. Two backends — Apple's built-in `say` (zero setup) and the optional Kokoro 82M model (premium quality, one-command install).

No cloud. No API keys. No per-character cost.

```
                 ┌────────────────────────┐
   highlight  ──▶│  Kokoro TTS extension  │──┐
   text in any   │      (Raycast)         │  │
   macOS app     └────────────────────────┘  │
                                             ▼
                                    ┌──────────────────┐
                                    │  macOS `say`     │  default, works
                                    │  (system voices) │  on every Mac
                                    └──────────────────┘
                                             ▲
                                             │  fallback
                                             │
                                    ┌──────────────────┐
                                    │  Kokoro 82M      │  optional,
                                    │  local server    │  brew install
                                    │  127.0.0.1:8123  │  upgrade tier
                                    └──────────────────┘
```

## Quick start

### 1. Install the Raycast extension

*(Once it's published to the Raycast Store, this is a one-click install. Until then, see the manual dev install in [raycast-extension/README.md](raycast-extension/README.md).)*

### 2. (Optional) Install the Kokoro server for premium voices

```bash
brew tap dm-chase/kokoro-tts
brew install kokoro-tts-server
brew services start kokoro-tts-server
```

The extension auto-detects the server and adds 19 Kokoro voices to the picker. **Without this step, you still get a working extension using the macOS system voices.**

### 3. Set hotkeys in Raycast

Open Raycast Settings → Extensions → Kokoro TTS, then bind:
- **Speak Selection** → e.g. `⌥⇧S`
- **Stop Speaking** → e.g. `⌥⇧X`

Highlight text in any app, hit your hotkey. Done.

## What's in this repo

| Path | Purpose |
|---|---|
| `kokoro_server.py` | FastAPI server (`/health`, `/voices`, `/speak`, `/stop`) — Apache-2.0 |
| `Formula/kokoro-tts-server.rb` | Homebrew formula for the one-command server install |
| `raycast-extension/` | The Raycast extension (TypeScript, MIT) — has its own README |
| `setup.sh`, `start.sh` | Manual local-dev alternative to the brew install |
| `speak-selection.sh`, `stop-speaking.sh` | Legacy Raycast Script Commands — pre-extension, kept for non-Raycast users |
| `PUBLISHING.md` | Maintainer notes for cutting a release |

## Server install (deep dive)

Homebrew is the recommended path (see Quick start above). Service controls:

```bash
brew services restart kokoro-tts-server     # restart
brew services stop kokoro-tts-server        # stop (and don't relaunch on login)
brew services info kokoro-tts-server        # status
tail -f "$(brew --prefix)/var/log/kokoro-tts-server.log"
```

Uninstall:

```bash
brew uninstall kokoro-tts-server
brew untap dm-chase/kokoro-tts
```

### Manual install (no Homebrew)

For development or if you don't use Homebrew:

System deps (the setup script checks and stops if any are missing — it does **not** install these for you):

- Homebrew
- Python 3.10+
- espeak-ng → `brew install espeak-ng`

Then:

```
./setup.sh
```

This creates `.venv/` and pip-installs `kokoro`, `fastapi`, `uvicorn[standard]`, `sounddevice`, `numpy`. First run also pulls **PyTorch (~700MB)**.

## Run

Start the server (blocking; first start downloads ~330MB of model weights from HuggingFace):

```
./start.sh
```

Or in the background:

```
./start.sh > /tmp/kokoro-tts.log 2>&1 &
```

Health-check:

```
curl http://127.0.0.1:8123/health
```

`{"status":"loading"}` (503) until the model is ready, then `{"status":"ok"}` (200).

Speak something:

```
curl -X POST http://127.0.0.1:8123/speak \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello from Kokoro."}'
```

Stop playback:

```
curl -X POST http://127.0.0.1:8123/stop
```

## Raycast integration

The recommended way to use this server is via the **Kokoro TTS Raycast extension** in [`raycast-extension/`](raycast-extension/). It has a voice picker, speed control, per-utterance overrides, and auto-detects the server.

For users who can't or don't want to install the full extension, the project also ships legacy Raycast Script Commands (`speak-selection.sh`, `stop-speaking.sh`):

1. Raycast → **Settings → Extensions → ⊕ → Add Script Directory…**
2. Pick the cloned `kokoro-tts/` folder.
3. **Speak Selection** and **Stop Speaking** commands appear — assign hotkeys (e.g. ⌥⇧S and ⌥⇧X).

## API

### `GET /health`

- `200 {"status":"ok"}` once the model is loaded.
- `503 {"status":"loading"}` during the initial model load.
- `503 {"status":"error", "error":"..."}` if the model failed to load.

### `POST /speak`

```json
{ "text": "..." }
```

Cuts off any in-progress utterance and starts a new one. Response: `{"status":"ok"}`.

### `POST /stop`

Stops playback. Response: `{"status":"stopped"}`.

## How cutoff works

The server keeps a `_current_gen_id` counter and a single playback thread.

A new `/speak` request:

1. Bumps the counter.
2. Sets a `_stop_event`.
3. Calls `sd.stop()` to halt audio immediately.
4. Joins the previous playback thread (with a 2s timeout).
5. Spawns a new daemon thread for the new utterance.

The worker checks the generation id and stop event between every Kokoro chunk **and** every 20ms while a chunk is playing, so cancellation latency is bounded by ~20ms.

## Configuration

Edit the constants near the top of `kokoro_server.py`:

- `VOICE` — default `af_heart`. Other voices: `af_*` (American female), `am_*` (American male), `bf_*` / `bm_*` (British), etc. See the Kokoro voices list.
- `LANG_CODE` — `'a'` American English, `'b'` British, `'j'` Japanese, etc.
- `PORT` — default `8123`.

## Troubleshooting

**Silent — no audio.** macOS may not have granted audio output permission to the process running Python. Check System Settings → Privacy & Security. Also confirm the system default output is what you expect (HDMI, headphones, etc.).

**`espeak-ng` errors at runtime.** Kokoro falls back to espeak-ng for grapheme-to-phoneme on out-of-vocabulary words. `brew install espeak-ng`.

**Slow first run.** First `./start.sh` pulls ~330MB of model weights. Subsequent starts load from the local HuggingFace cache.

**Stale clipboard after Speak Selection.** The script restores the clipboard to its prior text contents. If you use a clipboard manager that captures every write, it may show the sentinel briefly — disable capture for this script or accept the noise.

## Run at login

If you installed via Homebrew, `brew services start kokoro-tts-server` registers a LaunchAgent for you and the server starts on every login. See the **Install (recommended): Homebrew** section above.

For manual installs, you can write your own LaunchAgent. The simplest version points `ProgramArguments` at the absolute path of `start.sh`, sets `RunAtLoad`/`KeepAlive`, and ensures `PATH` includes `/opt/homebrew/bin` so `espeak-ng` resolves at runtime. The Homebrew formula's generated plist is a good template — `brew services info kokoro-tts-server` shows where it lives.

## Known gaps

- Single utterance at a time. There's no "queue this after the current finishes" — every `/speak` preempts.

## Licensing

This server (`kokoro_server.py`) is licensed **Apache-2.0** (see [LICENSE](LICENSE) and [NOTICE](NOTICE)). It depends on:

- `phonemizer-fork` Python package (**GPL-3.0-or-later**)
- `espeak-ng` system binary (**GPL-3.0-or-later**)

When you install and run the server, the combined running pipeline on your machine is effectively governed by GPL-3.0-or-later. **The recommended distribution approach — having end users install espeak-ng (via Homebrew) and Python deps (via pip) themselves — keeps you free of redistribution obligations.** Bundling those binaries into a `.pkg` installer or brew formula that ships them inline would require distributing the entire bundle under GPL-3.0-or-later with full source.

See [NOTICE](NOTICE) for the full third-party attribution list.

The Raycast extension under `raycast-extension/` is separately licensed **MIT** (see [raycast-extension/LICENSE](raycast-extension/LICENSE)). It communicates with this server only over HTTP and contains no GPL code.

This project is not affiliated with [hexgrad](https://huggingface.co/hexgrad), the [eSpeak NG project](https://github.com/espeak-ng/espeak-ng), Apple Inc., or Raycast Technologies Ltd.
