/**
 * Idol critter body animation (owner: "they're just sliding"). The Idol critters and the hawk are split into a body
 * plus pivoted part nodes (scripts/split-idol-critters.mjs -> src/game/critterParts.json): legs/feet, wings, arms,
 * ears, gills, tails and the turtle's neck. Every frame `critterPartPose` turns the hop state into local part
 * rotations, written to the model through `setAnimationPose` (pose bones are keyed by GLB node name):
 *   - anticipation: legs/feet crouch forward and wings/arms tuck before take-off (hop progress < 0.15)
 *   - push-off and air: legs kick back then reach forward for the landing, wings flap, arms swing up, ears and tails
 *     trail the rise, gills ripple
 *   - landing settle: a damped spring on every part for ~0.4 s after touch-down
 *   - idle between hops: slow breathing sway on wings/arms, ear twitches, tail wags, gill ripples, neck nods
 * The squash/stretch, pitch and yaw of the whole critter stay in core.ts (the `-tilt` group); this is render-only and
 * reads no simulation state beyond the hop clock it is handed.
 */
import partsJson from "./critterParts.json";

export type PartMotion = "leg" | "wing" | "arm" | "ear" | "tail" | "head" | "gill";
export interface CritterPart {
  readonly name: string;
  readonly motion: PartMotion;
  readonly parent: string | null;
  /** +1 left (+x), -1 right (-x), 0 centre. */
  readonly side: number;
  /** +1 front, -1 back (four-legged walkers), 0 otherwise. */
  readonly front: number;
  readonly pivot: readonly number[];
}
const PARTS = partsJson as unknown as Readonly<Record<string, { readonly height: number; readonly parts: readonly CritterPart[] }>>;

/** Parts of an Idol critter (or the hawk) by asset key; [] for a key with no split parts. */
export function critterParts(assetKey: string): readonly CritterPart[] {
  return PARTS[assetKey]?.parts ?? [];
}

export interface CritterMotionState {
  /** Hop progress 0..1 while `hopping`. */
  readonly t: number;
  readonly hopping: boolean;
  /** Seconds since the last landing, or < 0 before the first one. */
  readonly landSince: number;
  /** Render clock (s), for idle motion. */
  readonly time: number;
  readonly reducedMotion: boolean;
}

/** Euler angles (rad, applied Z·Y·X like the engine's setRotation) per part. */
export type PartAngles = Record<string, [number, number, number]>;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const x = clamp01(v); return x * x * (3 - 2 * x); };
/** Damped spring after landing: 1 at touch-down, oscillating to 0 over ~0.4 s. */
function settle(landSince: number): number {
  if (landSince < 0 || landSince > 0.6) return 0;
  return Math.exp(-landSince * 9) * Math.cos(landSince * 20);
}

/**
 * Leg pitch about the hip: + swings the foot back (push-off), - forward (crouch / reach).
 * 0..0.15 crouch, 0.15..0.55 push back, 0.55..1 reach forward for the landing; then a landing settle.
 */
function legPitch(s: CritterMotionState, phaseShift = 0): number {
  if (s.hopping) {
    const t = clamp01(s.t + phaseShift);
    if (t < 0.15) return -0.28 * smooth(t / 0.15);
    if (t < 0.55) return -0.28 * (1 - smooth((t - 0.15) / 0.12)) + 0.5 * Math.sin((Math.PI * (t - 0.15)) / 0.4);
    return -0.24 * Math.sin((Math.PI * (t - 0.55)) / 0.45);
  }
  return -0.24 * settle(s.landSince) + 0.025 * Math.sin(s.time * 2.1);
}

/** Wing roll (+ raises the tip): tuck during the crouch, flap in the air, a flutter on landing, a breath at idle. */
function wingRoll(s: CritterMotionState, gain: number): number {
  if (s.hopping) {
    if (s.t < 0.15) return -0.12 * gain * smooth(s.t / 0.15);
    return gain * (0.35 + 0.45 * Math.sin(2 * Math.PI * 2.5 * (s.t - 0.15)));
  }
  return gain * (0.3 * settle(s.landSince) + 0.06 * Math.sin(s.time * 2.6));
}

export function critterPartAngles(assetKey: string, s: CritterMotionState): PartAngles {
  const out: PartAngles = {};
  const k = s.reducedMotion ? 0.5 : 1;
  const rise = s.hopping ? Math.sin(Math.PI * clamp01(s.t)) : 0;
  for (const p of critterParts(assetKey)) {
    let rx = 0, ry = 0, rz = 0;
    switch (p.motion) {
      case "leg":
        if (p.front !== 0) {
          // four-legged paddle: diagonal pairs swing opposite ways
          const diag = p.front * p.side;
          rx = (s.hopping ? 0.42 * Math.sin(2 * Math.PI * clamp01(s.t)) * diag : 0) - 0.2 * settle(s.landSince) * p.front
            + 0.03 * Math.sin(s.time * 1.8 + diag);
        } else {
          rx = legPitch(s, p.side < 0 ? 0.04 : 0);
          rz = -p.side * 0.06 * rise; // knees splay a little in the air
        }
        break;
      case "wing":
        rz = p.side * wingRoll(s, assetKey === "hopHawk" ? 1.2 : 1);
        break;
      case "arm":
        rz = p.side * (s.hopping ? 0.45 * rise - 0.1 * smooth(1 - s.t / 0.15) * (s.t < 0.15 ? 1 : 0) : 0.18 * settle(s.landSince) + 0.04 * Math.sin(s.time * 2.4));
        rx = s.hopping ? -0.3 * rise : 0.05 * Math.sin(s.time * 1.7 + p.side);
        break;
      case "ear": {
        // ears trail the rise, flop forward on landing, and twitch now and then at idle
        const twitch = Math.max(0, Math.sin(s.time * 0.9 + p.side * 1.7) - 0.93) * 4;
        rx = (s.hopping ? -0.45 * rise + 0.12 * (s.t < 0.15 ? smooth(s.t / 0.15) : 0) : 0.32 * settle(s.landSince)) - 0.18 * twitch;
        rz = p.side * (0.05 * Math.sin(s.time * 1.3 + p.side) + 0.1 * rise);
        break;
      }
      case "gill":
        rz = p.side * (0.12 * Math.sin(s.time * 7 + p.side) + 0.22 * rise + 0.15 * settle(s.landSince));
        break;
      case "tail":
        ry = 0.28 * Math.sin(s.time * (s.hopping ? 9 : 4.5));
        rx = s.hopping ? -0.35 * rise : 0.2 * settle(s.landSince);
        break;
      case "head":
        rx = (s.hopping ? -0.22 * rise : 0.16 * settle(s.landSince)) + 0.05 * Math.sin(s.time * 1.3);
        ry = s.hopping ? 0 : 0.12 * Math.sin(s.time * 0.55);
        break;
    }
    out[p.name] = [rx * k, ry * k, rz * k];
  }
  return out;
}

/** Quaternion `{x,y,z,w}` for Euler `[x, y, z]` applied as Rz·Ry·Rx (the engine's setRotation order). */
function quatZYX(x: number, y: number, z: number): { x: number; y: number; z: number; w: number } {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz
  };
}

/**
 * The part pose for `handle.setAnimationPose`: bones keyed by part node name, local rotation only (each part node keeps
 * its authored pivot translation). "overlay" leaves every other node at its rest transform.
 */
export function critterPartPose(assetKey: string, s: CritterMotionState) {
  const bones: Record<string, { rotation: { x: number; y: number; z: number; w: number } }> = {};
  for (const [name, [x, y, z]] of Object.entries(critterPartAngles(assetKey, s))) bones[name] = { rotation: quatZYX(x, y, z) };
  return { bones, mode: "overlay" as const };
}
