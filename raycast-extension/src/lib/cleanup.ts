/**
 * Strip formatting that would otherwise be read aloud as literal junk.
 *
 * Direct TypeScript port of clean_for_tts() in kokoro_server.py — kept here
 * so the `say` backend (which has no server-side processor) gets the same
 * behaviour. If you change one, change both. (Test: same input should yield
 * identical output character-for-character between Python and TS versions.)
 *
 * Order matters: strip code fences before inline code, links before bare
 * URLs, headers/bold/italic before whitespace normalization.
 */
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[a-zA-Z]/g;
const CODE_FENCE = /```[\s\S]*?```/g;
const INLINE_CODE = /`([^`\n]+)`/g;
const MD_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const BARE_URL = /https?:\/\/\S+|www\.\S+/g;
const MD_HEADER = /^#{1,6}\s+/gm;
const MD_BOLD = /\*\*([^*\n]+)\*\*/g;
const MD_BOLD_UND = /__([^_\n]+)__/g;
const MD_ITALIC_AST = /(?<!\*)\*([^*\n]+)\*(?!\*)/g;
const MD_STRIKE = /~~([^~\n]+)~~/g;
const MD_HR = /^[\s]*[-*_]{3,}[\s]*$/gm;
const MD_BULLET = /^\s*[-*+]\s+/gm;
const MD_NUMBERED = /^\s*\d+\.\s+/gm;
const TRIPLE_NEWLINE = /\n{3,}/g;
const MULTI_SPACE = /[ \t]+/g;
const TRAILING_SPACE = / +\n/g;

export function cleanForTts(text: string): string {
  let out = text;

  out = out.replace(ANSI, "");

  out = out.replace(CODE_FENCE, " code block. ");
  out = out.replace(INLINE_CODE, "$1");

  out = out.replace(MD_LINK, "$1");
  out = out.replace(BARE_URL, "link");

  out = out.replace(MD_HEADER, "");
  out = out.replace(MD_BOLD, "$1");
  out = out.replace(MD_BOLD_UND, "$1");
  out = out.replace(MD_ITALIC_AST, "$1");
  out = out.replace(MD_STRIKE, "$1");

  out = out.replace(MD_HR, "");
  out = out.replace(MD_BULLET, "");
  out = out.replace(MD_NUMBERED, "");

  out = out.replace(TRAILING_SPACE, "\n");
  out = out.replace(MULTI_SPACE, " ");
  out = out.replace(TRIPLE_NEWLINE, "\n\n");

  return out.trim();
}
