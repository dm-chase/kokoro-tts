"""Local Kokoro TTS server.

Keeps the Kokoro 82M model resident and exposes /health, /voices, /speak, /stop
on 127.0.0.1:8123. Audio playback uses a single long-lived sounddevice
OutputStream fed from a thread-safe queue — no AudioUnit open/close per
utterance, which used to crash CoreAudio under rapid preempt.
"""
from __future__ import annotations

import queue
import re
import sys
import threading
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
import sounddevice as sd
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# --- Config -----------------------------------------------------------------
HOST = "127.0.0.1"
PORT = 8123
SAMPLE_RATE = 24000
DEFAULT_VOICE = "af_heart"
DEFAULT_SPEED = 1.0
MIN_SPEED = 0.5
MAX_SPEED = 2.0
LANG_CODE = "a"

VOICES: list[dict] = [
    {"id": "af_heart",   "name": "Heart",   "gender": "female", "description": "Warm and expressive"},
    {"id": "af_bella",   "name": "Bella",   "gender": "female", "description": "Friendly"},
    {"id": "af_nova",    "name": "Nova",    "gender": "female", "description": "Energetic"},
    {"id": "af_sarah",   "name": "Sarah",   "gender": "female", "description": "Clear, professional"},
    {"id": "af_sky",     "name": "Sky",     "gender": "female", "description": "Youthful"},
    {"id": "af_nicole",  "name": "Nicole",  "gender": "female", "description": "Calm"},
    {"id": "af_alloy",   "name": "Alloy",   "gender": "female", "description": "Steady, clear"},
    {"id": "af_jessica", "name": "Jessica", "gender": "female", "description": "Confident"},
    {"id": "af_aoede",   "name": "Aoede",   "gender": "female", "description": "Soft, soothing"},
    {"id": "af_kore",    "name": "Kore",    "gender": "female", "description": "Bright"},
    {"id": "af_river",   "name": "River",   "gender": "female", "description": "Mellow"},
    {"id": "am_adam",    "name": "Adam",    "gender": "male",   "description": "Deep"},
    {"id": "am_echo",    "name": "Echo",    "gender": "male",   "description": "Clear"},
    {"id": "am_eric",    "name": "Eric",    "gender": "male",   "description": "Warm"},
    {"id": "am_michael", "name": "Michael", "gender": "male",   "description": "Warm, narrative"},
    {"id": "am_onyx",    "name": "Onyx",    "gender": "male",   "description": "Strong"},
    {"id": "am_puck",    "name": "Puck",    "gender": "male",   "description": "Playful"},
    {"id": "am_liam",    "name": "Liam",    "gender": "male",   "description": "Youthful"},
    {"id": "am_fenrir",  "name": "Fenrir",  "gender": "male",   "description": "Bold"},
]
VOICE_IDS = {v["id"] for v in VOICES}

# --- Pipeline lifecycle ------------------------------------------------------
pipeline = None  # type: ignore[assignment]
load_error: Optional[str] = None


def _load_pipeline() -> None:
    global pipeline, load_error
    try:
        from kokoro import KPipeline
        print(f"[kokoro] loading pipeline (lang_code={LANG_CODE})...", file=sys.stderr, flush=True)
        pipeline = KPipeline(lang_code=LANG_CODE)
        print("[kokoro] pipeline ready.", file=sys.stderr, flush=True)
    except Exception as exc:  # noqa: BLE001
        load_error = repr(exc)
        print(f"[kokoro] pipeline failed to load: {exc}", file=sys.stderr, flush=True)


# --- Text cleanup ------------------------------------------------------------
# Tuned for Claude Code terminal output, markdown, and code-heavy text.
# Conservative — never invents words, only strips formatting noise that would
# otherwise be read out literally as "backtick backtick backtick".
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")
_CODE_FENCE_RE = re.compile(r"```[\s\S]*?```", re.MULTILINE)
_INLINE_CODE_RE = re.compile(r"`([^`\n]+)`")
_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_BARE_URL_RE = re.compile(r"https?://\S+|www\.\S+")
_MD_HEADER_RE = re.compile(r"^#{1,6}\s+", flags=re.MULTILINE)
_MD_BOLD_RE = re.compile(r"\*\*([^*\n]+)\*\*")
_MD_ITALIC_AST_RE = re.compile(r"(?<!\*)\*([^*\n]+)\*(?!\*)")
_MD_BOLD_UND_RE = re.compile(r"__([^_\n]+)__")
_MD_STRIKE_RE = re.compile(r"~~([^~\n]+)~~")
_MD_HR_RE = re.compile(r"^[\s]*[-*_]{3,}[\s]*$", flags=re.MULTILINE)
_MD_BULLET_RE = re.compile(r"^\s*[-*+]\s+", flags=re.MULTILINE)
_MD_NUMBERED_RE = re.compile(r"^\s*\d+\.\s+", flags=re.MULTILINE)
_TRIPLE_NEWLINE_RE = re.compile(r"\n{3,}")
_MULTI_SPACE_RE = re.compile(r"[ \t]+")
_TRAILING_SPACE_RE = re.compile(r" +\n")


def clean_for_tts(text: str) -> str:
    """Strip formatting that would otherwise be read out as junk.

    Order matters — strip code fences before inline code, links before bare
    URLs, headers/bold/italic before stripping leftover punctuation.
    """
    # Terminal escapes first — these can mask other patterns.
    text = _ANSI_RE.sub("", text)

    # Block-level code: collapse the whole fenced block to a brief mention.
    text = _CODE_FENCE_RE.sub(" code block. ", text)
    # Inline `code` → just the content.
    text = _INLINE_CODE_RE.sub(r"\1", text)

    # Links: keep the visible text, drop the URL.
    text = _MD_LINK_RE.sub(r"\1", text)
    # Bare URLs: say "link" instead of reading every character.
    text = _BARE_URL_RE.sub("link", text)

    # Headers, emphasis, strikethrough — strip markers, keep content.
    text = _MD_HEADER_RE.sub("", text)
    text = _MD_BOLD_RE.sub(r"\1", text)
    text = _MD_BOLD_UND_RE.sub(r"\1", text)
    text = _MD_ITALIC_AST_RE.sub(r"\1", text)
    text = _MD_STRIKE_RE.sub(r"\1", text)

    # Horizontal rules and list markers.
    text = _MD_HR_RE.sub("", text)
    text = _MD_BULLET_RE.sub("", text)
    text = _MD_NUMBERED_RE.sub("", text)

    # Whitespace normalization.
    text = _TRAILING_SPACE_RE.sub("\n", text)
    text = _MULTI_SPACE_RE.sub(" ", text)
    text = _TRIPLE_NEWLINE_RE.sub("\n\n", text)

    return text.strip()


# --- Player ------------------------------------------------------------------
class Player:
    """Long-lived OutputStream fed by a queue of float32 numpy chunks.

    - The stream is opened once at startup and rebuilt only when the macOS
      default output device changes (e.g. you connect Bluetooth headphones).
    - A background watcher polls the system default output once per second
      and reopens the stream when the device name changes — this is how we
      follow the system's mute and routing instead of getting pinned to
      whichever device was default at process start.
    - Producers (worker threads) push complete Kokoro chunks via `push()`.
    - The audio callback pulls from the queue and copies into the output
      buffer; partial chunks are stored in `residual` for next call.
    - `drain()` empties the queue + residual atomically.
    """

    def __init__(self, sample_rate: int):
        self._queue: queue.Queue[np.ndarray] = queue.Queue(maxsize=256)
        self._residual = np.zeros(0, dtype=np.float32)
        self._residual_lock = threading.Lock()
        self._stream_lock = threading.Lock()
        self._stream: Optional[sd.OutputStream] = None
        self._current_device_name: Optional[str] = None
        self._shutdown = threading.Event()
        self._watcher: Optional[threading.Thread] = None
        self.sample_rate = sample_rate

    def start(self) -> None:
        with self._stream_lock:
            if self._stream is None:
                self._open_stream_locked()
        if self._watcher is None:
            self._watcher = threading.Thread(
                target=self._watch_default_device, daemon=True
            )
            self._watcher.start()

    def stop(self) -> None:
        self._shutdown.set()
        with self._stream_lock:
            self._close_stream_locked()

    def _open_stream_locked(self) -> None:
        """Open a stream against the *current* system default output. Caller holds _stream_lock."""
        try:
            default_info = sd.query_devices(kind="output")
            name = default_info.get("name", "(unknown)") if isinstance(default_info, dict) else "(unknown)"
        except Exception as exc:  # noqa: BLE001
            print(f"[kokoro] query_devices failed: {exc}", file=sys.stderr, flush=True)
            name = "(unknown)"

        # device=None means "use the current system default at the moment of open".
        self._stream = sd.OutputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype="float32",
            callback=self._callback,
            blocksize=0,
            device=None,
        )
        self._stream.start()
        self._current_device_name = name
        print(f"[kokoro] audio stream → {name}", file=sys.stderr, flush=True)

    def _close_stream_locked(self) -> None:
        """Tear down the stream. Caller holds _stream_lock."""
        if self._stream is None:
            return
        try:
            self._stream.stop()
            self._stream.close()
        except Exception as exc:  # noqa: BLE001
            print(f"[kokoro] stream close error: {exc}", file=sys.stderr, flush=True)
        self._stream = None
        self._current_device_name = None

    def _watch_default_device(self) -> None:
        """Poll the system default output. If it changed, rebuild the stream."""
        while not self._shutdown.is_set():
            try:
                info = sd.query_devices(kind="output")
                name = info.get("name") if isinstance(info, dict) else None
                with self._stream_lock:
                    on_device = self._current_device_name
                if name and on_device and name != on_device:
                    print(
                        f"[kokoro] default output changed: {on_device!r} → {name!r}; rebuilding",
                        file=sys.stderr,
                        flush=True,
                    )
                    with self._stream_lock:
                        self._close_stream_locked()
                        # Clear residual; the half-played chunk on the old device is gone.
                        with self._residual_lock:
                            self._residual = np.zeros(0, dtype=np.float32)
                        self._open_stream_locked()
            except Exception as exc:  # noqa: BLE001
                print(f"[kokoro] device watcher tick error: {exc}", file=sys.stderr, flush=True)
            self._shutdown.wait(timeout=1.0)

    def push(self, chunk: np.ndarray) -> None:
        """Enqueue a fully generated chunk (any length)."""
        if chunk.ndim != 1:
            chunk = chunk.reshape(-1)
        # Drop, don't block, if the queue is full — backpressure means
        # generation got way ahead of playback; the queue can hold ~30s.
        try:
            self._queue.put_nowait(chunk.astype(np.float32, copy=False))
        except queue.Full:
            pass

    def drain(self) -> None:
        """Discard everything queued and the in-flight residual."""
        while True:
            try:
                self._queue.get_nowait()
            except queue.Empty:
                break
        with self._residual_lock:
            self._residual = np.zeros(0, dtype=np.float32)

    def _callback(self, outdata: np.ndarray, frames: int, _time, status) -> None:
        # NOTE: this runs on the audio thread. NO blocking, NO prints,
        # NO Python allocations beyond numpy slices.
        if status:
            # XRun / underflow — fine to let it through, audio thread shouldn't print.
            pass

        outdata.fill(0.0)
        written = 0

        # Drain residual from the previous callback first.
        with self._residual_lock:
            if self._residual.size > 0:
                n = min(self._residual.size, frames)
                outdata[:n, 0] = self._residual[:n]
                self._residual = self._residual[n:]
                written = n

        # Then pull whole chunks from the queue.
        while written < frames:
            try:
                chunk = self._queue.get_nowait()
            except queue.Empty:
                return  # rest of outdata stays silent (already zeroed)

            n = min(chunk.size, frames - written)
            outdata[written:written + n, 0] = chunk[:n]
            written += n
            if n < chunk.size:
                with self._residual_lock:
                    # Anything we couldn't fit goes into residual for next call.
                    if self._residual.size > 0:
                        self._residual = np.concatenate([self._residual, chunk[n:]])
                    else:
                        self._residual = chunk[n:]
                return


player = Player(SAMPLE_RATE)


# --- Generation thread state -------------------------------------------------
_state_lock = threading.Lock()
_current_gen_id = 0


def _to_numpy(audio) -> np.ndarray:
    if hasattr(audio, "detach"):
        audio = audio.detach()
    if hasattr(audio, "cpu"):
        audio = audio.cpu()
    if hasattr(audio, "numpy"):
        audio = audio.numpy()
    return np.asarray(audio, dtype=np.float32)


def _generation_worker(text: str, voice: str, speed: float, gen_id: int) -> None:
    """Generate Kokoro audio and push chunks to the player. Preempted by gen-id check."""
    try:
        for _graphemes, _phonemes, audio in pipeline(text, voice=voice, speed=speed):
            # Bail out cheaply if a newer /speak has arrived.
            if gen_id != _current_gen_id:
                return
            chunk = _to_numpy(audio)
            # Atomic check-and-push w.r.t. drain() under _state_lock.
            with _state_lock:
                if gen_id != _current_gen_id:
                    return
                player.push(chunk)
    except Exception as exc:  # noqa: BLE001
        print(f"[kokoro] generation error: {exc}", file=sys.stderr, flush=True)


# --- FastAPI -----------------------------------------------------------------
@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Start audio stream BEFORE model load so it's ready the moment we have audio.
    try:
        player.start()
    except Exception as exc:  # noqa: BLE001
        print(f"[kokoro] failed to start audio stream: {exc}", file=sys.stderr, flush=True)
    threading.Thread(target=_load_pipeline, daemon=True).start()
    try:
        yield
    finally:
        player.stop()


app = FastAPI(lifespan=lifespan)


class SpeakRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    speed: Optional[float] = Field(default=None, ge=MIN_SPEED, le=MAX_SPEED)
    clean: bool = True


@app.get("/health")
async def health():
    if pipeline is None:
        if load_error:
            return JSONResponse({"status": "error", "error": load_error}, status_code=503)
        return JSONResponse({"status": "loading"}, status_code=503)
    return {"status": "ok"}


@app.get("/voices")
async def voices():
    return {"voices": VOICES, "default": DEFAULT_VOICE}


@app.post("/speak")
async def speak(req: SpeakRequest):
    global _current_gen_id

    if pipeline is None:
        return JSONResponse({"status": "loading"}, status_code=503)

    raw_text = req.text or ""
    text = clean_for_tts(raw_text) if req.clean else raw_text.strip()
    if not text:
        return {"status": "empty"}

    voice = (req.voice or DEFAULT_VOICE).strip()
    if voice not in VOICE_IDS:
        # Diagnostic log so we can find the culprit if 400s ever start spiking.
        print(
            f"[kokoro] /speak rejected: unknown voice={voice!r} speed={req.speed!r} "
            f"clean={req.clean} text_len={len(req.text or '')}",
            file=sys.stderr,
            flush=True,
        )
        return JSONResponse(
            {"status": "error", "error": f"unknown voice '{voice}'", "valid_voices": sorted(VOICE_IDS)},
            status_code=400,
        )

    speed = float(req.speed) if req.speed is not None else DEFAULT_SPEED

    with _state_lock:
        _current_gen_id += 1
        gen_id = _current_gen_id
        player.drain()  # immediate audible cutoff

    # Worker runs outside the lock; only its push() reacquires briefly.
    threading.Thread(
        target=_generation_worker,
        args=(text, voice, speed, gen_id),
        daemon=True,
    ).start()

    return {"status": "ok", "voice": voice, "speed": speed, "cleaned": req.clean}


@app.post("/stop")
async def stop():
    global _current_gen_id
    with _state_lock:
        _current_gen_id += 1
        player.drain()
    return {"status": "stopped"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
