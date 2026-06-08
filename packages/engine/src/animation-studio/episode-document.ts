/**
 * episode-document.ts — the Episode Document schema + deterministic sampling.
 *
 * This is the data-driven contract that makes the animation renderer GENERIC: every
 * scene-specific decision that used to be a constant in `render-live-route.ts`
 * (blocking marks, camera framing, the clip per shot, prop layout, the dim→sparkle
 * world-state, even the primitive set + lights) is now DATA in an EpisodeDocument.
 * The generic player (`scene-player.ts`) reads this document and renders it; it
 * contains no scene-specific constants. A Director GENERATES documents
 * from a prompt; the same player plays them.
 *
 * Placement note: this lives in the template for fast iteration (no engine dist
 * rebuild). The design doc promotes these contracts into
 * `packages/engine/src/animation-studio/*` once stable.
 */

import type { CameraPresetId } from "../agent-api/CameraPresetLibrary";

export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
/** Provenance for a catalog-resolved asset (CC-BY attribution + source + hash). */
export interface AssetProvenance {
  readonly attribution?: string;
  readonly license?: string;
  readonly sourceUrl?: string;
  readonly hash?: string;
}

export interface CharacterAsset extends AssetProvenance {
  readonly id: string;
  readonly url: string;
  /** Uniform scale applied to the loaded GLB so it reads at the intended height. */
  readonly scale: number;
  /** Fallback clip name (resolved against the GLB's real clip list by the player). */
  readonly defaultClip: string;
  /** Morph-target index that drives mouth-open, or -1 when the GLB has no face morph. */
  readonly mouthMorphIndex?: number;
}

export interface PropAsset extends AssetProvenance {
  readonly id: string;
  readonly url: string;
}

// ---------------------------------------------------------------------------
// Set (primitive pieces + lights + environment) — also data, so the player is generic.
// ---------------------------------------------------------------------------
export type GeometryKind = "cube" | "sphere" | "cylinder";

/** Dim→full emissive strengths a glow piece ramps between as the world-state advances. */
export interface GlowSpec {
  readonly dim: number;
  readonly full: number;
}

export interface SetPiece {
  readonly id: string;
  readonly geometry: GeometryKind;
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly baseColor: Vec4;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly emissiveColor?: Vec3;
  readonly emissiveStrength?: number;
  /** When present, the world-state drives emissiveStrength from dim→full over the act. */
  readonly glow?: GlowSpec;
  /** Optional z-roll (radians) for tilted props like the broom handle. */
  readonly roll?: number;
  readonly includeInAutoFrame?: boolean;
}

export interface LightSpec {
  readonly id: string;
  readonly kind: "point";
  readonly color: Vec3;
  readonly position: Vec3;
  readonly intensity: number;
  readonly range: number;
}

export interface EnvironmentSpec {
  readonly color: Vec3;
  readonly intensity: number;
  readonly proceduralMap: {
    readonly skyColor: Vec3;
    readonly horizonColor: Vec3;
    readonly groundColor: Vec3;
    readonly specularColor: Vec3;
    readonly intensity: number;
    readonly specularIntensity: number;
  };
}

export interface SetSpec {
  readonly clearColor: Vec4;
  /** Scale on the studio softbox rig (the directional key/fill/rim come from `lights`). */
  readonly studioLightingScale: number;
  readonly environment: EnvironmentSpec;
  readonly pieces: readonly SetPiece[];
  readonly lights: readonly LightSpec[];
  /**
   * High-fidelity rendering toggles (#12). Default OFF so the standard render
   * path stays stable; the Director or scene tools can opt a document in.
   *  - inShaderCel: non-glow set pieces use the engine's REAL AnimationToonMaterial
   *    (GPU-side banded N·L + Fresnel rim), in addition to the CPU toon post-pass.
   *  - realShadows: enable the studio rig's shadow maps (cast/receive) instead of only
   *    the cheap contact-shadow blobs.
   */
  readonly inShaderCel?: boolean;
  readonly realShadows?: boolean;
}

// ---------------------------------------------------------------------------
// Shots + camera
// ---------------------------------------------------------------------------
export interface ShotSpec {
  readonly shotId: string;
  readonly presetId: CameraPresetId;
  /** Episode-time window (seconds) this shot is on screen. */
  readonly startTime: number;
  readonly endTime: number;
  /** World point the camera frames for this shot (auto-framed or directed). */
  readonly cameraSubject: Vec3;
}

// ---------------------------------------------------------------------------
// Blocking (per character, per shot waypoint paths) + performance (clip per beat)
// ---------------------------------------------------------------------------
export interface BlockingWaypoint {
  /** Absolute episode time (seconds). */
  readonly time: number;
  readonly position: Vec3;
  readonly yaw: number;
}

export interface ShotBlocking {
  readonly shotId: string;
  /** Clip to play during this beat (resolved against the GLB's real clips by the player). */
  readonly clip: string;
  readonly sweeping?: boolean;
  /** 1+ waypoints; the player lerps position/yaw across them within the shot window. */
  readonly waypoints: readonly BlockingWaypoint[];
}

export interface CharacterBlocking {
  readonly characterId: string;
  readonly shots: readonly ShotBlocking[];
}

// ---------------------------------------------------------------------------
// Set dressing (prop instances) + world-state
// ---------------------------------------------------------------------------
export interface PropPlacement {
  readonly propId: string;
  readonly position: Vec3;
  readonly scale: number;
  /** |minY| of the prop geometry (pre-scale) so it sits on the ground (y=0). */
  readonly feetOffset: number;
}

export interface WorldStateTrack {
  /** Seconds over which glow pieces ramp dim→full (the dim→sparkle world-state). */
  readonly glowSpanSeconds: number;
}

// ---------------------------------------------------------------------------
// Dialogue (the script — also the AuraVoice contract). Lives IN the document so a
// generated/edited scene carries its own captions/lip-sync, not the Moon Garden's.
// ---------------------------------------------------------------------------
export interface DialogueLine {
  readonly lineId: string;
  readonly speakerId: string;
  readonly text: string;
  readonly startTime: number;
  readonly endTime: number;
}

export interface DialogueTrack {
  readonly language: string;
  readonly lines: readonly DialogueLine[];
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------
export interface EpisodeDocument {
  readonly id: string;
  readonly duration: number;
  readonly assets: {
    readonly characters: readonly CharacterAsset[];
    readonly props: readonly PropAsset[];
  };
  readonly set: SetSpec;
  /** Area characters + props must stay within (used by the Director + coherence gate). */
  readonly walkableBounds?: { readonly min: Vec3; readonly max: Vec3 };
  readonly shots: readonly ShotSpec[];
  readonly blocking: readonly CharacterBlocking[];
  readonly setDressing: readonly PropPlacement[];
  readonly worldState: WorldStateTrack;
  /** The script + captions + lip-sync source — the AuraVoice contract for THIS scene. */
  readonly dialogue?: DialogueTrack;
}

// ---------------------------------------------------------------------------
// Deterministic sampling — the generic player calls only these.
// ---------------------------------------------------------------------------
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Smoothstep eased 0..1 (matches the original setGardenGlow curve). */
function smoothstep(x: number): number {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

/** The shot on screen at episode time `t`. */
export function shotAtTime(doc: EpisodeDocument, t: number): ShotSpec {
  let chosen = doc.shots[0]!;
  for (const shot of doc.shots) {
    if (t >= shot.startTime) chosen = shot;
  }
  return chosen;
}

export interface SampledBlocking {
  readonly position: Vec3;
  readonly yaw: number;
  readonly clip: string;
  readonly sweeping: boolean;
  /** True when the character is translating between distinct waypoints (→ walk clip). */
  readonly moving: boolean;
}

/**
 * Sample a character's blocking at episode time `t`: find the active shot's blocking,
 * then lerp position/yaw across its waypoints by time. Single-waypoint beats hold a
 * static mark (the original staging behaviour); multi-waypoint beats traverse.
 */
export function sampleBlocking(
  doc: EpisodeDocument,
  characterId: string,
  t: number,
  fallback: { readonly position: Vec3; readonly yaw: number; readonly clip: string }
): SampledBlocking {
  const shot = shotAtTime(doc, t);
  const charBlocking = doc.blocking.find((b) => b.characterId === characterId);
  const beat = charBlocking?.shots.find((s) => s.shotId === shot.shotId);
  if (!beat || beat.waypoints.length === 0) {
    return { position: fallback.position, yaw: fallback.yaw, clip: fallback.clip, sweeping: false, moving: false };
  }
  const wps = beat.waypoints;
  if (wps.length === 1) {
    return { position: wps[0]!.position, yaw: wps[0]!.yaw, clip: beat.clip, sweeping: Boolean(beat.sweeping), moving: false };
  }
  // Find the waypoint segment containing t.
  let a = wps[0]!;
  let b = wps[wps.length - 1]!;
  for (let i = 0; i < wps.length - 1; i += 1) {
    if (t >= wps[i]!.time && t <= wps[i + 1]!.time) {
      a = wps[i]!;
      b = wps[i + 1]!;
      break;
    }
  }
  const span = Math.max(1e-3, b.time - a.time);
  const f = clamp01((t - a.time) / span);
  const lerp = (x: number, y: number): number => x + (y - x) * f;
  const moved =
    Math.hypot(b.position[0] - a.position[0], b.position[2] - a.position[2]) > 0.02 && f > 0 && f < 1;
  return {
    position: [lerp(a.position[0], b.position[0]), lerp(a.position[1], b.position[1]), lerp(a.position[2], b.position[2])],
    yaw: lerp(a.yaw, b.yaw),
    clip: beat.clip,
    sweeping: Boolean(beat.sweeping),
    moving: moved
  };
}

/** Eased dim→sparkle world-state at episode time `t` (0 = dim, 1 = full twinkle). */
export function sampleWorldStateGlow(doc: EpisodeDocument, t: number): number {
  return smoothstep(t / Math.max(1e-3, doc.worldState.glowSpanSeconds));
}

/** The active caption at episode time `t`, from the document's dialogue. */
export function sampleCaption(doc: EpisodeDocument, t: number): { text: string; speakerId: string; lineId: string } {
  const line = doc.dialogue?.lines.find((l) => t >= l.startTime && t < l.endTime);
  return line ? { text: line.text, speakerId: line.speakerId, lineId: line.lineId } : { text: "", speakerId: "", lineId: "" };
}

/**
 * Lip-sync mouth-openness for `speakerId` at `t`, derived deterministically from the
 * document's dialogue (a speaking mouth pulse). Drives the GLB mouth morph for rigs that
 * have one; 0 when the speaker isn't talking. (The full per-phoneme viseme track is
 * AuraVoice's; this is the engine-side fallback driver.)
 */
export function sampleVisemeOpenness(doc: EpisodeDocument, t: number, speakerId: string): { mouthOpenness: number; visemeId: string } {
  const line = doc.dialogue?.lines.find((l) => l.speakerId === speakerId && t >= l.startTime && t < l.endTime);
  if (!line) return { mouthOpenness: 0, visemeId: "sil" };
  const open = Math.max(0, 0.5 + 0.32 * Math.sin((t - line.startTime) * 9));
  return { mouthOpenness: open, visemeId: open > 0.4 ? "ah" : "m" };
}

// ---------------------------------------------------------------------------
// Validation (minimal; extended by the animation-episode-validator).
// ---------------------------------------------------------------------------
export interface DocumentValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export function validateEpisodeDocumentShape(doc: EpisodeDocument): DocumentValidationResult {
  const errors: string[] = [];
  if (doc.duration <= 0) errors.push("duration must be > 0");
  if (doc.shots.length === 0) errors.push("at least one shot is required");
  if (doc.assets.characters.length === 0) errors.push("at least one character is required");
  // Shots cover the timeline contiguously from 0.
  const sorted = [...doc.shots].sort((x, y) => x.startTime - y.startTime);
  if (sorted[0] && sorted[0].startTime !== 0) errors.push("shots must start at t=0");
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (Math.abs(sorted[i]!.endTime - sorted[i + 1]!.startTime) > 1e-6) {
      errors.push(`shot gap/overlap between ${sorted[i]!.shotId} and ${sorted[i + 1]!.shotId}`);
    }
  }
  // Blocking references real characters/shots.
  const charIds = new Set(doc.assets.characters.map((c) => c.id));
  const shotIds = new Set(doc.shots.map((s) => s.shotId));
  for (const b of doc.blocking) {
    if (!charIds.has(b.characterId)) errors.push(`blocking references unknown character ${b.characterId}`);
    for (const s of b.shots) if (!shotIds.has(s.shotId)) errors.push(`blocking references unknown shot ${s.shotId}`);
  }
  // Set dressing references real props.
  const propIds = new Set(doc.assets.props.map((p) => p.id));
  for (const d of doc.setDressing) {
    if (!propIds.has(d.propId)) errors.push(`set dressing references unknown prop ${d.propId}`);
  }
  return { ok: errors.length === 0, errors };
}

/** One-line-per-fact summary of a document (for CLI output / agent grounding). */
export function summarizeDocument(doc: EpisodeDocument): string {
  return [
    `id=${doc.id} duration=${doc.duration}s`,
    `cast: ${doc.assets.characters.map((c) => c.id).join(", ")}`,
    `shots: ${doc.shots.map((s) => `${s.shotId}[${s.startTime}-${s.endTime}] ${s.presetId}`).join(", ")}`,
    `props placed: ${doc.setDressing.length}`,
    doc.walkableBounds
      ? `walkable: x[${doc.walkableBounds.min[0]}..${doc.walkableBounds.max[0]}] z[${doc.walkableBounds.min[2]}..${doc.walkableBounds.max[2]}]`
      : "walkable: (unbounded)"
  ].join("\n");
}
