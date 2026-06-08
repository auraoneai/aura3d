/**
 * director-heuristics.ts — the DETERMINISTIC tier of the Director.
 *
 * Given a scene's shots + dialogue + cast + walkable bounds + available props, it
 * GENERATES the blocking / camera / performance / set-dressing / world-state of an
 * EpisodeDocument — the parts that used to be hand-authored constants. No LLM, no
 * randomness beyond a seeded scatter, fully deterministic.
 *
 * HONEST SCOPE (see docs/animation-studio/quality-and-limitations.md): these rules target
 * the constrained genre the MVP targets — **1–2 characters, dialogue-driven, single
 * walkable set**. They reliably stage conversation: characters at conversation distance
 * facing each other, establishing→two-shot→close-up framing, the speaker emphasised in
 * close-ups, props scattered over the walkable area, world-state ramped across the act.
 * They do NOT handle action, crowds, complex choreography, or non-dialogue beats — those
 * are the LLM director's job (and remain unproven). The output is always a *valid*
 * document; "valid" is not "well-directed" — that needs the human rubric (the watchability gate).
 */

import type { CameraPresetId } from "@aura3d/engine";
import type { CharacterBlocking, PropPlacement, ShotBlocking, ShotSpec, Vec3 } from "../episode-document";

export interface DirectorCharacter {
  readonly id: string;
  /** Where the character starts the scene (drives a walk-in on the opening shot). */
  readonly entersFrom?: "left" | "right" | "none";
}

export interface DirectorShot {
  readonly shotId: string;
  readonly startTime: number;
  readonly endTime: number;
}

export interface DirectorDialogueLine {
  readonly lineId: string;
  readonly speakerId: string;
  readonly startTime: number;
  readonly endTime: number;
  /**
   * The spoken line. Drives the acting rules (Phase F1): questions, emphasis,
   * disagreement and movement verbs are read off this text to choose intents.
   * Optional so legacy callers (timing-only inputs) still type-check; when absent
   * the beat falls back to plain talk + attentive listening.
   */
  readonly text?: string;
}

export interface DirectorPropSpec {
  readonly propId: string;
  readonly count: number;
  readonly scaleRange: readonly [number, number];
  readonly feetOffset: number;
}

export interface DirectorSceneInput {
  readonly duration: number;
  readonly characters: readonly DirectorCharacter[];
  readonly shots: readonly DirectorShot[];
  readonly dialogue: readonly DirectorDialogueLine[];
  /** Walkable area characters and props stay inside. */
  readonly walkableBounds: { readonly min: Vec3; readonly max: Vec3 };
  readonly props: readonly DirectorPropSpec[];
  /**
   * @deprecated Per-beat clips now come from the fixed {@link PERFORMANCE_VOCABULARY}
   * (idle/talk/gesture/point/nod/walk/run/react) chosen by role, so a retargeted clip
   * library resolves them. This override is no longer consulted by {@link directScene}.
   */
  readonly clips?: { readonly idle?: string; readonly walk?: string; readonly gesture?: string };
  /**
   * Optional duration estimator (Phase C2). When supplied, beat durations are taken
   * from this (so the director shares Phase C's `estimateSpeechDuration`); otherwise
   * the director uses its own self-contained words/165-wpm fallback so it never has to
   * import Phase C's file.
   */
  readonly durationEstimator?: (text: string) => number;
  /**
   * Optional per-character body-acting {@link RigGrade} (from `@aura3d/engine`'s `gradeRig`).
   * When provided, the director consults {@link gradeAwareIntent} so a character whose rig can't
   * perform an intent gets it honestly downgraded — a D-grade (no usable skeleton) rig is never
   * told to gesture/walk; it talks or holds. Omitted ⇒ no restriction (every rig treated as A/B).
   */
  readonly gradesByCharacter?: Readonly<Record<string, RigGrade>>;
}

export interface DirectedScene {
  readonly shots: readonly ShotSpec[];
  readonly blocking: readonly CharacterBlocking[];
  readonly setDressing: readonly PropPlacement[];
  readonly worldState: { readonly glowSpanSeconds: number };
}

// --- small deterministic helpers ---
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function yawFacing(from: Vec3, to: Vec3): number {
  return Math.atan2(to[0] - from[0], to[2] - from[2]);
}

/**
 * The STANDARD performance vocabulary — the fixed contract of clip intents the Director
 * emits per beat. A downstream retargeted clip library exposes exactly these states, so
 * the player can resolve every beat to a real animation. The Director must only ever
 * write one of these ids into a beat's `clip` (never a fictional / asset-specific name).
 */
export const PERFORMANCE_VOCABULARY = [
  "idle",
  "talk",
  "gesture",
  "point",
  "nod",
  "walk",
  "run",
  "react"
] as const;
export type PerformanceClip = (typeof PERFORMANCE_VOCABULARY)[number];
const VOCAB = new Set<string>(PERFORMANCE_VOCABULARY);

/** Distance (world units) beyond which a traversal reads as a run rather than a walk. */
const RUN_DISTANCE = 3.0;

// ---------------------------------------------------------------------------
// Phase F1 — inspectable per-beat ACTING record + C2 beat timing
// ---------------------------------------------------------------------------

/** The coarse camera intent the director assigns a beat (mirrors the shot presets). */
export type CameraIntent = "establishing" | "two-shot" | "medium" | "close-up";

/**
 * One fully-inspectable performance beat (Phase F1). Every dialogue line becomes a
 * beat; the record is the director's *explanation* of how the scene should be acted —
 * who speaks, who listens, what gesture lands, how the camera frames it and how long
 * the beat runs (C2). It is data, so tests and a UI preview can read the intent
 * directly instead of inferring it from blocking.
 */
export interface DirectorBeat {
  readonly lineId: string;
  readonly speaker: string;
  /** The character being addressed (the other party in a 1:1, else the next non-speaker). */
  readonly listener: string | null;
  readonly text: string;
  /** What the speaker DOES while talking (talk / gesture / point / nod / walk / run). */
  readonly speakingIntent: PerformanceClip;
  /** What the listener DOES in response (react / nod / idle), never frozen. */
  readonly listenerIntent: PerformanceClip;
  /** Convenience mirror of {@link speakingIntent} for non-talk emphasis beats. */
  readonly gesture: PerformanceClip;
  readonly cameraIntent: CameraIntent;
  /** Estimated beat length in seconds (C2). */
  readonly durationSeconds: number;
}

/** Words that signal the speaker is disagreeing / negating — these earn a stronger react. */
const NEGATION_WORDS = [
  "no",
  "not",
  "never",
  "wrong",
  "don't",
  "dont",
  "won't",
  "wont",
  "can't",
  "cant",
  "isn't",
  "isnt",
  "stop",
  "refuse",
  "disagree",
  "nonsense"
];

/** Movement verbs that turn a beat into locomotion (walk/turn/reposition). */
const MOVEMENT_WORDS = ["walk", "go", "going", "run", "running", "cross", "leave", "leaving", "come", "coming", "move", "follow"];

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isQuestion(text: string): boolean {
  return text.includes("?");
}

/** Emphasis = a shout ("!") or a SHOUTED word (a 2+ letter ALL-CAPS run). */
function isEmphatic(text: string): boolean {
  if (text.includes("!")) return true;
  return /\b[A-Z]{2,}\b/.test(text);
}

function isDisagreement(text: string): boolean {
  const w = new Set(words(text));
  return NEGATION_WORDS.some((n) => w.has(n));
}

function hasMovement(text: string): boolean {
  const w = new Set(words(text));
  return MOVEMENT_WORDS.some((m) => w.has(m));
}

/**
 * The director's self-contained speech-duration fallback (C2). Mirrors Phase C's
 * model — words / 165 wpm + punctuation pauses, clamped — but lives here so the
 * director never imports the document module. A caller may inject Phase C's real
 * estimator via {@link DirectorSceneInput.durationEstimator} instead.
 */
export function estimateBeatDuration(text: string): number {
  const trimmed = (text ?? "").trim();
  if (trimmed.length === 0) return 0.9;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const speaking = (wordCount / 165) * 60;
  const soft = (trimmed.match(/[,;:]/g) ?? []).length * 0.25;
  const hard = (trimmed.match(/[.!?]/g) ?? []).length * 0.4;
  return Math.min(22, Math.max(0.9, speaking + soft + hard));
}

/**
 * The speaker's varied performance intents, cycled across that speaker's emphasis
 * beats so a talky scene isn't all low-motion `talk`. Order: gesture → point → nod.
 */
const SPEAKER_EMPHASIS_CYCLE: readonly PerformanceClip[] = ["gesture", "point", "nod"];

/**
 * Map a dialogue line (+ its position in a speaker's run of beats) to a speaking
 * intent. Rules (F1):
 *   - movement verb        → walk / run (locomotion wins; you can't argue mid-stride)
 *   - emphasis (!/ALL-CAPS) → a varied gesture (gesture/point/nod, rotated)
 *   - question ("?")        → talk (the *listener* tilts/reacts; see listener rule)
 *   - plain line           → mostly talk, but every Nth plain beat is upgraded to a
 *                            rotated gesture so a speaker is never all-talk.
 */
function speakingIntentFor(text: string, emphasisOrdinal: number, plainOrdinal: number): PerformanceClip {
  if (hasMovement(text)) {
    // Long movement words ("run"/"running") read as a run; else a walk/reposition.
    return /\b(run|running)\b/i.test(text) ? "run" : "walk";
  }
  if (isEmphatic(text)) {
    return SPEAKER_EMPHASIS_CYCLE[emphasisOrdinal % SPEAKER_EMPHASIS_CYCLE.length]!;
  }
  // Plain line: upgrade every 3rd plain beat to a rotated gesture so it's not all talk.
  if (plainOrdinal > 0 && plainOrdinal % 3 === 0) {
    return SPEAKER_EMPHASIS_CYCLE[(plainOrdinal / 3) % SPEAKER_EMPHASIS_CYCLE.length]!;
  }
  return "talk";
}

/**
 * Map a dialogue line to the LISTENER's reaction (F1). The listener is never frozen:
 *   - question        → nod (head-tilt / acknowledging the question)
 *   - disagreement    → react (a stronger recoil / pose change)
 *   - emphasis        → react (they flinch at the shout)
 *   - plain line      → nod / idle-attentive (alternated so it's not static)
 */
function listenerIntentFor(text: string, listenerOrdinal: number): PerformanceClip {
  if (isDisagreement(text) || isEmphatic(text)) return "react";
  if (isQuestion(text)) return "nod";
  // Plain: alternate nod ↔ react so the listener visibly tracks the conversation.
  return listenerOrdinal % 2 === 0 ? "nod" : "react";
}

const BEAT_CAMERA_CYCLE: readonly CameraIntent[] = ["establishing", "two-shot", "medium", "close-up"];

/**
 * Build the inspectable beat-by-beat acting plan (F1 + C2) from the scene's dialogue.
 * One beat per dialogue line, in time order. The speaker's intent varies (gesture/
 * point/nod rotate, movement verbs walk); the listener always has a non-idle reaction;
 * each beat carries an estimated duration. Reactions land AFTER the line that triggers
 * them by construction (a beat's listener reacts to that same beat's speaker line).
 */
export function directBeats(input: DirectorSceneInput): DirectorBeat[] {
  const estimate = input.durationEstimator ?? estimateBeatDuration;
  const lines = [...input.dialogue].sort((a, b) => a.startTime - b.startTime);
  const cast = input.characters.map((c) => c.id);

  // Per-speaker counters so emphasis gestures and plain-beat upgrades rotate per speaker.
  const emphasisCount = new Map<string, number>();
  const plainCount = new Map<string, number>();
  let listenerOrdinal = 0;

  return lines.map((line, index) => {
    const text = line.text ?? "";
    // The listener is the other party in a 1:1; otherwise the first cast member who
    // isn't the speaker (so a non-speaking character always has someone to react to).
    const listener = cast.find((id) => id !== line.speakerId) ?? null;

    const emphatic = isEmphatic(text) && !hasMovement(text);
    const plain = !emphatic && !hasMovement(text) && !isEmphatic(text);
    const emphasisOrdinal = emphasisCount.get(line.speakerId) ?? 0;
    const plainOrdinal = plainCount.get(line.speakerId) ?? 0;

    const speakingIntent = speakingIntentFor(text, emphasisOrdinal, plainOrdinal);
    if (emphatic) emphasisCount.set(line.speakerId, emphasisOrdinal + 1);
    if (plain) plainCount.set(line.speakerId, plainOrdinal + 1);

    const listenerIntent = listenerIntentFor(text, listenerOrdinal);
    listenerOrdinal += 1;

    const cameraIntent = BEAT_CAMERA_CYCLE[Math.min(index, BEAT_CAMERA_CYCLE.length - 1)]!;
    const durationSeconds = estimate(text);

    return {
      lineId: line.lineId,
      speaker: line.speakerId,
      listener,
      text,
      speakingIntent,
      listenerIntent,
      gesture: speakingIntent,
      cameraIntent,
      durationSeconds
    };
  });
}

// ---------------------------------------------------------------------------
// Phase B5 — rig-grade-aware intent restriction
// ---------------------------------------------------------------------------

/**
 * Body-acting suitability grade for a character's rig — mirrors {@link RigGrade} from
 * `@aura3d/engine`'s `gradeRig`/RigQuality (A full humanoid … D no usable skeleton). We
 * re-declare the union locally (rather than import the engine internal) so the director
 * stays a leaf module, but the values are the SAME contract `gradeRig` reports.
 *
 *   - **A/B** — enough body to act → the full performance vocabulary is allowed.
 *   - **C**   — mascot/sparse (head + torso only, no real limb chains) → no full-limb
 *               gestures or locomotion; head/torso acting (nod / react / talk / idle) only.
 *   - **D**   — not suitable for body acting (root/props only) → talk-only / minimal; any
 *               body-acting intent is honestly downgraded to `talk` (or `idle` if it was
 *               a non-locomotion non-vocal hold).
 */
export type RigGrade = "A" | "B" | "C" | "D";

/** Intents that need real limb chains (full arms/legs) — unsafe on a C (mascot) or D rig. */
const LIMB_INTENTS = new Set<PerformanceClip>(["gesture", "point", "walk", "run"]);
/** Head/torso-only intents a C (mascot) rig CAN still perform honestly. */
const HEAD_TORSO_INTENTS = new Set<PerformanceClip>(["idle", "talk", "nod", "react"]);

/**
 * Restrict a chosen performance intent to what a character's rig can honestly play, given its
 * body-acting {@link RigGrade}. This is the director's one HONEST gate between the rich acting
 * vocabulary and a rig that physically cannot perform it — a D-grade (no usable skeleton) rig
 * must never be told to `walk`/`gesture`, only to talk or hold.
 *
 * The director consults this whenever a per-character grade is supplied (see
 * {@link directScene}'s `gradesByCharacter` option); with no grade it is a no-op (returns the
 * intent unchanged), so an ungraded pipeline is unaffected.
 *
 * Rules:
 *   - **A / B** (or undefined): no restriction — return the intent unchanged.
 *   - **C** (mascot / sparse): drop limb work — `gesture`/`point` → `nod` (head acting),
 *     `walk`/`run` → `idle` (it can't locomote); head/torso intents pass through.
 *   - **D** (no usable skeleton): talk-only / minimal — any vocal-ish intent collapses to
 *     `talk`; any pure body intent (gesture/point/walk/run/nod/react) collapses to `idle`.
 */
export function gradeAwareIntent(intent: PerformanceClip, grade?: RigGrade): PerformanceClip {
  if (grade == null || grade === "A" || grade === "B") return intent;

  if (grade === "C") {
    // Mascot: keep head/torso acting; convert limb gestures to a nod, locomotion to a hold.
    if (intent === "gesture" || intent === "point") return "nod";
    if (intent === "walk" || intent === "run") return "idle";
    return HEAD_TORSO_INTENTS.has(intent) ? intent : "idle";
  }

  // grade === "D": not suitable for body acting. Talk-only / minimal — never gesture or walk.
  if (intent === "talk") return "talk";
  // A body-acting intent on a D rig is dishonest; collapse it to a static hold.
  return LIMB_INTENTS.has(intent) || intent === "nod" || intent === "react" ? "idle" : intent;
}

// ---------------------------------------------------------------------------
// Phase F1 — director VALIDATION gate
// ---------------------------------------------------------------------------

export interface DirectorValidationIssue {
  readonly code: "ALL_LOW_MOTION" | "STATIC_CHARACTER" | "NO_GESTURE" | "NO_REACTION";
  readonly message: string;
  readonly characterId?: string;
}

export interface DirectorValidationResult {
  readonly ok: boolean;
  readonly issues: readonly DirectorValidationIssue[];
}

/** Intents that count as "low motion" — a scene made only of these reads as dead. */
const LOW_MOTION = new Set<PerformanceClip>(["idle", "talk"]);

/**
 * The director validation gate (F1). A directed scene FAILS when:
 *   - every beat's intents are only idle/talk (the whole scene is low-motion), OR
 *   - any character is static — never given a non-idle intent across the whole scene
 *     (as speaker OR listener) — unless that character is explicitly `staged` (e.g. a
 *     background extra the director deliberately froze).
 * It also flags the absence of any gesture or any listener reaction, which the
 * prompt-to-scene proof asserts must both be present.
 *
 * `stagedStatic` lists character ids that are *allowed* to be motionless on purpose.
 */
export function validateDirectedActing(
  beats: readonly DirectorBeat[],
  options: { readonly cast?: readonly string[]; readonly stagedStatic?: readonly string[] } = {}
): DirectorValidationResult {
  const issues: DirectorValidationIssue[] = [];
  const staged = new Set(options.stagedStatic ?? []);

  if (beats.length === 0) {
    return { ok: false, issues: [{ code: "ALL_LOW_MOTION", message: "Scene has no acting beats." }] };
  }

  // (1) Whole-scene low-motion check: at least one beat must carry a non-idle/talk intent.
  const anyHighMotion = beats.some(
    (b) => !LOW_MOTION.has(b.speakingIntent) || !LOW_MOTION.has(b.listenerIntent)
  );
  if (!anyHighMotion) {
    issues.push({
      code: "ALL_LOW_MOTION",
      message: "Every beat is idle/talk only — no gestures, reactions or movement anywhere in the scene."
    });
  }

  // (2) Per-character static check: each character must get a non-idle intent at least
  //     once (speaking or listening) unless explicitly staged as static.
  const nonIdleByCharacter = new Map<string, boolean>();
  const touched = new Set<string>();
  const mark = (id: string | null, intent: PerformanceClip) => {
    if (id == null) return;
    touched.add(id);
    if (intent !== "idle") nonIdleByCharacter.set(id, true);
    else if (!nonIdleByCharacter.has(id)) nonIdleByCharacter.set(id, false);
  };
  for (const b of beats) {
    mark(b.speaker, b.speakingIntent);
    mark(b.listener, b.listenerIntent);
  }
  const cast = options.cast ?? [...touched];
  for (const id of cast) {
    if (staged.has(id)) continue;
    const moved = nonIdleByCharacter.get(id);
    if (moved !== true) {
      issues.push({
        code: "STATIC_CHARACTER",
        characterId: id,
        message: `Character "${id}" is static for the whole scene (no non-idle intent). Stage it explicitly or give it a reaction.`
      });
    }
  }

  // (3) Variety asserts the prompt-to-scene proof depends on.
  const GESTURE_INTENTS = new Set<PerformanceClip>(["gesture", "point", "nod"]);
  if (!beats.some((b) => GESTURE_INTENTS.has(b.speakingIntent))) {
    issues.push({ code: "NO_GESTURE", message: "No speaker ever gestures/points/nods — acting is all talk." });
  }
  const REACTION_INTENTS = new Set<PerformanceClip>(["react", "nod"]);
  if (!beats.some((b) => b.listener != null && REACTION_INTENTS.has(b.listenerIntent))) {
    issues.push({ code: "NO_REACTION", message: "No listener ever reacts — non-speakers are frozen." });
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Render a human-readable beat-by-beat director report (for CLI inspection / proof).
 */
export function formatDirectorReport(beats: readonly DirectorBeat[]): string {
  const lines: string[] = ["Director beat plan (speaker → listener · camera · intents · duration):"];
  beats.forEach((b, i) => {
    const listener = b.listener ?? "(none)";
    lines.push(
      `  ${String(i + 1).padStart(2, "0")}. [${b.cameraIntent}] ${b.speaker} ${b.speakingIntent.toUpperCase()} ` +
        `→ ${listener} ${b.listenerIntent}  (${b.durationSeconds.toFixed(2)}s)  "${b.text}"`
    );
  });
  return lines.join("\n");
}

/** Was this character speaking at any point during the shot window? */
function isSpeakingDuring(input: DirectorSceneInput, characterId: string, shot: DirectorShot): boolean {
  for (const line of input.dialogue) {
    if (line.speakerId !== characterId) continue;
    const overlap = Math.min(line.endTime, shot.endTime) - Math.max(line.startTime, shot.startTime);
    if (overlap > 0) return true;
  }
  return false;
}

/** Is there ANY dialogue (from anyone) during the shot window? */
function hasDialogueDuring(input: DirectorSceneInput, shot: DirectorShot): boolean {
  for (const line of input.dialogue) {
    const overlap = Math.min(line.endTime, shot.endTime) - Math.max(line.startTime, shot.startTime);
    if (overlap > 0) return true;
  }
  return false;
}

/** Concatenated dialogue text spoken during the shot window (empty if none / untexted). */
function dialogueTextDuring(input: DirectorSceneInput, shot: DirectorShot): string {
  const parts: string[] = [];
  for (const line of input.dialogue) {
    const overlap = Math.min(line.endTime, shot.endTime) - Math.max(line.startTime, shot.startTime);
    if (overlap > 0 && line.text) parts.push(line.text);
  }
  return parts.join(" ");
}

/** Pick walk vs run from the planar travel distance between two marks. */
function locomotionClip(from: Vec3, to: Vec3): PerformanceClip {
  const dist = Math.hypot(to[0] - from[0], to[2] - from[2]);
  return dist >= RUN_DISTANCE ? "run" : "walk";
}

/** The character who speaks most during a shot (the shot's focus), or the first cast member. */
function shotSpeaker(input: DirectorSceneInput, shot: DirectorShot): string {
  const tally = new Map<string, number>();
  for (const line of input.dialogue) {
    const overlap = Math.min(line.endTime, shot.endTime) - Math.max(line.startTime, shot.startTime);
    if (overlap > 0) tally.set(line.speakerId, (tally.get(line.speakerId) ?? 0) + overlap);
  }
  let best = input.characters[0]?.id ?? "";
  let bestV = -1;
  for (const [id, v] of tally) if (v > bestV) { bestV = v; best = id; }
  return best;
}

/**
 * Stage a 1–2 character dialogue scene. Characters take base marks at conversation
 * distance facing each other; cameras cycle establishing → two-shot → close-up (the
 * close-up frames the active speaker); props scatter over the walkable bounds.
 */
export function directScene(sceneId: string, input: DirectorSceneInput): DirectedScene {
  const cast = input.characters;
  const { min, max } = input.walkableBounds;
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;

  // Base marks: spread the cast left→right across ~26% of the walkable width, facing center.
  // Tighter than before (was 40%) so a 2-shot frames the cast LARGE instead of two small figures
  // marooned in a wide empty plate.
  const span = (max[0] - min[0]) * 0.26;
  const baseMark = (i: number): Vec3 => {
    if (cast.length === 1) return [cx, 0, cz];
    const t = cast.length === 1 ? 0.5 : i / (cast.length - 1);
    return [cx + (t - 0.5) * span, 0, cz];
  };
  const center: Vec3 = [cx, 0, cz];

  // Camera presets cycle establishing → two-shot → medium. We DELIBERATELY avoid the tight
  // "close-up": its camera offset is fixed and does not know which way the character faces,
  // so for a face-off (characters turned to ±X) it frames their side/back. A stable two-shot
  // / medium frames BOTH characters from the front at conversation height — never a body part.
  // Open WIDE to show the place, then push to the tighter MEDIUM for the conversation so the cast
  // fills the frame rather than sitting small under a big empty backdrop.
  const presets: CameraPresetId[] = ["establishing", "medium", "medium"];

  const shots: ShotSpec[] = input.shots.map((shot, index) => {
    const presetId = presets[Math.min(index, presets.length - 1)]!;
    // Frame the conversation midpoint at GROUND level — the preset itself supplies the camera
    // height + head-height target (~1.25m), which createCameraPathFromPreset adds to this. So
    // pass the ground point; passing a raised Y would double the height and frame over the head.
    const cameraSubject: Vec3 = [cx, 0, cz];
    return { shotId: shot.shotId, presetId, startTime: shot.startTime, endTime: shot.endTime, cameraSubject };
  });

  const blocking: CharacterBlocking[] = cast.map((character, i) => {
    const mark = baseMark(i);
    const faceCenter = yawFacing(mark, center);
    // Per-character rotation counters so a speaker's emphasis/plain gestures vary across
    // shots (F1: not all low-motion talk) and a listener's reactions alternate.
    let shotEmphasis = 0;
    let shotPlain = 0;
    let shotListener = 0;
    const beats: ShotBlocking[] = input.shots.map((shot, index) => {
      // Opening shot: optional walk-in from the side the character enters from.
      if (index === 0 && character.entersFrom && character.entersFrom !== "none") {
        const offX = character.entersFrom === "left" ? min[0] - 0.5 : max[0] + 0.5;
        const enterStart: Vec3 = [offX, 0, mark[2]];
        const enterDur = Math.min(shot.endTime - shot.startTime, (input.duration) * 0.12);
        return {
          // Entering = traversing between marks → walk, or run for a long entrance.
          shotId: shot.shotId,
          clip: locomotionClip(enterStart, mark),
          waypoints: [
            { time: shot.startTime, position: enterStart, yaw: yawFacing(enterStart, mark) },
            { time: shot.startTime + enterDur, position: mark, yaw: faceCenter }
          ]
        };
      }
      // Middle beats: traverse toward the focus ONLY when that is a REAL walk — a meaningful
      // distance covered over the shot (≥ ~0.35 m/s). A small converge over a long shot is an
      // imperceptible drift (e.g. 0.65m over 8s ≈ 0.08 m/s) that reads as "walking in place while
      // standing still". Below that speed the character HOLDS its mark and PERFORMS instead (it
      // falls through to the speaker/listener acting logic below) — so we never generate a
      // meaningless micro-traverse. Real repositioning (entrance, or a movement-verb line) still walks.
      const isMiddle = index > 0 && index < input.shots.length - 1;
      if (isMiddle) {
        const converge: Vec3 = [mark[0] + (cx - mark[0]) * (index === 1 ? 0.45 : 0.25), 0, mark[2] + 0.25];
        const traverseDist = Math.hypot(converge[0] - mark[0], converge[2] - mark[2]);
        const shotDur = Math.max(1e-3, shot.endTime - shot.startTime);
        if (traverseDist / shotDur >= 0.35) {
          return {
            // Traversing between marks at a real walking speed → walk (or run for a large move).
            shotId: shot.shotId,
            clip: locomotionClip(mark, converge),
            sweeping: i === 0,
            waypoints: [
              { time: shot.startTime, position: mark, yaw: yawFacing(mark, converge) },
              { time: shot.endTime, position: converge, yaw: yawFacing(converge, center) }
            ]
          };
        }
        // else: fall through to hold-mark + perform (no pointless drift / walk-in-place).
      }
      // First/last beats: hold the mark, but FACE the active speaker (look-at / reaction).
      // The CLIP now expresses the beat's ROLE from the standard vocabulary so a retargeted
      // clip library can play it:
      //   - active speaker → `talk`, upgraded to `gesture` on the emphasis/close beat.
      //   - addressed non-speaker (someone IS speaking, just not them) → `nod` on the close
      //     (active listening) else `react`.
      //   - nobody speaking (or solo, silent) → `idle`.
      const thisShot = input.shots[index]!;
      const speaker = shotSpeaker(input, thisShot);
      const spkIdx = Math.max(0, cast.findIndex((c) => c.id === speaker));
      const spkMark = baseMark(spkIdx);
      const facing = i === spkIdx ? faceCenter : yawFacing(mark, spkMark);
      const isClose = index === input.shots.length - 1;
      const speakingNow = isSpeakingDuring(input, character.id, thisShot);
      const anyDialogue = hasDialogueDuring(input, thisShot);
      // The line(s) spoken during this shot — drives the acting rules when text is present.
      const shotText = dialogueTextDuring(input, thisShot);

      let beatClip: PerformanceClip;
      if (speakingNow) {
        // Active speaker. With dialogue TEXT, the acting rules pick the intent
        // (emphasis → gesture/point, movement → walk/run, else talk); on the close-up
        // a plain hold is still emphasised to a gesture so it's never a flat lip-flap.
        if (shotText) {
          const acted = speakingIntentFor(shotText, shotEmphasis, shotPlain);
          if (acted === "talk") {
            // Plain hold: emphasise on the close-up so it's never a flat lip-flap.
            beatClip = isClose ? "gesture" : "talk";
            shotPlain += 1;
          } else {
            beatClip = acted;
            shotEmphasis += 1;
          }
        } else {
          beatClip = isClose ? "gesture" : "talk";
        }
      } else if (anyDialogue) {
        // Being addressed. With text, react/nod follows the rules (disagreement/emphasis →
        // stronger react, question → nod); otherwise settle into a nod on the close-up.
        if (shotText) {
          beatClip = listenerIntentFor(shotText, shotListener++);
        } else {
          beatClip = isClose ? "nod" : "react";
        }
      } else {
        beatClip = "idle";
      }
      // B5: honestly restrict the chosen intent to what THIS character's rig can play. With no
      // grade supplied this is a no-op; a D-grade rig never holds a gesture/walk it can't perform.
      beatClip = gradeAwareIntent(beatClip, input.gradesByCharacter?.[character.id]);
      return { shotId: shot.shotId, clip: beatClip, waypoints: [{ time: shot.startTime, position: mark, yaw: facing }] };
    });
    return { characterId: character.id, shots: beats };
  });

  // Deterministic prop scatter over the walkable bounds (seeded by scene id).
  const rand = mulberry32(hashSeed(sceneId));
  const setDressing: PropPlacement[] = [];
  for (const prop of input.props) {
    for (let n = 0; n < prop.count; n += 1) {
      const x = min[0] + rand() * (max[0] - min[0]);
      const z = min[2] + rand() * (max[2] - min[2]);
      const scale = prop.scaleRange[0] + rand() * (prop.scaleRange[1] - prop.scaleRange[0]);
      setDressing.push({ propId: prop.propId, position: [x, 0, z], scale, feetOffset: prop.feetOffset });
    }
  }

  return { shots, blocking, setDressing, worldState: { glowSpanSeconds: input.duration } };
}
