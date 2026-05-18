/**
 * Kokoro server backend.
 *
 * Talks to the local Kokoro 82M FastAPI server (default 127.0.0.1:8123).
 * The extension never runs the server itself — users install it separately
 * (brew formula or .app installer, eventually). This module handles the
 * HTTP contract and nothing else.
 */
import { getPreferenceValues } from "@raycast/api";

export interface KokoroSpeakOptions {
  voice?: string;
  speed?: number;
  clean?: boolean;
}

export interface KokoroHealth {
  ok: boolean;
  status: string;
  error?: string;
}

const DEFAULT_URL = "http://127.0.0.1:8123";

export function getKokoroServerUrl(): string {
  const raw = getPreferenceValues<Preferences>().serverUrl?.trim();
  return (raw && raw.length > 0 ? raw : DEFAULT_URL).replace(/\/+$/, "");
}

async function postJson(
  path: string,
  body: object,
  timeoutMs = 5000,
): Promise<Response> {
  const url = `${getKokoroServerUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function kokoroSpeak(
  text: string,
  opts: KokoroSpeakOptions = {},
): Promise<void> {
  let res: Response;
  try {
    res = await postJson("/speak", {
      text,
      voice: opts.voice,
      speed: opts.speed,
      clean: opts.clean ?? true,
    });
  } catch (e) {
    throw new Error(
      `Can't reach Kokoro server at ${getKokoroServerUrl()} — is it running? (${
        e instanceof Error ? e.message : String(e)
      })`,
    );
  }

  if (!res.ok) {
    const body = await safeText(res);
    if (res.status === 503) {
      throw new Error(
        `Kokoro server is still loading the model — try again in a moment`,
      );
    }
    throw new Error(
      `Kokoro server returned ${res.status}: ${body || res.statusText}`,
    );
  }
}

export async function kokoroStop(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${getKokoroServerUrl()}/stop`, { method: "POST" });
  } catch (e) {
    throw new Error(
      `Can't reach Kokoro server at ${getKokoroServerUrl()} (${
        e instanceof Error ? e.message : String(e)
      })`,
    );
  }
  if (!res.ok) {
    throw new Error(`Kokoro server returned ${res.status}: ${res.statusText}`);
  }
}

/** Probe /health. Used for both UI status display and auto-backend detection. */
export async function kokoroHealth(timeoutMs = 1500): Promise<KokoroHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getKokoroServerUrl()}/health`, {
      signal: controller.signal,
    });
    let body: { status?: string; error?: string } = {};
    try {
      body = (await res.json()) as { status?: string; error?: string };
    } catch {
      body = {};
    }
    return {
      ok: res.ok,
      status: body.status ?? (res.ok ? "ok" : "error"),
      error: body.error,
    };
  } catch (e) {
    return {
      ok: false,
      status: "unreachable",
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
