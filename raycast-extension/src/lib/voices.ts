/**
 * Kokoro-server voice catalog (American English, lang_code='a').
 * Kept in sync with VOICES in kokoro_server.py — the server validates against
 * its own list and returns 400 on unknown voice IDs.
 *
 * The `say` backend's voices are discovered dynamically at runtime via
 * `listSayVoices()` (see lib/backend/say.ts) — Apple's voices vary per Mac.
 */
export interface Voice {
  id: string;
  name: string;
  gender: "female" | "male";
  description: string;
}

export const DEFAULT_VOICE_ID = "af_heart";

export const VOICES: Voice[] = [
  // Female (af_*)
  {
    id: "af_heart",
    name: "Heart",
    gender: "female",
    description: "Warm and expressive",
  },
  { id: "af_bella", name: "Bella", gender: "female", description: "Friendly" },
  { id: "af_nova", name: "Nova", gender: "female", description: "Energetic" },
  {
    id: "af_sarah",
    name: "Sarah",
    gender: "female",
    description: "Clear, professional",
  },
  { id: "af_sky", name: "Sky", gender: "female", description: "Youthful" },
  { id: "af_nicole", name: "Nicole", gender: "female", description: "Calm" },
  {
    id: "af_alloy",
    name: "Alloy",
    gender: "female",
    description: "Steady, clear",
  },
  {
    id: "af_jessica",
    name: "Jessica",
    gender: "female",
    description: "Confident",
  },
  {
    id: "af_aoede",
    name: "Aoede",
    gender: "female",
    description: "Soft, soothing",
  },
  { id: "af_kore", name: "Kore", gender: "female", description: "Bright" },
  { id: "af_river", name: "River", gender: "female", description: "Mellow" },
  // Male (am_*)
  { id: "am_adam", name: "Adam", gender: "male", description: "Deep" },
  { id: "am_echo", name: "Echo", gender: "male", description: "Clear" },
  { id: "am_eric", name: "Eric", gender: "male", description: "Warm" },
  {
    id: "am_michael",
    name: "Michael",
    gender: "male",
    description: "Warm, narrative",
  },
  { id: "am_onyx", name: "Onyx", gender: "male", description: "Strong" },
  { id: "am_puck", name: "Puck", gender: "male", description: "Playful" },
  { id: "am_liam", name: "Liam", gender: "male", description: "Youthful" },
  { id: "am_fenrir", name: "Fenrir", gender: "male", description: "Bold" },
];

export const VOICE_BY_ID: Record<string, Voice> = Object.fromEntries(
  VOICES.map((v) => [v.id, v]),
);

export function getVoice(id: string | undefined): Voice {
  return (id && VOICE_BY_ID[id]) || VOICE_BY_ID[DEFAULT_VOICE_ID];
}
