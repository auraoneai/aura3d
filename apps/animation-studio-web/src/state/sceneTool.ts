/**
 * Scene-Tool command metadata + parser (autocomplete only).
 *
 * The Director Console no longer simulates mutations locally — Command mode runs the
 * REAL agent-native Scene-Tool CLI (`animation-scene.ts`) via `POST /api/scene` (see
 * `state/backend.ts`), and each committed/rejected card reflects the actual validated
 * result + the resulting working-document revision. This module now only provides:
 *   - `VERBS`  — the command catalog for the composer autocomplete + suggestion chips.
 *   - `parse`  — a light tokenizer used to detect the verb (e.g. `render`) and flags.
 * No mock mutations remain in the production path.
 */

export interface VerbSpec {
  verb: string;
  tail: string;
  desc: string;
}

// The REAL CLI grammar (animation-scene.ts) — every entry here, inserted verbatim with its
// placeholders filled, is accepted by the CLI's switch/flag parser. These strings are also
// surfaced verbatim to LLMs, so they must never advertise a syntax the validator rejects.
export const VERBS: VerbSpec[] = [
  { verb: "new", tail: '--prompt "<scene>" [--full]', desc: "Start a new working scene from a prompt" },
  { verb: "set", tail: '<studio|garage|office|kitchen|moon-garden|space-station|meadow> | --query "<setting>"', desc: "Choose the active set template" },
  { verb: "cast add", tail: '--id <id> --query "<look>" [--scale <s>]', desc: "Cast a character (catalog resolve)" },
  { verb: "prop add", tail: '--id <id> --query "<look>"', desc: "Register a prop from the catalog" },
  { verb: "shot add", tail: "--id <id> --preset <preset> --duration <s>", desc: "Block a new shot" },
  { verb: "shot remove", tail: "--id <id>", desc: "Remove a shot" },
  { verb: "shot retime", tail: "--id <id> --duration <s>", desc: "Change a shot's duration" },
  { verb: "camera", tail: "--shot <id> --preset <establishing|medium|two-shot|close-up>", desc: "Set a shot's camera" },
  { verb: "dialogue", tail: '--line <id> --speaker <id> --text "<line>" --start <s>', desc: "Write a dialogue line" },
  { verb: "block", tail: "--character <id> --shot <id> --to <x,z> [--clip <clip>]", desc: "Move a character in a shot" },
  { verb: "gesture", tail: "--character <id> --shot <id> --clip <clip>", desc: "Queue a gesture clip for a character" },
  { verb: "dress", tail: "--prop <id> --at <x,z> [--scale <s>]", desc: "Place a registered prop on the set" },
  { verb: "scale", tail: "--character <id> --to <s>", desc: "Rescale a character" },
  { verb: "show", tail: "", desc: "Print the scene summary" },
  { verb: "validate", tail: "", desc: "Check scene coherence" },
  { verb: "undo", tail: "", desc: "Undo the last committed edit" },
  { verb: "render", tail: "[--shot <id>]", desc: "Render a low-fi preview (shot or full sequence)" }
];

export interface ParsedCommand {
  verb: string;
  rest: string[];
  flags: Record<string, string>;
  raw: string;
  isCommand: boolean;
}

/** Naive command parser — extracts the (possibly two-word) verb + flags for routing. */
export function parse(raw: string): ParsedCommand {
  const t = raw.trim();
  const flags: Record<string, string> = {};
  const fre = /--([a-z]+)\s+("[^"]*"|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = fre.exec(t))) flags[m[1]] = m[2].replace(/^"|"$/g, "");
  const head = t.replace(/--[a-z]+\s+("[^"]*"|\S+)/g, "").trim();
  const toks = head.split(/\s+/).filter(Boolean);
  let verb = toks[0] || "";
  let rest = toks.slice(1);
  if (["cast", "shot", "prop"].includes(verb) && rest[0]) {
    verb += " " + rest[0];
    rest = rest.slice(1);
  }
  return { verb, rest, flags, raw: t, isCommand: VERBS.some((v) => t.startsWith(v.verb.split(" ")[0])) };
}
