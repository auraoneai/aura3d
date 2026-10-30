/**
 * GU47 AO-V1: the cyan player wake and the red rival wakes, drawn game-side. E-F's `effects.trail` records its target's world
 * position every frame; Apex Overdrive keeps the hero at a fixed z and scrolls the world past it, so an engine ribbon on the
 * hero has no length, and the sky-lane rivals are instances with no node to follow (handoff E-F: a trail `worldOffset`).
 *
 * Here wake points are world-anchored like the deck: a point dropped at the hero's thrusters keeps its world position, and the
 * frame loop draws it through the same camera-relative transform as the road, so it streams back past the camera at the run's
 * speed and bends with every lane change. A rival gets one straight streak behind its jet whose length is its own world speed
 * times the wake life. Both wakes are camera-facing additive strips, one instanced node each (2 draws), coloured from the
 * identity palette: cyan only for the player, red only for rivals. Night lifts them with the look row's tail gain (the red
 * tail-light rivers). Reduced motion halves the wake life (shorter streaks, PRD §6.3); Low keeps them (2 draws, no post).
 */
import type { material } from "@aura3d/engine";
import { APEX_PALETTE, hexToUnit } from "../art/look";

type CustomSpec = Parameters<typeof material.custom>[0];
type V3 = [number, number, number];

export interface ApexWakeOptions {
  /** Seconds a wake point lives (simulation time). */
  readonly life: number;
  /** Strip width at the head (m); the tail end narrows to `tailWidth`. */
  readonly headWidth: number;
  readonly tailWidth: number;
}

/** Twin thruster wakes, 12 segments each (24 instances, one node). */
export const APEX_PLAYER_WAKE = { life: 0.34, headWidth: 0.34, tailWidth: 0.05, segments: 12, nozzles: [[-0.42, 0.46, 2.45], [0.42, 0.46, 2.45]] as const } as const;
/** One streak per drawn rival (width in m; it fades to nothing at its far end); never longer than 14 m. */
export const APEX_RIVAL_WAKE = { life: 0.24, width: 0.4, maxLength: 14 } as const;
/** Below this speed (m/s) the player wake fades out; it is full from `full`. */
export const APEX_WAKE_SPEED = { fade: 12, full: 30 } as const;
export const APEX_WAKE_CAPACITY = APEX_PLAYER_WAKE.segments * APEX_PLAYER_WAKE.nozzles.length;

/** Wake life under reduced motion: half (PRD §6.3 "particle emission halves"). */
export function wakeLife(life: number, reducedMotion: boolean): number {
  return reducedMotion ? life * 0.5 : life;
}

interface WakeSample {
  x: number;
  y: number;
  z: number;
  t: number;
}

/**
 * One ribbon's history: world points dropped every `life / segments` seconds of simulation time, oldest first. A jump back in
 * time or a teleport (a new run) clears it.
 */
export class WakeTrail {
  private readonly samples: WakeSample[] = [];

  constructor(
    readonly life: number,
    readonly segments: number
  ) {}

  get length(): number {
    return this.samples.length;
  }

  clear(): void {
    this.samples.length = 0;
  }

  /** Offer the nozzle's world position at simulation time `t`; returns true when a point was dropped. */
  sample(x: number, y: number, z: number, t: number): boolean {
    const last = this.samples[this.samples.length - 1];
    if (last && (t < last.t || Math.abs(z - last.z) > 60 || Math.abs(x - last.x) > 30)) this.clear();
    const prev = this.samples[this.samples.length - 1];
    while (this.samples.length > 0 && t - this.samples[0]!.t > this.life) this.samples.shift();
    if (prev && t - prev.t < this.life / this.segments) return false;
    this.samples.push({ x, y, z, t });
    if (this.samples.length > this.segments) this.samples.shift();
    return true;
  }

  /**
   * Segments from the live head (the nozzle now) back through the dropped points, newest first: world centre, the vector from
   * the older end to the newer end, the strip width and strength at the segment's newer end.
   */
  segmentsFrom(head: V3, t: number, options: ApexWakeOptions, strength: number, out: WakeSegment[]): number {
    out.length = 0;
    if (strength <= 0.001) return 0;
    let newer: V3 = head;
    let newerAge = 0;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      const s = this.samples[i]!;
      const age = t - s.t;
      if (age > options.life) break;
      const dx = newer[0] - s.x;
      const dy = newer[1] - s.y;
      const dz = newer[2] - s.z;
      const length = Math.hypot(dx, dy, dz);
      if (length > 1e-3) {
        const k = newerAge / options.life;
        out.push({
          center: [(newer[0] + s.x) / 2, (newer[1] + s.y) / 2, (newer[2] + s.z) / 2],
          axis: [dx, dy, dz],
          length,
          width: options.headWidth + (options.tailWidth - options.headWidth) * k,
          strength: strength * (1 - k) * (1 - k)
        });
      }
      newer = [s.x, s.y, s.z];
      newerAge = age;
    }
    return out.length;
  }
}

export interface WakeSegment {
  readonly center: V3;
  /** From the older end to the newer end (world metres). */
  readonly axis: V3;
  readonly length: number;
  readonly width: number;
  /** 0..1 strip strength (carried in the instance's y scale). */
  readonly strength: number;
}

/** Player wake strength for the run's speed and mode: none off the run, fading in from 12 m/s. */
export function playerWakeStrength(speed: number, playing: boolean): number {
  if (!playing || !Number.isFinite(speed)) return 0;
  const t = (speed - APEX_WAKE_SPEED.fade) / (APEX_WAKE_SPEED.full - APEX_WAKE_SPEED.fade);
  return Math.min(1, Math.max(0, t));
}

/**
 * A rival's streak: from its jet (the tail end of the car along its travel) back along its path. `z` and `prevZ` are the
 * simulation's world z this step and the step before (read-only), `dt` the fixed step, `dir` > 0 for an oncoming rival.
 */
export function rivalWake(
  rival: { readonly x: number; readonly y: number; readonly z: number; readonly prevZ: number; readonly length: number; readonly dir: number },
  dt: number,
  life: number
): { readonly jet: V3; readonly far: V3; readonly length: number } | null {
  const speed = dt > 0 ? Math.abs(rival.z - rival.prevZ) / dt : 0;
  const length = Math.min(APEX_RIVAL_WAKE.maxLength, speed * life);
  if (!(length > 0.25)) return null;
  const travel = rival.dir > 0 ? 1 : -1;
  const jetZ = rival.z - travel * (rival.length / 2);
  return { jet: [rival.x, rival.y, jetZ], far: [rival.x, rival.y, jetZ - travel * length], length };
}

/**
 * Euler angles that turn the strip's local +z onto `axis` (yaw about y, then pitch about x; roll 0). Exact for the engine's
 * YXZ node order used by the vehicle offsets, and first-order exact for any order at the small angles a wake segment has.
 */
export function stripRotation(axis: V3): [number, number, number] {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const yaw = Math.atan2(axis[0], axis[2]);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, axis[1] / len)));
  return [pitch, yaw, 0];
}

const VERTEX = /* glsl */ `
out float vAlong;
out float vAcross;
out float vStrength;
out float vDist;
void main() {
  // the unit XZ plane: x across the strip, z along it (+0.5 = the newer end / the jet)
  mat4 m = modelMatrix * instanceMatrix;
  vec3 center = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 axis = mat3(modelMatrix) * instanceMatrix[2].xyz;
  float width = length(instanceMatrix[0].xyz);
  vStrength = length(instanceMatrix[1].xyz);
  vec3 p = center + axis * position.z;
  vec3 side = cross(axis, cameraPosition - p);
  float sl = length(side);
  side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
  p += side * position.x * width;
  vAlong = position.z + 0.5;
  vAcross = position.x * 2.0;
  vDist = length(cameraPosition - p);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <colorspace_decode>
in float vAlong;
in float vAcross;
in float vStrength;
in float vDist;
out vec4 outColor;
void main() {
  float edge = a3dSaturate(1.0 - vAcross * vAcross);
  float body = edge * edge;
  float core = pow(edge, 10.0);
  float along = mix(1.0 - wakeTaper, 1.0, vAlong);
  float fade = 1.0 - smoothstep(wakeFade.x, wakeFade.y, vDist);
  float a = a3dSaturate(vStrength) * body * along * fade;
  vec3 col = a3dSrgbToLinear(wakeColor) * wakeIntensity + vec3(1.0) * core * wakeCore;
  outColor = vec4(a3dFinite(col), a);
}`;

/**
 * The additive strip material. `taper` fades each instance toward its older end (1 = to zero: a rival streak; small: the
 * player's segments, whose strength already falls per segment); `fade` is the camera distance band (m) it fades out over.
 */
export function wakeSpec(color: string, taper: number, fade: readonly [number, number]): CustomSpec {
  return {
    glsl: { vertex: VERTEX, fragment: FRAGMENT },
    uniforms: {
      wakeColor: { type: "vec3", value: hexToUnit(color) },
      wakeIntensity: { type: "f32", value: 1.6 },
      wakeCore: { type: "f32", value: 0.35 },
      wakeTaper: { type: "f32", value: taper },
      wakeFade: { type: "vec2", value: [fade[0], fade[1]] }
    },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    side: "double"
  };
}

export const PLAYER_WAKE_COLOR = APEX_PALETTE.cyan;
export const RIVAL_WAKE_COLOR = APEX_PALETTE.rival;

/** Strip brightness per look row: the tail gain (1 sunset, 1.35 dusk, 1.7 night) lifts the rivers toward night. */
export function wakeIntensity(tailGain: number): number {
  return Math.round(1.6 * Math.max(0.5, tailGain) * 1000) / 1000;
}
