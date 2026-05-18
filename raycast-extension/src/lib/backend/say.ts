/**
 * macOS native TTS backend, driven via the system `say(1)` command.
 *
 * Why this backend exists: it works on every Mac with no install, so it's the
 * default for users who just want to install the extension and use it. Power
 * users can run the Kokoro server for better voice quality.
 *
 * Lifecycle: each `say` invocation is a detached child process. We track its
 * PID in a sentinel file so a later `stop()` (in a different Raycast command
 * invocation) can kill it. Cross-invocation state via the filesystem is the
 * standard pattern for no-view Raycast commands that share lifecycle.
 */
import { spawn, execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { cleanForTts } from "../cleanup";

const execFileAsync = promisify(execFile);
const SAY_BIN = "/usr/bin/say";
const PID_FILE = join(tmpdir(), "kokoro-tts-say.pid");
const DEFAULT_RATE_WPM = 175; // matches macOS default

export interface SayVoice {
  id: string; // exact -v argument, e.g. "Ava (Premium)"
  name: string; // display name, same as id for now
  locale: string; // e.g. "en_US"
  language: string; // English / Spanish / ... (derived from locale)
  tier: "premium" | "enhanced" | "standard";
  sample: string; // sample text from `say -v ?`
}

const LANG_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  pl: "Polish",
  ru: "Russian",
  tr: "Turkish",
  ar: "Arabic",
  he: "Hebrew",
  hi: "Hindi",
  th: "Thai",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
};

function languageFromLocale(locale: string): string {
  const code = locale.split("_")[0]?.toLowerCase() ?? "";
  return LANG_NAMES[code] ?? code.toUpperCase();
}

function tierFromName(name: string): SayVoice["tier"] {
  if (/\(Premium\)\s*$/.test(name)) return "premium";
  if (/\(Enhanced\)\s*$/.test(name)) return "enhanced";
  return "standard";
}

/**
 * Enumerate the voices available on this Mac via `say -v "?"`.
 *
 * Output format (locale is column-aligned with 2+ spaces as separator):
 *   Ava (Premium)       en_US    # Hi! My name is Ava.
 *   Alex                en_US    # Most people recognize me by my voice.
 */
export async function listSayVoices(): Promise<SayVoice[]> {
  const { stdout } = await execFileAsync(SAY_BIN, ["-v", "?"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  const voices: SayVoice[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    // Match: "<name with optional spaces & parens>  <locale>  # <sample>"
    const match = trimmed.match(/^(.+?)\s{2,}([a-z]{2,3}_[A-Z]{2})\s+#\s+(.*)$/);
    if (!match) continue;
    const [, name, locale, sample] = match;
    voices.push({
      id: name.trim(),
      name: name.trim(),
      locale,
      language: languageFromLocale(locale),
      tier: tierFromName(name),
      sample,
    });
  }
  return voices;
}

/**
 * Read the recorded PID from the sentinel file. Returns null if missing or
 * the process no longer exists / isn't `say`.
 */
async function readActivePid(): Promise<number | null> {
  let raw: string;
  try {
    raw = await fs.readFile(PID_FILE, "utf8");
  } catch {
    return null;
  }
  const pid = parseInt(raw.trim(), 10);
  if (!isFinite(pid) || pid <= 0) return null;

  // Verify the process is alive AND is actually `say` (defends against
  // PID reuse — kernel could have reassigned this PID to an unrelated process).
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "comm="], {
      encoding: "utf8",
    });
    if (!stdout.trim().endsWith("say")) return null;
  } catch {
    return null;
  }
  return pid;
}

async function clearPidFile(): Promise<void> {
  try {
    await fs.unlink(PID_FILE);
  } catch {
    // already gone — fine
  }
}

async function killActiveSay(): Promise<void> {
  const pid = await readActivePid();
  if (pid !== null) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // race: process already dead
    }
  }
  await clearPidFile();
}

export interface SaySpeakOptions {
  voice?: string;
  speed?: number; // multiplier; 1.0 = default rate
  clean?: boolean;
}

export async function saySpeak(text: string, opts: SaySpeakOptions = {}): Promise<void> {
  const speed = opts.speed ?? 1.0;
  const cleaned = opts.clean === false ? text : cleanForTts(text);
  if (!cleaned.trim()) return;

  // Preempt any in-progress utterance.
  await killActiveSay();

  const rate = Math.round(DEFAULT_RATE_WPM * speed);
  const args: string[] = ["-r", String(rate)];
  if (opts.voice) {
    args.push("-v", opts.voice);
  }

  // Spawn detached so it outlives this Raycast command invocation.
  const child = spawn(SAY_BIN, args, {
    detached: true,
    stdio: ["pipe", "ignore", "ignore"],
  });

  child.stdin?.write(cleaned);
  child.stdin?.end();

  if (child.pid) {
    await fs.writeFile(PID_FILE, String(child.pid), "utf8");
    // Clean up the PID file when the child exits naturally.
    child.once("exit", () => {
      void clearPidFile();
    });
  }
  child.unref();
}

export async function sayStop(): Promise<void> {
  await killActiveSay();
}

/**
 * Health-check: does the system `say` binary exist and respond? Used by the
 * dispatcher in api.ts to decide whether the `say` backend is available.
 */
export async function sayAvailable(): Promise<boolean> {
  try {
    await execFileAsync(SAY_BIN, ["-v", "?"], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
