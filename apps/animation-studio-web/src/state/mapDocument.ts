/**
 * Maps the REAL runtime EpisodeDocument (as persisted to
 * `dist/scene/working.document.json` by the Scene-Tool CLI) into the UI model
 * (`types.ts`) that drives the Outliner / Stage / Inspector / Timeline.
 *
 * There is NO seed / fixture: the only source of truth is the live document
 * fetched from `GET /api/document`. When no document exists the UI shows an
 * empty state (see `App.tsx`).
 */

import type {
  Beat,
  CastMember,
  CastSource,
  EpisodeDocument,
  PropEntity,
  SetEntity,
  Shot,
  TimelineSpan,
  Turn
} from "./types";
import {
  gradeSceneFidelity,
  type CharacterFidelityInput,
  type FidelityProvenance,
  type FidelityRigGrade
} from "./fidelity";

/* ---- Runtime EpisodeDocument shape (subset the UI reads) ---- */

export interface RuntimeShot {
  shotId: string;
  presetId: string;
  startTime: number;
  endTime: number;
}

export interface RuntimeDialogueLine {
  lineId: string;
  speakerId: string;
  startTime: number;
  endTime: number;
  text: string;
}

export interface RuntimeCharacter {
  id: string;
  role?: string;
  /** Catalog/source URL when this cast member was resolved from the federated catalog. */
  sourceUrl?: string;
  /** Source title / attribution string the resolver persisted (catalog or upload). */
  attribution?: string;
  /** License string for catalog/uploaded assets. */
  license?: string;
  /**
   * Explicit provenance class when the resolver/CLI recorded one. When absent it is INFERRED:
   * a sourceUrl/attribution → catalog-resolved; otherwise authored-fallback.
   */
  source?: "authored-fallback" | "catalog-resolved" | "user-uploaded" | "curated";
  /** M7 — rig grade (A/B/C/D) the resolver recorded, when available; drives the fidelity tier. */
  rigGrade?: "A" | "B" | "C" | "D";
  /** M7 — dominant motion source the render played (mocap/extracted/procedural…), when recorded. */
  motionSource?: string;
  /** Default performance clip id. */
  defaultClip?: string;
  /** Mouth morph target index for lip-sync. */
  mouthMorphIndex?: number;
  /** Foot IK configuration (truthy when enabled). */
  footIk?: unknown;
}

export interface RuntimeShotBlocking {
  shotId: string;
  /** Standard performance clip the director assigned this beat (idle/talk/gesture/point/nod/walk/run/react). */
  clip: string;
}

export interface RuntimeCharacterBlocking {
  characterId: string;
  shots?: RuntimeShotBlocking[];
}

export interface RuntimeProp {
  id: string;
  url?: string;
  attribution?: string;
}

export interface RuntimeDocument {
  id?: string;
  duration?: number;
  assets?: {
    characters?: RuntimeCharacter[];
    props?: RuntimeProp[];
  };
  set?: unknown;
  shots?: RuntimeShot[];
  blocking?: RuntimeCharacterBlocking[];
  dialogue?: { language?: string; lines?: RuntimeDialogueLine[] };
}

export interface DocumentResponse {
  exists?: boolean;
}

/** Human label for a shot from its camera preset id. */
const PRESET_LABELS: Record<string, string> = {
  establishing: "Establishing",
  "two-shot": "Two-shot",
  medium: "Medium",
  "close-up": "Close-up",
  closeup: "Close-up",
  wide: "Wide",
  reverse: "Reverse",
  "over-shoulder": "Over-shoulder"
};

export function presetLabel(presetId: string): string {
  return PRESET_LABELS[presetId] ?? cap(presetId.replace(/[-_]/g, " "));
}

/* ---- Director acting-intent inference (F1) — mirrors src/director/director-heuristics.ts ----
 * Used only as a FALLBACK when a beat has no real director clip in `blocking`, so the per-beat
 * preview always shows a meaningful speaking/listener intent rather than a blank. The canonical
 * rules live in the template's director; these match them for a question/emphasis/disagreement/
 * movement line. */
const NEGATIONS = ["no", "not", "never", "wrong", "don't", "won't", "can't", "stop", "refuse", "disagree"];
const MOVEMENTS = ["walk", "go", "going", "run", "running", "cross", "leave", "come", "coming", "move", "follow"];

function lineWords(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z' ]+/g, " ").split(/\s+/).filter(Boolean));
}

export function inferSpeakingIntent(text: string): string {
  const w = lineWords(text);
  if (MOVEMENTS.some((m) => w.has(m))) return /\b(run|running)\b/i.test(text) ? "run" : "walk";
  if (text.includes("!") || /\b[A-Z]{2,}\b/.test(text)) return "gesture";
  return "talk";
}

export function inferListenerIntent(text: string): string {
  const w = lineWords(text);
  if (NEGATIONS.some((n) => w.has(n)) || text.includes("!") || /\b[A-Z]{2,}\b/.test(text)) return "react";
  if (text.includes("?")) return "nod";
  return "nod";
}

/** A small, stable accent palette assigned per id (shots + cast). */
const PALETTE = ["#6b6bff", "#5b6bd6", "#4f8fd6", "#7b6bd6", "#ff8a5b", "#4fc2ff", "#9a7bff", "#2dd4a7", "#ffb020"];

/** Deterministic accent for an id — stable across reloads. */
export function stableAccent(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Phase E3 — classify a cast member's PROVENANCE so the Outliner can label it honestly and never
 * sell an authored fallback as catalog evidence. Trust an explicit `source` the resolver recorded;
 * otherwise INFER: a catalog/source URL or attribution → catalog-resolved; a local-file upload
 * marker → user-uploaded; nothing → authored-fallback (built-in/placeholder).
 */
export function castProvenance(c: RuntimeCharacter): { source: CastSource; sourceLabel: string } {
  // An explicit `source` the resolver/CLI recorded always wins. (A `curated` cast member is a
  // catalog-class asset for the Outliner badge; its higher fidelity tier is computed separately.)
  if (c.source === "user-uploaded" || /^file:/i.test(c.sourceUrl ?? "")) {
    return { source: "user-uploaded", sourceLabel: c.attribution ?? "user-uploaded GLB" };
  }
  if (c.source === "curated") {
    return { source: "catalog-resolved", sourceLabel: c.attribution ?? "curated cast" };
  }
  if (c.source === "catalog-resolved" || c.sourceUrl || c.attribution) {
    return { source: "catalog-resolved", sourceLabel: c.attribution ?? "catalog" };
  }
  return { source: "authored-fallback", sourceLabel: "authored fallback" };
}

/**
 * M7 — map a runtime character to the fidelity-grading provenance enum. Unlike the Outliner
 * badge (`castProvenance`) this keeps `curated` distinct, because a curated/uploaded rig is the
 * only provenance that can reach grade A.
 */
export function fidelityProvenance(c: RuntimeCharacter): FidelityProvenance {
  if (c.source === "curated") return "curated";
  if (c.source === "user-uploaded" || /^file:/i.test(c.sourceUrl ?? "")) return "user-uploaded";
  if (c.source === "catalog-resolved" || c.sourceUrl || c.attribution) return "catalog-resolved";
  return "authored-fallback";
}

function asRigGrade(value: unknown): FidelityRigGrade | undefined {
  return value === "A" || value === "B" || value === "C" || value === "D" ? value : undefined;
}

/**
 * Performance clips that read as a GESTURE / REACTION window on the timeline (Phase C2)
 * — as opposed to ambient holds (idle/talk) or locomotion (walk/run). The director emits
 * these per beat (gesture on emphasis, react/nod when another character speaks), so a
 * blocking beat carrying one of these is a real gesture window the timeline surfaces.
 */
const GESTURE_CLIPS = new Set<string>(["gesture", "point", "nod", "react", "wave"]);

/** Human label for a gesture clip id. */
function gestureLabel(clip: string): string {
  return cap(clip);
}

/** True when the document response is a real authored document. */
export function documentExists(doc: RuntimeDocument & DocumentResponse): boolean {
  return doc.exists !== false && Array.isArray(doc.shots);
}

/** Map the runtime EpisodeDocument → the UI model. */
export function mapDocument(doc: RuntimeDocument): EpisodeDocument {
  const rShots = doc.shots ?? [];
  const rLines = doc.dialogue?.lines ?? [];
  const rChars = doc.assets?.characters ?? [];
  const rProps = doc.assets?.props ?? [];
  const rBlocking = doc.blocking ?? [];
  const DUR = doc.duration ?? (rShots.length ? Math.max(...rShots.map((s) => s.endTime)) : 0);

  // Lines spoken in a shot's [start,end) window — drives `who` + the inspector beat count.
  const speakersInWindow = (start: number, end: number): string[] => {
    const ids = new Set<string>();
    for (const l of rLines) {
      if (l.startTime < end && l.endTime > start) ids.add(l.speakerId);
    }
    return [...ids];
  };

  const shots: Shot[] = rShots.map((s) => ({
    id: s.shotId,
    name: presetLabel(s.presetId),
    start: s.startTime,
    dur: s.endTime - s.startTime,
    cam: s.presetId,
    // A real render thumbnail if one has been produced; else undefined (empty stage).
    frame: "",
    who: speakersInWindow(s.startTime, s.endTime),
    color: stableAccent(s.shotId)
  }));

  const linesPerSpeaker = (id: string): number => rLines.filter((l) => l.speakerId === id).length;

  // M7 — fidelity inputs per character (rig grade + provenance + motion source). Shading/shadows
  // are scene-render properties the document does not carry, so the document-only UI grades on the
  // rig+provenance+motion axes; the render-side `fidelity.ts` adds shading/shadows when present.
  const fidelityInputs: CharacterFidelityInput[] = rChars.map((c) => ({
    id: c.id,
    rigGrade: asRigGrade(c.rigGrade),
    provenance: fidelityProvenance(c),
    motionSource: (c.motionSource as CharacterFidelityInput["motionSource"]) ?? undefined
  }));
  const sceneFidelity = gradeSceneFidelity(fidelityInputs);
  const fidelityById = new Map(sceneFidelity.characters.map((f) => [f.id, f]));

  const cast: CastMember[] = rChars.map((c) => {
    const { source, sourceLabel } = castProvenance(c);
    const fidelity =
      fidelityById.get(c.id) ?? { id: c.id, grade: "C", previz: true, reason: "previz: ungraded" };
    return {
      id: c.id,
      name: cap(c.id),
      kind: c.role || "character",
      color: stableAccent(c.id),
      glyph: (c.id[0] ?? "?").toUpperCase(),
      lines: linesPerSpeaker(c.id),
      source,
      sourceLabel,
      fidelity,
      defaultClip: c.defaultClip,
      mouthMorphIndex: c.mouthMorphIndex,
      footIk: !!c.footIk,
      gradeAwareIntent: `${fidelity.grade}-grade`
    };
  });

  // The set is a single spec on the document — surface it as one outliner entry.
  const sets: SetEntity[] = doc.set
    ? [{ id: doc.id ? doc.id + "-set" : "set", name: doc.id ? cap(doc.id) + " — Set" : "Set", meta: "scene set", icon: "globe" }]
    : [];

  const props: PropEntity[] = dedupeProps(rProps);

  const shotForTime = (t: number): string => {
    const hit = rShots.find((s) => t >= s.startTime && t < s.endTime);
    return hit ? hit.shotId : rShots.length ? rShots[0]!.shotId : "";
  };
  const presetForShot = (shotId: string): string => {
    const hit = rShots.find((s) => s.shotId === shotId);
    return hit ? presetLabel(hit.presetId) : "";
  };
  // The director's REAL per-beat clip for a character in a shot (from blocking), if present.
  const clipFor = (characterId: string, shotId: string): string | undefined => {
    const cb = (doc.blocking ?? []).find((b) => b.characterId === characterId);
    return cb?.shots?.find((s) => s.shotId === shotId)?.clip;
  };
  const castIds = rChars.map((c) => c.id);

  const beats: Beat[] = rLines.map((l) => {
    const shot = shotForTime(l.startTime);
    // The addressed party: the other cast member (1:1), else the first non-speaker.
    const listener = castIds.find((id) => id !== l.speakerId) ?? "";
    // Prefer the director's real assigned clip; else infer the intent from the line text (F1 rules).
    const speakingIntent = clipFor(l.speakerId, shot) ?? inferSpeakingIntent(l.text);
    const listenerIntent = listener ? clipFor(listener, shot) ?? inferListenerIntent(l.text) : "idle";
    return {
      id: l.lineId,
      shot,
      who: l.speakerId,
      start: l.startTime,
      dur: l.endTime - l.startTime,
      text: l.text,
      listener,
      speakingIntent,
      listenerIntent,
      camera: presetForShot(shot)
    };
  });

  // Camera track: one clip per shot, derived from its preset. FX: empty (no fx in the doc).
  const camera: TimelineSpan[] = rShots.map((s) => ({
    id: "cam-" + s.shotId,
    start: s.startTime,
    dur: s.endTime - s.startTime,
    text: presetLabel(s.presetId),
    color: "#2dd4a7"
  }));
  const fx: TimelineSpan[] = [];

  // Gesture track (Phase C2): every blocking beat whose director-assigned clip is a
  // gesture/reaction (gesture/point/nod/react/wave) becomes a window spanning the shot it
  // plays in. These are REAL beat timings — the same shot windows the player schedules the
  // clip over — so the timeline shows where gestures/reactions land, alongside speech.
  const shotWindow = (shotId: string): RuntimeShot | undefined => rShots.find((s) => s.shotId === shotId);
  const gestures: TimelineSpan[] = [];
  for (const cb of rBlocking) {
    for (const sb of cb.shots ?? []) {
      if (!GESTURE_CLIPS.has(sb.clip)) continue;
      const win = shotWindow(sb.shotId);
      if (!win) continue;
      gestures.push({
        id: "gst-" + cb.characterId + "-" + sb.shotId,
        start: win.startTime,
        dur: win.endTime - win.startTime,
        text: cap(cb.characterId) + " · " + gestureLabel(sb.clip),
        color: stableAccent(cb.characterId)
      });
    }
  }

  return {
    title: doc.id ? cap(doc.id) : "Untitled scene",
    cast,
    sets,
    props,
    shots,
    beats,
    camera,
    gestures,
    fx,
    DUR,
    fidelity: sceneFidelity
  };
}

/** Collapse duplicate prop ids (e.g. set dressing instances) into one outliner row with a count. */
function dedupeProps(rProps: RuntimeProp[]): PropEntity[] {
  const counts = new Map<string, { p: RuntimeProp; n: number }>();
  for (const p of rProps) {
    const e = counts.get(p.id);
    if (e) e.n += 1;
    else counts.set(p.id, { p, n: 1 });
  }
  return [...counts.values()].map(({ p, n }) => ({
    id: p.id,
    name: cap(p.id),
    meta: n > 1 ? n + "×" : "prop",
    icon: "cube"
  }));
}

/* ---- History → Director Console transcript ---- */

interface RuntimeHistoryEntry {
  verb?: string;
  command?: string;
  args?: string;
  ok?: boolean;
  rejected?: boolean;
  output?: string;
  diff?: string[];
  ms?: number;
  time?: number;
  hash?: string;
}

/** Map the REAL command history into Director Console command cards. Empty array → no cards. */
export function mapHistory(hist: unknown): Turn[] {
  if (!Array.isArray(hist)) return [];
  return (hist as RuntimeHistoryEntry[]).map((h, i) => {
    const raw = (h.command ?? h.verb ?? "").trim();
    const verb = h.verb ?? raw.split(/\s+/)[0] ?? "—";
    const args = h.args ?? (raw.startsWith(verb) ? raw.slice(verb.length).trim() : raw);
    const bad = h.rejected === true || h.ok === false;
    const diffLines = Array.isArray(h.diff) ? h.diff : h.output ? h.output.split("\n").filter(Boolean) : [];
    return {
      type: "cmd",
      id: "h" + i,
      verb,
      args,
      state: bad ? "bad" : "ok",
      diffs: diffLines.map((t) => ({
        op: bad ? "!" : "~",
        k: bad ? "del" : "mod",
        t: escapeHtml(t)
      })),
      dur: h.ms != null ? (h.ms / 1000).toFixed(1) + "s" : "—",
      hash: h.hash ?? "—"
    };
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
