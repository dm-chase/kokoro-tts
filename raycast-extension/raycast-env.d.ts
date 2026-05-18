/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** TTS Backend - Auto prefers Kokoro if its local server is reachable, otherwise uses the macOS system voice (no install needed). */
  "backend": "auto" | "kokoro" | "say",
  /** Kokoro server URL - Where your local Kokoro server is listening (only relevant when the Kokoro backend is in use). */
  "serverUrl": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `speak-selection` command */
  export type SpeakSelection = ExtensionPreferences & {}
  /** Preferences accessible in the `stop-speaking` command */
  export type StopSpeaking = ExtensionPreferences & {}
  /** Preferences accessible in the `speak-clipboard` command */
  export type SpeakClipboard = ExtensionPreferences & {}
  /** Preferences accessible in the `speak-text` command */
  export type SpeakText = ExtensionPreferences & {}
  /** Preferences accessible in the `voices` command */
  export type Voices = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `speak-selection` command */
  export type SpeakSelection = {}
  /** Arguments passed to the `stop-speaking` command */
  export type StopSpeaking = {}
  /** Arguments passed to the `speak-clipboard` command */
  export type SpeakClipboard = {}
  /** Arguments passed to the `speak-text` command */
  export type SpeakText = {}
  /** Arguments passed to the `voices` command */
  export type Voices = {}
}

