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

export const VERBS: VerbSpec[] = [
  { verb: "set", tail: "<name> --hdr <mood>", desc: "Define / re-light the active set" },
  { verb: "cast add", tail: "<name> [--profile <rig>]", desc: "Cast a character into the scene" },
  { verb: "cast remove", tail: "<name>", desc: "Remove a character" },
  { verb: "cast rename", tail: "<old> <new>", desc: "Rename a cast member" },
  { verb: "shot add", tail: "--after <id>", desc: "Block a new shot" },
  { verb: "shot remove", tail: "--id <id>", desc: "Remove a shot" },
  { verb: "shot retime", tail: "--id <id> --duration <s>", desc: "Change a shot's duration" },
  { verb: "cam", tail: "<wide|medium|close|orbit>", desc: "Set the active shot camera" },
  { verb: "light add", tail: "--type <rim|key|fill>", desc: "Add a light to the set" },
  { verb: "fx add", tail: "<name>", desc: "Add an effect to the timeline" },
  { verb: "prop add", tail: "<name> [--set-dressing]", desc: "Add a prop to the scene" },
  { verb: "dialogue", tail: "<character> \"<line>\"", desc: "Add dialogue for a character" },
  { verb: "block", tail: "<character> <action>", desc: "Block a character action" },
  { verb: "gesture", tail: "<character> <clip-id>", desc: "Queue a gesture clip for a character" },
  { verb: "show", tail: "<shots|cast|props|lights>", desc: "Inspect scene elements" },
  { verb: "render", tail: "[--shot <id>] [--quality preview|final]", desc: "Render a preview or final" }
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
  if (["cast", "shot", "light", "fx"].includes(verb) && rest[0]) {
    verb += " " + rest[0];
    rest = rest.slice(1);
  }
  return { verb, rest, flags, raw: t, isCommand: VERBS.some((v) => t.startsWith(v.verb.split(" ")[0])) };
}
