/**
 * Public TTS API that dispatches between the two backends:
 *  - "say"    → macOS native, no install required
 *  - "kokoro" → local Kokoro 82M server (better voice quality, optional)
 *
 * The `backend` preference picks one of: auto | kokoro | say.
 * "auto" tries Kokoro first; falls back to `say` if the server isn't reachable.
 *
 * Each backend tracks its own default voice in LocalStorage (different
 * voices have different IDs and can't be mixed). Speed is shared.
 */
import { getPreferenceValues, LocalStorage } from "@raycast/api";
import {
  kokoroHealth,
  kokoroSpeak,
  kokoroStop,
  KokoroHealth,
} from "./backend/kokoro";
import { listSayVoices, saySpeak, sayStop, SayVoice } from "./backend/say";

export type Backend = "kokoro" | "say";
export type BackendPreference = "auto" | Backend;

interface ExtensionPrefs {
  backend: BackendPreference;
  serverUrl: string;
}

// --- Constants ---------------------------------------------------------------
export const DEFAULT_SPEED = 1.0;
export const SPEED_PRESETS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0] as const;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2.0;

const KOKORO_DEFAULT_VOICE = "af_heart";

// LocalStorage keys. Backend-namespaced so each backend tracks its own
// default voice; speed is shared.
const SELECTED_VOICE_KEYS: Record<Backend, string> = {
  kokoro: "kokoro.defaultVoice.kokoro",
  say: "kokoro.defaultVoice.say",
};
const LEGACY_VOICE_KEY = "kokoro.selectedVoiceId"; // pre-hybrid, migrate transparently
export const SELECTED_SPEED_KEY = "kokoro.defaultSpeed";

// --- Backend dispatch --------------------------------------------------------

/** Resolve the configured backend preference; "auto" → detect Kokoro health. */
export async function getActiveBackend(): Promise<Backend> {
  const pref = getPreferenceValues<ExtensionPrefs>().backend ?? "auto";
  if (pref === "kokoro" || pref === "say") return pref;
  // Auto: prefer Kokoro if reachable, else say.
  const health = await kokoroHealth(1500);
  return health.ok ? "kokoro" : "say";
}

export interface SpeakOptions {
  voice?: string;
  /** If set, forces this backend (overrides preference). */
  voiceBackend?: Backend;
  speed?: number;
  clean?: boolean;
}

export async function speak(
  text: string,
  opts: SpeakOptions = {},
): Promise<void> {
  const backend = opts.voiceBackend ?? (await getActiveBackend());
  const speed = opts.speed ?? (await getDefaultSpeed());
  const voice = opts.voice ?? (await getDefaultVoice(backend));
  const clean = opts.clean ?? true;

  if (backend === "kokoro") {
    return kokoroSpeak(text, { voice, speed, clean });
  }
  return saySpeak(text, { voice, speed, clean });
}

export async function stop(): Promise<void> {
  // Stop both backends — cheap and avoids "wrong backend was active" misses.
  await Promise.allSettled([kokoroStop(), sayStop()]);
}

export interface UnifiedHealth {
  active: Backend;
  kokoro: KokoroHealth;
  sayAvailable: boolean;
}

export async function checkHealth(): Promise<UnifiedHealth> {
  const [kokoro, sayVoices] = await Promise.all([
    kokoroHealth(1500),
    listSayVoices().then(
      (v) => v.length > 0,
      () => false,
    ),
  ]);
  const active = await getActiveBackend();
  return { active, kokoro, sayAvailable: sayVoices };
}

// --- LocalStorage helpers ----------------------------------------------------
// Match @raycast/utils' useLocalStorage encoding (JSON) so values written
// from React components via useLocalStorage are readable here.

function readJson<T>(stored: string | undefined): T | undefined {
  if (stored == null) return undefined;
  try {
    return JSON.parse(stored) as T;
  } catch {
    return undefined;
  }
}

export async function getDefaultVoice(backend: Backend): Promise<string> {
  const key = SELECTED_VOICE_KEYS[backend];
  const stored = await LocalStorage.getItem<string>(key);
  const parsed = readJson<unknown>(stored);
  if (typeof parsed === "string" && parsed.length > 0) return parsed;
  // Legacy: pre-hybrid version stored Kokoro voice under a single key.
  if (backend === "kokoro") {
    const legacy = await LocalStorage.getItem<string>(LEGACY_VOICE_KEY);
    const legacyParsed = readJson<unknown>(legacy);
    if (typeof legacyParsed === "string" && legacyParsed.length > 0)
      return legacyParsed;
    if (
      typeof legacy === "string" &&
      legacy.length > 0 &&
      !legacy.startsWith('"')
    ) {
      return legacy;
    }
  }
  // Hardcoded fallback per backend
  return backend === "kokoro" ? KOKORO_DEFAULT_VOICE : "Samantha";
}

export async function setDefaultVoice(
  backend: Backend,
  voiceId: string,
): Promise<void> {
  await LocalStorage.setItem(
    SELECTED_VOICE_KEYS[backend],
    JSON.stringify(voiceId),
  );
}

export function selectedVoiceKey(backend: Backend): string {
  return SELECTED_VOICE_KEYS[backend];
}

export async function getDefaultSpeed(): Promise<number> {
  const stored = await LocalStorage.getItem<string>(SELECTED_SPEED_KEY);
  const parsed = readJson<unknown>(stored);
  if (
    typeof parsed === "number" &&
    isFinite(parsed) &&
    parsed >= MIN_SPEED &&
    parsed <= MAX_SPEED
  ) {
    return parsed;
  }
  if (typeof stored === "string" && stored.length > 0) {
    const n = parseFloat(stored);
    if (isFinite(n) && n >= MIN_SPEED && n <= MAX_SPEED) return n;
  }
  return DEFAULT_SPEED;
}

export async function setDefaultSpeed(speed: number): Promise<void> {
  await LocalStorage.setItem(SELECTED_SPEED_KEY, JSON.stringify(speed));
}

// --- Re-exports for views ----------------------------------------------------
// Voice metadata types: kept here so commands don't have to import from
// `./backend/*` directly.
export type { SayVoice };
export { listSayVoices } from "./backend/say";
export { kokoroHealth, getKokoroServerUrl } from "./backend/kokoro";
