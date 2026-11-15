// Sightlines: no character or prop may hide what the current line is about.
//
// A beat's subjects are the nodes its line names (`words`), counts (every counted object of the story's
// `numberConcept` once a count word is spoken), points at (`face` targets) or asks the child to tap (`input`
// targets). `sightViolations` measures, for the camera preset the beat uses and for both a 16:9 desktop and a
// 390x844 phone screen, how much of each subject nearer nodes hide; `resolveSightlines` then moves cast members
// who are not subjects (hosts and companions) to the nearest spot where they hide nothing, preferring spots that
// keep them in frame and walks that never pass in front of a subject. Everything here is pure and deterministic,
// so renders and QA runs see the same staging. A beat marked `deliberateHiding` (peekaboo, hiding behind a door
// or a bush) skips all of it.

import type { BeatSpec, CameraPresetId, SpotId, StageAction, StorySpec } from "../types.js";
import { COUNT_WORD_IDS } from "../content/numbers.js";
import { applyRoundVariant } from "../runtime/beat-runner.js";
import {
  HIGH_SPOTS,
  ON_STAGE_SPOTS,
  OFF_STAGE_SPOTS,
  SPOTS,
  fitPoseForSubjects,
  frameCamera,
  isInFrame,
  placeAtSpot,
  sightlineCoverage,
  silhouetteOverlap,
  type CameraPose,
  type LayoutRole,
  type Occupant,
  type SightNode,
  type Vec3
} from "./spots.js";

/** A subject must keep at least 90% of its silhouette visible. */
export const SUBJECT_MAX_COVERED = 0.1;
/** Members of a counted set may overlap each other by at most 10%. */
export const COUNTED_MAX_OVERLAP = 0.1;
/** A featured character faces the camera within this angle (radians, ~60 degrees). */
export const FACE_MAX_RAD = (60 * Math.PI) / 180;
/** The stage turns a character at most this far from the camera, so it stays inside `FACE_MAX_RAD` on every screen. */
export const FACE_CLAMP_RAD = (50 * Math.PI) / 180;
/** Screens every staging decision is checked on: a 16:9 desktop and a 390x844 phone. */
export const SIGHT_ASPECTS: readonly { readonly name: "desktop" | "phone"; readonly aspect: number }[] = [
  { name: "desktop", aspect: 16 / 9 },
  { name: "phone", aspect: 390 / 844 }
];

export interface BeatFocus {
  /** Nodes the beat is about: named, counted, pointed at or tap targets. */
  readonly subjects: readonly string[];
  /** The counted set (all members must be visible at once and not overlap each other). */
  readonly counted: readonly string[];
  /** Peekaboo / hiding beats: sightline rules are off for this beat. */
  readonly deliberateHiding: boolean;
}

export const NO_FOCUS: BeatFocus = { subjects: [], counted: [], deliberateHiding: false };

function faceTargets(actions: readonly StageAction[] | undefined): string[] {
  const out: string[] = [];
  for (const a of actions ?? []) if (a.do === "face" && a.toward !== "viewer") out.push(a.toward);
  return out;
}

/** What a beat is about (pure). */
export function beatFocus(story: Pick<StorySpec, "numberConcept">, beat: BeatSpec): BeatFocus {
  if (beat.deliberateHiding === true) return { subjects: [], counted: [], deliberateHiding: true };
  const subjects = new Set<string>();
  for (const w of beat.words ?? []) subjects.add(w.objectId);
  if (beat.input && (beat.input.type === "tap" || beat.input.type === "more-or-done")) for (const t of beat.input.targets) subjects.add(t);
  for (const id of faceTargets(beat.stage)) subjects.add(id);
  for (const id of faceTargets(beat.reducedMotionStage)) subjects.add(id);
  for (const id of faceTargets(beat.response?.stage)) subjects.add(id);
  for (const branch of Object.values(beat.responseByTarget ?? {})) for (const id of faceTargets(branch?.stage)) subjects.add(id);
  const countWords: ReadonlySet<string> = new Set(COUNT_WORD_IDS);
  const counts = (beat.words ?? []).some((w) => countWords.has(w.wordId));
  const counted = counts ? [...(story.numberConcept?.countedObjectIds ?? [])] : [];
  for (const id of counted) subjects.add(id);
  return { subjects: [...subjects].sort(), counted: counted.sort(), deliberateHiding: false };
}

/** The beat a director snapshot is playing (round variants applied), or null. */
export function beatForSnapshot(story: StorySpec, beatId: string | null, round: number): BeatSpec | null {
  if (beatId === null) return null;
  if (story.kind === "episode") return story.beats.find((b) => b.id === beatId) ?? null;
  const roundIndex = story.round.findIndex((b) => b.id === beatId);
  if (roundIndex >= 0) {
    const base = story.round[roundIndex]!;
    return round >= 1 ? applyRoundVariant(base, story.roundVariants?.[round - 1], roundIndex) : base;
  }
  return story.intro.find((b) => b.id === beatId) ?? story.outro.find((b) => b.id === beatId) ?? null;
}

/** Focus for whatever a director snapshot is playing (no beat: no focus). */
export function focusForSnapshot(story: StorySpec, snapshot: { readonly beatId: string | null; readonly round: number }): BeatFocus {
  const beat = beatForSnapshot(story, snapshot.beatId, snapshot.round);
  return beat ? beatFocus(story, beat) : NO_FOCUS;
}

/** True when a point stands at (or beyond) an off-stage spot: waiting in the wings, not part of the picture. */
export function isOffStagePosition(position: Vec3): boolean {
  const xs = OFF_STAGE_SPOTS.map((id) => Math.abs(SPOTS[id][0])).filter((x) => x > 0);
  const edge = Math.min(...xs) - 0.4;
  return Math.abs(position[0]) >= edge || position[1] > 3.2 || position[1] < -1;
}

/**
 * The camera for a beat on one screen: the preset fitted to the aspect, pulled back just enough that every on-stage
 * subject is fully in frame. The stage draws with this pose and the rules judge with it.
 */
export function subjectFramedPose(
  nodes: readonly SightState[],
  focus: BeatFocus,
  preset: CameraPresetId,
  aspect: number,
  poseFor: (preset: CameraPresetId, aspect: number) => CameraPose = frameCamera
): CameraPose {
  const pose = poseFor(preset, aspect);
  if (focus.deliberateHiding || focus.subjects.length === 0) return pose;
  const wanted = new Set(focus.subjects);
  const inShot = nodes.filter(
    (n) => n.visible && (wanted.has(n.id) || n.keepInShot === true) && n.leaving !== true && !isOffStagePosition(n.position)
  );
  const subjects = inShot.filter((n) => wanted.has(n.id));
  if (subjects.length === 0) return pose;
  // Keep the friends in shot when the camera can; never at the cost of a subject.
  const withFriends = fitPoseForSubjects(pose, inShot, aspect);
  if ([...sightlineCoverage(subjects, withFriends, aspect).values()].every((c) => c.framed >= 1 - 1e-9)) return withFriends;
  return fitPoseForSubjects(pose, subjects, aspect);
}

/** A node as the sightline rules see it. */
export interface SightState extends SightNode {
  readonly visible: boolean;
  /** Nodes this one never counts as hiding (what it rests on, rides in or carries, and the reverse). */
  readonly attachedTo?: readonly string[];
  /** Hides nothing (an open door or barn: you see through the doorway). */
  readonly seeThrough?: boolean;
  /** Who carries it (a wand in Momo's paw): when it is in the way, the carrier steps aside. */
  readonly carriedBy?: string | null;
  /** Heading off stage (an exit, or a carriage the train pulls away): no longer part of the picture. */
  readonly leaving?: boolean;
  /** A character on stage: the camera fit keeps it in shot too, so framing a subject never loses a friend. */
  readonly keepInShot?: boolean;
}

export interface SightViolation {
  readonly kind: "covered" | "counted-overlap" | "out-of-frame";
  readonly subject: string;
  readonly by: string;
  /** Every node hiding part of the subject (covered) or the other member (counted overlap). */
  readonly hiders: readonly string[];
  /** Fraction hidden (covered) or shared (counted overlap). */
  readonly amount: number;
  readonly screen: "desktop" | "phone";
}

function attachedPair(a: SightState | undefined, b: SightState | undefined): boolean {
  if (!a || !b) return false;
  return (a.attachedTo ?? []).includes(b.id) || (b.attachedTo ?? []).includes(a.id);
}

/** Every sightline rule a staging breaks for one camera preset, across both screens. Pure. */
export function sightViolations(
  nodes: readonly SightState[],
  focus: BeatFocus,
  preset: CameraPresetId,
  poseFor: (preset: CameraPresetId, aspect: number) => CameraPose = frameCamera
): SightViolation[] {
  if (focus.deliberateHiding || focus.subjects.length === 0) return [];
  const shown = nodes.filter((n) => n.visible);
  const byId = new Map(shown.map((n) => [n.id, n]));
  const subjects = focus.subjects.filter((id) => byId.has(id));
  if (subjects.length === 0) return [];
  const out: SightViolation[] = [];
  for (const { name, aspect } of SIGHT_ASPECTS) {
    const pose = subjectFramedPose(shown, focus, preset, aspect, poseFor);
    // What rests on a subject still hides it when it is a character standing there (Momo on the cushion the line asks
    // about); props stacked on or riding a subject (a sheep's cloud, a teddy in the car) do not.
    const restsOnSubject = (subject: string, other: string): boolean => {
      const o = byId.get(other);
      const sub = byId.get(subject);
      return (
        o !== undefined &&
        o.keepInShot === true &&
        (o.attachedTo ?? []).includes(subject) &&
        o.carriedBy !== subject &&
        sub?.carriedBy !== other &&
        o.position[1] > (sub?.position[1] ?? 0) + 0.05
      );
    };
    const coverage = sightlineCoverage(
      shown,
      pose,
      aspect,
      (s, o) => byId.get(o)?.seeThrough === true || (attachedPair(byId.get(s), byId.get(o)) && !restsOnSubject(s, o))
    );
    for (const id of subjects) {
      const c = coverage.get(id);
      if (!c) continue;
      // A subject cut off by the screen edge is as lost as one behind a host (rule 1 counts the frame too).
      const node = byId.get(id)!;
      if (1 - c.framed > SUBJECT_MAX_COVERED && node.leaving !== true && !isOffStagePosition(node.position)) {
        out.push({ kind: "out-of-frame", subject: id, by: "screen edge", hiders: [], amount: 1 - c.framed, screen: name });
        continue;
      }
      if (c.covered <= SUBJECT_MAX_COVERED) continue;
      const worst = c.by[0];
      out.push({ kind: "covered", subject: id, by: worst?.id ?? "?", hiders: c.by.map((b) => b.id), amount: c.covered, screen: name });
    }
    const counted = focus.counted.filter((id) => byId.has(id));
    for (let i = 0; i < counted.length; i += 1) {
      for (let j = i + 1; j < counted.length; j += 1) {
        const a = byId.get(counted[i]!)!;
        const b = byId.get(counted[j]!)!;
        if (attachedPair(a, b)) continue; // a stacked tower: one rests on the other
        const overlap = Math.max(silhouetteOverlap(a, b, pose, aspect), silhouetteOverlap(b, a, pose, aspect));
        if (overlap > COUNTED_MAX_OVERLAP) out.push({ kind: "counted-overlap", subject: a.id, by: b.id, hiders: [b.id], amount: overlap, screen: name });
      }
    }
  }
  return out;
}

function excess(violations: readonly SightViolation[]): number {
  let total = 0;
  for (const v of violations) total += v.amount - (v.kind === "counted-overlap" ? COUNTED_MAX_OVERLAP : SUBJECT_MAX_COVERED);
  return total;
}

/** A cast member the resolver may move aside. */
export interface MovableActor {
  readonly id: string;
  readonly role: LayoutRole;
  readonly asset?: string;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly floats: boolean;
  /** Where it will stand once its current move (if any) ends. */
  readonly position: Vec3;
  /** A subject of the beat: it only steps aside when no host or companion can clear the view. */
  readonly subject?: boolean;
  /** Walking to a spot the beat chose: retargeting it is a last resort. */
  readonly authoredMove?: boolean;
}

export interface SightMove {
  readonly id: string;
  readonly to: SpotId;
  readonly position: Vec3;
}

export interface ResolveInput {
  readonly nodes: readonly SightState[];
  /** Cast members that are not subjects and are free to step aside, in a fixed order. */
  readonly movable: readonly MovableActor[];
  /** Everything `placeAtSpot` must avoid (visible, not carried), at its destination. */
  readonly occupants: readonly Occupant[];
  readonly focus: BeatFocus;
  readonly preset: CameraPresetId;
  readonly poseFor?: (preset: CameraPresetId, aspect: number) => CameraPose;
}

const PATH_SAMPLES = 6;

/**
 * Moves hosts and companions out of the way of the beat's subjects. Each blocking, movable cast member tries every
 * on-stage spot of its kind (ground or high); the winner removes the most hidden area, then keeps the mover in frame
 * on both screens, then never walks in front of a subject on the way, then is the shortest walk (spot order breaks
 * ties). Returns no moves when nothing is hidden or no spot helps. Pure and deterministic.
 */
export function resolveSightlines(input: ResolveInput): SightMove[] {
  const poseFor = input.poseFor ?? frameCamera;
  const moves: SightMove[] = [];
  let nodes = [...input.nodes];
  let occupants = [...input.occupants];
  for (let pass = 0; pass < 4; pass += 1) {
    const violations = sightViolations(nodes, input.focus, input.preset, poseFor);
    if (violations.length === 0) break;
    const carrierOf = new Map(nodes.map((n) => [n.id, n.carriedBy ?? null]));
    const hiders = new Set(violations.flatMap((v) => v.hiders.map((h) => carrierOf.get(h) ?? h)));
    const hidden = new Set(violations.map((v) => v.subject));
    const free = input.movable.filter((m) => !moves.some((mv) => mv.id === m.id));
    // Hosts and companions in the way step aside first; only when none can, a hidden subject (or a subject in
    // front of another) steps to a spot where it hides nothing and is not hidden.
    const hosts = free.filter((m) => m.subject !== true && hiders.has(m.id));
    const subjectMovers = free.filter((m) => m.subject === true && (hiders.has(m.id) || hidden.has(m.id)));
    const before = excess(violations);
    let best: { readonly score: readonly number[]; readonly move: SightMove; readonly nodes: SightState[] } | null = null;
    for (const [tier, group] of [[0, hosts], [1, subjectMovers]] as const) {
      if (best) break;
      for (const mover of group) {
        const others = occupants.filter((o) => o.id !== mover.id);
        const spots = ON_STAGE_SPOTS.filter((sp) => (mover.floats ? HIGH_SPOTS.includes(sp) : !HIGH_SPOTS.includes(sp)));
        for (const spot of spots) {
          const position = placeAtSpot(
            spot,
            { id: mover.id, role: mover.role, ...(mover.asset !== undefined ? { asset: mover.asset } : {}), width: mover.width, depth: mover.depth, height: mover.height, floats: mover.floats, from: mover.position },
            others
          );
          const walk = Math.hypot(position[0] - mover.position[0], position[2] - mover.position[2]);
          if (walk < 0.05) continue;
          const moved = nodes.map((n) => (n.id === mover.id ? { ...n, position } : n));
          const after = excess(sightViolations(moved, input.focus, input.preset, poseFor));
          if (after >= before - 1e-9) continue;
          // Prefer spots the beat's own camera already shows: a spot that needs the camera to pull back or slide
          // makes everyone smaller.
          const outOfFrame = SIGHT_ASPECTS.filter(({ aspect }) => {
            const pose = poseFor(input.preset, aspect);
            return !isInFrame([position[0], position[1] + mover.height * 0.6, position[2]], pose, aspect, 0.04);
          }).length;
          let crossings = 0;
          for (let i = 1; i < PATH_SAMPLES; i += 1) {
            const t = i / PATH_SAMPLES;
            const p: Vec3 = [
              mover.position[0] + (position[0] - mover.position[0]) * t,
              mover.position[1] + (position[1] - mover.position[1]) * t,
              mover.position[2] + (position[2] - mover.position[2]) * t
            ];
            const mid = nodes.map((n) => (n.id === mover.id ? { ...n, position: p } : n));
            if (sightViolations(mid, input.focus, input.preset, poseFor).some((v) => v.hiders.includes(mover.id))) crossings += 1;
          }
          const score = [Math.round(after * 1000), outOfFrame, tier, mover.authoredMove === true ? 1 : 0, crossings, Math.round(walk * 100)];
          if (!best || lexLess(score, best.score)) best = { score, move: { id: mover.id, to: spot, position }, nodes: moved };
        }
      }
    }
    if (!best) break;
    const chosen = best;
    moves.push(chosen.move);
    nodes = chosen.nodes;
    occupants = occupants.map((o) => (o.id === chosen.move.id ? { ...o, position: chosen.move.position } : o));
  }
  return moves;
}

function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]!;
  }
  return false;
}
