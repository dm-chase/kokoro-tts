import { Clipboard, getSelectedText } from "@raycast/api";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Capture the currently-selected text from the frontmost app.
 *
 * Two-tier strategy:
 *  1. Try Raycast's native getSelectedText() (NSServicesMenuRequestor). Fast,
 *     no clipboard side effects — but doesn't work in Terminal, some Electron
 *     apps, and a handful of native apps that don't declare service support.
 *  2. Fall back to the Cmd-C + sentinel clipboard pattern. Works in literally
 *     any app that responds to Cmd-C. We write a unique sentinel to the
 *     clipboard so we can tell "nothing was selected" apart from "the user
 *     already had the same text in the clipboard."
 *
 * Returns null when no text was selected.
 */
export async function captureSelection(): Promise<string | null> {
  // Tier 1: native
  try {
    const native = await getSelectedText();
    if (native && native.trim().length > 0) {
      return native;
    }
  } catch {
    // Native didn't return — fall through to the Cmd-C path.
  }

  // Tier 2: Cmd-C with sentinel
  const sentinel = `__kokoro_${process.pid}_${Date.now()}__`;
  const originalText = await Clipboard.readText().catch(() => undefined);

  await Clipboard.copy(sentinel);

  try {
    await execAsync(
      `osascript -e 'tell application "System Events" to keystroke "c" using command down'`,
    );
  } catch {
    // AppleScript failed (e.g., Accessibility not granted). Restore and bail.
    if (originalText !== undefined) await Clipboard.copy(originalText);
    return null;
  }

  // Wait for the host app to populate the clipboard.
  await sleep(150);

  const captured = await Clipboard.readText().catch(() => undefined);

  // Always restore the clipboard, even on failure paths below.
  if (originalText !== undefined) {
    await Clipboard.copy(originalText);
  }

  if (!captured || captured === sentinel) {
    return null;
  }
  return captured;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function truncateForHUD(text: string, max = 50): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}
