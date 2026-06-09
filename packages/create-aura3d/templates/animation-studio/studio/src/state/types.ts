/**
 * UI-side view model for the Animation Studio shell.
 *
 * The single source of truth is the REAL runtime EpisodeDocument fetched from
 * `GET /api/document`; it is mapped into the types below by `mapDocument.ts`.
 * There is no seed / fixture — when no document exists the UI renders empty.
 */

import type { CharacterFidelity, SceneFidelity } from "./fidelity";

export type SelectionType = "shot" | "cast" | "set" | "prop";
export type ViewMode = "Render" | "Wireframe" | "Storyboard";
export type ComposerMode = "Prompt" | "Command";
export type IconName = string;

export interface Selection {
  type: SelectionType;
  id: string;
}

/**
 * Where a cast member came from — kept honest and visible (Phase E3):
 *  - `authored-fallback` — a built-in authored/placeholder character (NOT catalog evidence).
 *  - `catalog-resolved`  — resolved from the federated catalog (carries source/license/url).
 *  - `user-uploaded`     — a GLB the user dropped in (`cast add --file`).
 */
export type CastSource = "authored-fallback" | "catalog-resolved" | "user-uploaded";

export interface CastMember {
  id: string;
  name: string;
  kind: string;
  color: string;
  glyph: string;
  lines: number;
  /** Provenance class — drives the Outliner source label so fallback is never sold as catalog. */
  source: CastSource;
  /** Short human label for the source (e.g. catalog title / "authored" / "uploaded"). */
  sourceLabel: string;
  /** M7 — honest fidelity tier (A/B/C). C is "previz" — never presented as finished. */
  fidelity: CharacterFidelity;
}

export interface SetEntity {
  id: string;
  name: string;
  meta: string;
  icon: IconName;
}

export interface PropEntity {
  id: string;
  name: string;
  meta: string;
  icon: IconName;
}

export interface Shot {
  id: string;
  name: string;
  start: number;
  dur: number;
  /** Real render thumbnail (/preview/frames/*.png) once a render exists, else "". */
  frame: string;
  cam: string;
  who: string[];
  color: string;
}

export interface Beat {
  id: string;
  shot: string;
  who: string;
  start: number;
  dur: number;
  text: string;
  /* ---- Director per-beat acting plan (F1) — inspectable in the UI ---- */
  /** Who the speaker is addressing (the other party), or "" when solo. */
  listener: string;
  /** What the speaker DOES (talk / gesture / point / nod / walk / run) — the real director clip. */
  speakingIntent: string;
  /** What the listener DOES in response (react / nod / idle) — never frozen. */
  listenerIntent: string;
  /** The camera framing for this beat (establishing / two-shot / medium / close-up). */
  camera: string;
}

export interface TimelineSpan {
  id: string;
  start: number;
  dur: number;
  text: string;
  color: string;
}

/** The UI view model derived from the real working document. */
export interface EpisodeDocument {
  title: string;
  cast: CastMember[];
  sets: SetEntity[];
  props: PropEntity[];
  shots: Shot[];
  beats: Beat[];
  camera: TimelineSpan[];
  /** Per-character gesture/reaction windows (gesture/point/nod/react/wave) for the timeline. */
  gestures: TimelineSpan[];
  fx: TimelineSpan[];
  DUR: number;
  /** M7 — scene-level fidelity tier (floor of the cast). C scene is labeled "previz". */
  fidelity: SceneFidelity;
}

/* ---- Director Console transcript model ---- */

export type DiffOp = "+" | "~" | "!";
export type DiffKind = "add" | "mod" | "del";

export interface Diff {
  op: DiffOp;
  k: DiffKind;
  /** May contain <b>…</b> emphasis (rendered as bold). */
  t: string;
}

export type CmdState = "run" | "ok" | "bad";

export interface YouTurn {
  type: "you";
  id: string;
  text: string;
}

export interface DirTurn {
  type: "dir";
  id: string;
  /** Markdown-ish: **bold** emphasis is supported. */
  think: string;
}

export interface CmdTurn {
  type: "cmd";
  id: string;
  verb: string;
  args: string;
  state: CmdState;
  diffs?: Diff[];
  dur?: string;
  hash?: string;
}

export interface RenderTurn {
  type: "render";
  id: string;
  frame: string;
  label: string;
  shot: string;
  meta: string;
}

export type Turn = YouTurn | DirTurn | CmdTurn | RenderTurn;

export interface Toast {
  msg: string;
  kind: "ok" | "tip";
}
