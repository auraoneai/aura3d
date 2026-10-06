/**
 * Built-in C-22 camera layers (PRD-08 §6.5): lookAt override, punch, fovKick,
 * trauma shake. All additive in camera-local space, applied after rig output.
 *
 * Reduced motion (ctx.reducedMotion): trauma ×0.25, roll ×0, punch dolly ×0,
 * fovKick ×0.5 — routes may not bypass this.
 */
import type { AuraVec3 } from "../index.js";
import type {
  AuraCameraLayer,
  AuraCameraPose,
  AuraFovKickLayer,
  AuraPunchLayer,
  AuraTraumaLayer
} from "../../contracts/camera.js";
import { createNoise1D } from "../feel/Noise.js";
import { springDamp } from "./Spring.js";

type LayerCtx = { readonly dt: number; readonly reducedMotion: boolean };

const DEG = Math.PI / 180;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function sub(a: AuraVec3, b: AuraVec3): AuraVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: AuraVec3, b: AuraVec3): AuraVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a: AuraVec3, s: number): AuraVec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function cross(a: AuraVec3, b: AuraVec3): AuraVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}
function normalize(a: AuraVec3): AuraVec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l <= 1e-9 ? [0, 0, 1] : scale(a, 1 / l);
}
/** Rodrigues rotation of `v` around unit axis `k` by `angle` (radians). */
function rotateAxis(v: AuraVec3, k: AuraVec3, angle: number): AuraVec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cx = cross(k, v);
  return [
    v[0] * c + cx[0] * s + k[0] * kv * (1 - c),
    v[1] * c + cx[1] * s + k[1] * kv * (1 - c),
    v[2] * c + cx[2] * s + k[2] * kv * (1 - c)
  ];
}

export interface AuraLookAtLayer extends AuraCameraLayer {
  set(point: AuraVec3, weight?: number): void;
  clear(): void;
}

/** Temporary look-target override with a half-life weight spring (§6.5). */
export function createLookAtLayer(weightHalflife = 0.1): AuraLookAtLayer {
  let target: AuraVec3 | undefined;
  let weight = 0;
  let targetWeight = 1;
  return {
    id: "lookAt",
    set(point, w = 1) {
      target = point;
      targetWeight = w;
    },
    clear() {
      target = undefined;
      weight = 0;
    },
    apply(pose, ctx) {
      if (!target) return pose;
      weight = springDamp(weight, targetWeight, weightHalflife, ctx.dt);
      return { ...pose, target: add(pose.target, scale(sub(target, pose.target), weight)) };
    },
    energy: () => (target ? weight : 0)
  };
}

/** `punch` — FOV offset + dolly along the view axis, attack/hold/release. */
export function createPunchLayer(): AuraPunchLayer {
  let fov = 0;
  let dolly = 0;
  let attack = 0.05;
  let hold = 0.03;
  let release = 0.25;
  let clock = Number.POSITIVE_INFINITY;

  const envelope = (): number => {
    if (clock < attack) return attack <= 1e-6 ? 1 : clock / attack;
    if (clock < attack + hold) return 1;
    const r = (clock - attack - hold) / Math.max(release, 1e-6);
    if (r >= 1) return 0;
    const out = 1 - r; // outQuad-ish release
    return out * out;
  };

  return {
    id: "punch",
    trigger(o = {}) {
      fov = o.fov ?? fov;
      dolly = o.dolly ?? dolly;
      attack = o.attack ?? 0.05;
      hold = o.hold ?? 0.03;
      release = o.release ?? 0.25;
      clock = 0;
    },
    apply(pose, ctx) {
      clock += ctx.dt;
      const e = envelope();
      if (e <= 0) return pose;
      const dollyAmount = ctx.reducedMotion ? 0 : dolly * e;
      const dir = normalize(sub(pose.target, pose.position));
      return {
        ...pose,
        position: add(pose.position, scale(dir, dollyAmount)),
        fov: pose.fov + fov * e
      };
    },
    energy: () => envelope()
  };
}

/** `fovKick` — named continuous FOV offset channels, each damped to its set value. */
export function createFovKickLayer(defaultHalflife = 0.15): AuraFovKickLayer {
  const channels = new Map<string, { offset: number; halflife: number; value: number }>();
  return {
    id: "fovKick",
    set(channel, offsetDeg, halflife = defaultHalflife) {
      const c = channels.get(channel) ?? { offset: 0, halflife, value: 0 };
      c.offset = offsetDeg;
      c.halflife = halflife;
      channels.set(channel, c);
    },
    apply(pose, ctx) {
      let kick = 0;
      for (const c of channels.values()) {
        c.value = springDamp(c.value, c.offset, c.halflife, ctx.dt);
        kick += c.value;
      }
      const applied = ctx.reducedMotion ? kick * 0.5 : kick;
      return applied === 0 ? pose : { ...pose, fov: pose.fov + applied };
    },
    energy: () => {
      let e = 0;
      for (const c of channels.values()) e = Math.max(e, Math.abs(c.value));
      return e;
    }
  };
}

/**
 * `shake` — 6-DoF trauma noise: `trauma²` amplitude, seeded Perlin per channel
 * at `frequency` Hz, smoothstep(0,0.05) terminal fade; translation scaled by
 * min(1, subjectDistance/6) so rotation dominates at range (§6.5).
 */
export function createTraumaLayer(): AuraTraumaLayer {
  let trauma = 0;
  let maxOffset = 0.05;
  let maxYawDeg = 1.5;
  let maxPitchDeg = 1.5;
  let maxRollDeg = 2.5;
  let frequency = 18;
  let decayPerSecond = 1.6;
  let noises = [
    createNoise1D(1001),
    createNoise1D(2002),
    createNoise1D(3003),
    createNoise1D(4004),
    createNoise1D(5005),
    createNoise1D(6006)
  ];
  let clock = 0;

  return {
    id: "trauma",
    add(amount) {
      trauma = Math.min(1, Math.max(0, trauma + amount));
    },
    configure(o: {
      maxAngleDeg?: number;
      maxOffset?: number;
      frequency?: number;
      decayPerSecond?: number;
      // CCR-08-3 additive fields (shipped from this lane module).
      maxYawDeg?: number;
      maxPitchDeg?: number;
      maxRollDeg?: number;
      seed?: number;
    }) {
      if (o.maxOffset !== undefined) maxOffset = o.maxOffset;
      if (o.maxAngleDeg !== undefined) {
        maxYawDeg = o.maxAngleDeg;
        maxPitchDeg = o.maxAngleDeg;
        maxRollDeg = o.maxAngleDeg;
      }
      if (o.maxYawDeg !== undefined) maxYawDeg = o.maxYawDeg;
      if (o.maxPitchDeg !== undefined) maxPitchDeg = o.maxPitchDeg;
      if (o.maxRollDeg !== undefined) maxRollDeg = o.maxRollDeg;
      if (o.frequency !== undefined) frequency = o.frequency;
      if (o.decayPerSecond !== undefined) decayPerSecond = o.decayPerSecond;
      if (o.seed !== undefined) {
        const s = o.seed;
        noises = [0, 1, 2, 3, 4, 5].map((i) => createNoise1D(s + i * 1009));
      }
    },
    apply(pose, ctx) {
      clock += ctx.dt;
      trauma = Math.max(0, trauma - decayPerSecond * ctx.dt);
      const band = smoothstep(0, 0.05, trauma);
      const motionScale = ctx.reducedMotion ? 0.25 : 1;
      const amp = trauma * trauma * band * motionScale;
      if (amp <= 0) return pose;

      const t = clock * frequency;
      const n = noises.map((noise, i) => noise(t + i * 17.13));
      const dir = sub(pose.target, pose.position);
      const dist = Math.hypot(dir[0], dir[1], dir[2]);
      const transScale = Math.min(1, dist / 6);
      const offset = scale([n[0], n[1], n[2]], maxOffset * amp * transScale);

      const viewDir = normalize(dir);
      const right = normalize(cross(viewDir, pose.up));
      const camUp = normalize(cross(right, viewDir));
      const yaw = n[3] * maxYawDeg * DEG * amp;
      const pitch = n[4] * maxPitchDeg * DEG * amp;
      const rollOff = n[5] * maxRollDeg * DEG * amp;

      let newTargetDir = rotateAxis(viewDir, camUp, yaw);
      newTargetDir = rotateAxis(newTargetDir, right, pitch);
      const newTarget = add(pose.position, scale(newTargetDir, Math.max(dist, 1e-3)));
      return {
        ...pose,
        position: add(pose.position, offset),
        target: newTarget,
        roll: pose.roll + (ctx.reducedMotion ? 0 : rollOff)
      };
    },
    energy: () => trauma
  };
}
