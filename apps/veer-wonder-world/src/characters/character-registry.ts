// Wonder World character registry (PRD 04 D07, PRD 02 section 2).
//
// Each character id maps to its typed model key, a display-name string key, a
// colour, a height and a voice, plus the permitted animation list. A gesture
// plays a clip only when MODEL_INFO lists that exact clip name for the
// admitted GLB. In this build no model is rigged (the Meshy humanoid rig was
// tried on Lulu and rejected, MASTER-PROMPT section 3.6), so every character
// moves procedurally (hop, squash-stretch, wag, bob, roll, float); Momo's and
// Lulu's clip names stay as candidates for a later rig that passes
// `aura3d assets validate --skin`. "Talking" is a gentle squash/bob pulse
// while the line plays; it is never lip sync.

import { MODEL_INFO, type ModelInfo, type ModelKey } from "../aura-assets.js";
import type { CharacterId, Gesture, MoveStyle, SpeakerId } from "../types.js";
import { gestureMotion, proc, type GestureMotionSpec, type Vec3 } from "../scenes/motion.js";
import { GOGO } from "./gogo.js";
import { LULU } from "./lulu.js";
import { LUMI } from "./lumi.js";
import { MOMO } from "./momo.js";
import { PEEKO } from "./peeko.js";
import { SHERU } from "./sheru.js";

/** What a character file declares. Clip names are candidates; only clips MODEL_INFO lists are ever played. */
export interface CharacterDefinition {
  readonly id: CharacterId;
  readonly modelKey: ModelKey;
  /** UI string key for the character's name, defined in the locale's UI strings (for example `ui.speaker.momo`). */
  readonly displayNameKey: string;
  /** Main colour (stand-in body, menu accents). */
  readonly color: string;
  readonly voice: SpeakerId;
  /** False for Sheru, who only barks (sound effect "woof"). */
  readonly speaks: boolean;
  /** Preferred clip names per gesture, best first. */
  readonly clipCandidates: Partial<Readonly<Record<Gesture, readonly string[]>>>;
  /** Preferred clip names while travelling in a style, best first. */
  readonly locomotionClips: Partial<Readonly<Record<MoveStyle, readonly string[]>>>;
  /** Procedural motion per gesture; gestures not listed use SHARED_GESTURES. */
  readonly gestures: Partial<Readonly<Record<Gesture, GestureMotionSpec>>>;
  /** Secondary idle loop (breathing or floating); null for none. Dropped in reduced motion. */
  readonly idleMotion: GestureMotionSpec | null;
  /** Talking pulse strength (fraction of height). */
  readonly talkStrength: number;
  /** Where a carried item rides, in units of the height, in the character's own frame (+Z is its front). */
  readonly carryOffset: Vec3;
  readonly defaultStyle: MoveStyle;
}

export interface CharacterProfile {
  readonly id: CharacterId;
  readonly modelKey: ModelKey;
  readonly displayNameKey: string;
  readonly color: string;
  /** Height in metres the model is fitted to (MODEL_INFO). */
  readonly heightM: number;
  readonly voice: SpeakerId;
  readonly speaks: boolean;
  /** The admitted GLB carries a skeleton and at least one listed clip. */
  readonly rigged: boolean;
  /** The permitted animation list: exactly the clip names MODEL_INFO lists for the admitted GLB. */
  readonly clips: readonly string[];
  /** The clip that plays a gesture, or null when MODEL_INFO lists none of its candidates. */
  gestureClip(gesture: Gesture): string | null;
  locomotionClip(style: MoveStyle): string | null;
  idleClip(): string | null;
  talkClip(): string | null;
  /** Procedural motion for a gesture (used whenever no clip plays it). */
  procedural(gesture: Gesture): GestureMotionSpec;
  idleMotion(): GestureMotionSpec | null;
  readonly talkStrength: number;
  readonly carryOffset: Vec3;
  readonly defaultStyle: MoveStyle;
}

export const GESTURES: readonly Gesture[] = [
  "idle", "wave", "talk", "point", "happy", "cheer", "dance", "hop", "nod", "look",
  "sleep", "eat", "wake", "sway", "mirror", "pickUp", "shrug", "wag", "sniff", "bark",
  "sit", "clap", "stomp", "freeze", "peek", "hide", "float", "glow", "blink", "bow", "surprise", "wait"
];

/**
 * Gentle default motion for every gesture (characters without an override, and props).
 * Calm toddler pacing: slow anticipation, small amplitudes, no snaps.
 */
export const SHARED_GESTURES: Readonly<Record<Gesture, GestureMotionSpec>> = {
  idle: gestureMotion([], { durationSec: 0.1 }),
  wave: gestureMotion([proc("rock", 1.8, 0.09, 2), proc("bob", 1.8, 0.03, 2)]),
  talk: gestureMotion([], { durationSec: 1.5 }),
  point: gestureMotion([proc("lean", 1.4, 0.16)]),
  happy: gestureMotion([proc("hop", 1.3, 0.16, 2)]),
  cheer: gestureMotion([proc("hop", 1.5, 0.2, 2), proc("rock", 1.5, 0.05, 2)]),
  dance: gestureMotion([proc("rock", 2.4, 0.14, 3), proc("bob", 2.4, 0.05, 4)]),
  hop: gestureMotion([proc("hop", 0.75, 0.2)]),
  nod: gestureMotion([proc("nod", 1.0, 0.16, 2)]),
  look: gestureMotion([proc("turn", 2.2, 0.45)]),
  sleep: gestureMotion([proc("duck", 2.0, 0.12)], { hold: true }),
  eat: gestureMotion([proc("chomp", 1.6, 0.1, 3)]),
  wake: gestureMotion([proc("stretch", 1.4, 0.12)]),
  sway: gestureMotion([proc("rock", 2.6, 0.1)]),
  mirror: gestureMotion([proc("turn", 2.0, 0.25, 2), proc("lean", 2.0, 0.06)]),
  pickUp: gestureMotion([proc("dip", 1.2, 0.16), proc("lean", 1.2, 0.25)]),
  shrug: gestureMotion([proc("squash", 0.9, 0.06), proc("rock", 0.9, 0.06)]),
  wag: gestureMotion([proc("wag", 1.2, 0.22, 3)]),
  sniff: gestureMotion([proc("lean", 1.4, 0.18), proc("bob", 1.4, 0.02, 4)]),
  bark: gestureMotion([proc("squash", 0.4, 0.08), proc("hop", 0.4, 0.06)]),
  sit: gestureMotion([proc("duck", 1.0, 0.16)], { hold: true }),
  clap: gestureMotion([proc("dip", 1.8, 0.06, 3)]),
  stomp: gestureMotion([proc("dip", 1.6, 0.1, 2), proc("hop", 1.6, 0.05, 2)]),
  freeze: gestureMotion([], { durationSec: 1.2, hold: true, still: true }),
  peek: gestureMotion([proc("peek", 1.6, 0.22)]),
  hide: gestureMotion([proc("duck", 0.9, 0.5)], { hold: true }),
  float: gestureMotion([proc("float", 2.6, 0.08)]),
  glow: gestureMotion([proc("pulse", 2.0, 0.05)], { halo: true }),
  blink: gestureMotion([proc("squash", 0.3, 0.06)]),
  bow: gestureMotion([proc("bow", 1.4, 0.38)]),
  // Surprised: a quick small stretch up and a little hop, then back (02 section 2 expression sheet).
  surprise: gestureMotion([proc("stretch", 0.8, 0.12), proc("hop", 0.8, 0.06)]),
  // Waiting: lean in a little toward the child and hold still, attentive (01 section 3.1: wait, do not ask again).
  wait: gestureMotion([proc("lean", 1.0, 0.1)], { hold: true })
};

/** Gentle breathing for characters at rest. */
export const BREATHING_IDLE: GestureMotionSpec = gestureMotion([proc("pulse", 3.0, 0.012)]);

/** Thrown when code asks a character for a clip its admitted GLB does not list. */
export class MissingClipError extends Error {
  readonly character: CharacterId;
  readonly clip: string;

  constructor(character: CharacterId, clip: string, available: readonly string[]) {
    super(`Wonder World: "${character}" has no clip "${clip}" (listed clips: ${available.length > 0 ? available.join(", ") : "none"}). Use profile.gestureClip(g) or the procedural fallback.`);
    this.name = "MissingClipError";
    this.character = character;
    this.clip = clip;
  }
}

/** Builds a profile from a definition and the generated model info. Pure: pass any ModelInfo in tests. */
export function createCharacterProfile(def: CharacterDefinition, info: ModelInfo): CharacterProfile {
  const clips: readonly string[] = info.admitted ? [...info.clips] : [];
  const first = (candidates: readonly string[] | undefined): string | null => {
    if (!candidates) return null;
    for (const name of candidates) if (clips.includes(name)) return name;
    return null;
  };
  return {
    id: def.id,
    modelKey: def.modelKey,
    displayNameKey: def.displayNameKey,
    color: def.color,
    heightM: info.heightM,
    voice: def.voice,
    speaks: def.speaks,
    rigged: info.admitted && clips.length > 0,
    clips,
    gestureClip: (gesture) => first(def.clipCandidates[gesture]),
    locomotionClip: (style) => first(def.locomotionClips[style]),
    idleClip: () => first(def.clipCandidates.idle ?? ["idle"]),
    talkClip: () => first(def.clipCandidates.talk ?? ["talk"]),
    procedural: (gesture) => def.gestures[gesture] ?? SHARED_GESTURES[gesture],
    idleMotion: () => def.idleMotion,
    talkStrength: def.talkStrength,
    carryOffset: def.carryOffset,
    defaultStyle: def.defaultStyle
  };
}

export const CHARACTER_DEFINITIONS: Readonly<Record<CharacterId, CharacterDefinition>> = {
  momo: MOMO,
  lulu: LULU,
  sheru: SHERU,
  gogo: GOGO,
  lumi: LUMI,
  peeko: PEEKO
};

export const CHARACTER_IDS: readonly CharacterId[] = ["momo", "lulu", "sheru", "gogo", "lumi", "peeko"];

export const CHARACTERS: Readonly<Record<CharacterId, CharacterProfile>> = {
  momo: createCharacterProfile(MOMO, MODEL_INFO[MOMO.modelKey]),
  lulu: createCharacterProfile(LULU, MODEL_INFO[LULU.modelKey]),
  sheru: createCharacterProfile(SHERU, MODEL_INFO[SHERU.modelKey]),
  gogo: createCharacterProfile(GOGO, MODEL_INFO[GOGO.modelKey]),
  lumi: createCharacterProfile(LUMI, MODEL_INFO[LUMI.modelKey]),
  peeko: createCharacterProfile(PEEKO, MODEL_INFO[PEEKO.modelKey])
};

export function isCharacterId(value: string): value is CharacterId {
  return (CHARACTER_IDS as readonly string[]).includes(value);
}

export function characterProfile(id: CharacterId): CharacterProfile {
  return CHARACTERS[id];
}

/** The on-screen character who voices a speaker, or null for the narrator and the robot. */
export function profileForSpeaker(speaker: SpeakerId): CharacterProfile | null {
  return isCharacterId(speaker) ? CHARACTERS[speaker] : null;
}

/** The permitted animation list for a character. */
export function permittedClips(profile: CharacterProfile): readonly string[] {
  return profile.clips;
}

/** Throws MissingClipError unless the clip is in the permitted list. */
export function assertClip(profile: CharacterProfile, clip: string): string {
  if (!profile.clips.includes(clip)) throw new MissingClipError(profile.id, clip, profile.clips);
  return clip;
}

/** For each gesture: the clip that plays it, or null when procedural motion stands in. */
export function clipCoverage(profile: CharacterProfile): ReadonlyArray<{ readonly gesture: Gesture; readonly clip: string | null }> {
  return GESTURES.map((gesture) => ({ gesture, clip: profile.gestureClip(gesture) }));
}

/** Candidate clips a definition names that the admitted GLB does not list (for diagnostics and tests). */
export function missingClipCandidates(def: CharacterDefinition, info: ModelInfo): readonly string[] {
  const listed = new Set(info.admitted ? info.clips : []);
  const wanted = new Set<string>();
  for (const names of Object.values(def.clipCandidates)) for (const name of names ?? []) wanted.add(name);
  for (const names of Object.values(def.locomotionClips)) for (const name of names ?? []) wanted.add(name);
  return [...wanted].filter((name) => !listed.has(name)).sort();
}
