// Wonder World motion math (PRD 04 D01-D07, B07, B09). Pure and deterministic:
// no DOM, no engine imports, no clocks and no randomness. Every function takes
// time or progress as an argument, so the same inputs always give the same pose.
//
// Conventions shared with the stage:
// - A node's "base" is the point it stands on (feet / bottom centre), in metres.
// - Rotations are Euler radians [x, y, z] applied in the engine's default "ZYX"
//   order (R = Rz * Ry * Rx). Yaw 0 faces +Z, which is toward the fixed camera.
// - Procedural motion is expressed as a PoseOffset: translations and rotations
//   add, scales multiply. NEUTRAL_POSE changes nothing.

import type { MoveStyle, ObjectAction } from "../types.js";

export type Vec3 = readonly [number, number, number];

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- scalars

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[2] - a[2]);
}

export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

/** Fractional part in [0, 1). */
export function frac(value: number): number {
  return value - Math.floor(value);
}

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(angle: number): number {
  let a = angle % TAU;
  if (a <= -Math.PI) a += TAU;
  if (a > Math.PI) a -= TAU;
  return a;
}

/** Steps `current` toward `target` by at most `maxStep` radians along the short way round. */
export function approachAngle(current: number, target: number, maxStep: number): number {
  const delta = wrapAngle(target - current);
  if (Math.abs(delta) <= maxStep) return current + delta;
  return current + Math.sign(delta) * maxStep;
}

/** Steps `current` toward `target` by at most `maxStep`. */
export function approach(current: number, target: number, maxStep: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

/** Yaw that turns +Z toward `to` as seen from `from` (atan2 of the XZ delta). */
export function yawTowards(from: Vec3, to: Vec3): number {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 0;
  return Math.atan2(dx, dz);
}

/** Small stable hash of an id, used to desynchronise idle loops without randomness. */
export function phaseOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 1000) / 1000;
}

// ---------------------------------------------------------------- easing

export type EaseName = "linear" | "inQuad" | "outQuad" | "inOutQuad" | "inOutSine" | "outCubic" | "inOutCubic" | "outBackSoft" | "outBounceSoft";

/** Eases a progress value in [0, 1]. Input is clamped, so the output always starts at 0 and ends at 1. */
export function ease(name: EaseName, t: number): number {
  const x = clamp01(t);
  switch (name) {
    case "linear":
      return x;
    case "inQuad":
      return x * x;
    case "outQuad":
      return 1 - (1 - x) * (1 - x);
    case "inOutQuad":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "inOutSine":
      return -(Math.cos(Math.PI * x) - 1) / 2;
    case "outCubic":
      return 1 - Math.pow(1 - x, 3);
    case "inOutCubic":
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case "outBackSoft": {
      // A gentle overshoot (about 4%), never a snap.
      const c1 = 0.9;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    case "outBounceSoft": {
      // One soft settle bounce of 6% instead of the classic three hard bounces.
      if (x < 0.72) return ease("inQuad", x / 0.72);
      const u = (x - 0.72) / 0.28;
      return 1 - 0.06 * Math.sin(Math.PI * u);
    }
  }
}

/** Smooth 0 -> 1 -> 0 envelope over one play-through (used to start and stop oscillations softly). */
export function envelope(t01: number): number {
  return Math.sin(Math.PI * clamp01(t01));
}

// ---------------------------------------------------------------- pose offsets

export interface PoseOffset {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
}

export const NEUTRAL_POSE: PoseOffset = Object.freeze({ dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });

export function pose(parts: Partial<PoseOffset>): PoseOffset {
  return { ...NEUTRAL_POSE, ...parts };
}

/** Combines offsets: translations and rotations add, scales multiply. */
export function addPose(...poses: readonly PoseOffset[]): PoseOffset {
  let dx = 0, dy = 0, dz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1;
  for (const p of poses) {
    dx += p.dx; dy += p.dy; dz += p.dz;
    rx += p.rx; ry += p.ry; rz += p.rz;
    sx *= p.sx; sy *= p.sy; sz *= p.sz;
  }
  return { dx, dy, dz, rx, ry, rz, sx, sy, sz };
}

/** Scales the amplitude of an offset toward neutral (k = 0 gives NEUTRAL_POSE, k = 1 leaves it as it is). */
export function dampPose(p: PoseOffset, k: number): PoseOffset {
  const s = (v: number): number => 1 + (v - 1) * k;
  return { dx: p.dx * k, dy: p.dy * k, dz: p.dz * k, rx: p.rx * k, ry: p.ry * k, rz: p.rz * k, sx: s(p.sx), sy: s(p.sy), sz: s(p.sz) };
}

/**
 * The left-right mirror image of an offset, as a mirror facing the viewer shows it: a step or a rock to one side
 * goes to the other side, and a turn goes the other way. Up, down, leaning toward the viewer and scales are kept.
 */
export function mirrorPoseOffset(p: PoseOffset): PoseOffset {
  return { ...p, dx: -p.dx, ry: -p.ry, rz: -p.rz };
}

/** The same offset for a copy drawn `k` times as large: translations scale by k; rotations and scales stay. */
export function scalePoseTranslation(p: PoseOffset, k: number): PoseOffset {
  return { ...p, dx: p.dx * k, dy: p.dy * k, dz: p.dz * k };
}

export function isNeutral(p: PoseOffset, epsilon = 1e-6): boolean {
  return Math.abs(p.dx) < epsilon && Math.abs(p.dy) < epsilon && Math.abs(p.dz) < epsilon
    && Math.abs(p.rx) < epsilon && Math.abs(p.ry) < epsilon && Math.abs(p.rz) < epsilon
    && Math.abs(p.sx - 1) < epsilon && Math.abs(p.sy - 1) < epsilon && Math.abs(p.sz - 1) < epsilon;
}

/** Volume-preserving squash and stretch: `amount` > 0 stretches tall, < 0 squashes flat. */
export function squashStretch(amount: number): readonly [number, number, number] {
  const sy = Math.max(0.2, 1 + amount);
  const side = 1 / Math.sqrt(sy);
  return [side, sy, side];
}

// ---------------------------------------------------------------- building blocks

/** Parabolic hop height for progress t in [0, 1]: 0 at both ends, `height` at the top. */
export function hopArc(t01: number, height: number): number {
  const t = clamp01(t01);
  return 4 * height * t * (1 - t);
}

/** Smooth vertical bob that starts and ends at 0 (0 -> amplitude -> 0 every cycle). */
export function bob(timeSec: number, amplitude: number, hz: number): number {
  return amplitude * 0.5 * (1 - Math.cos(TAU * hz * timeSec));
}

/** Symmetric float around the rest height. */
export function float(timeSec: number, amplitude: number, hz: number, phase = 0): number {
  return amplitude * Math.sin(TAU * (hz * timeSec + phase));
}

/** Tail-wag style yaw wiggle (radians). */
export function wag(timeSec: number, amplitudeRad: number, hz: number): number {
  return amplitudeRad * Math.sin(TAU * hz * timeSec);
}

/** Rolling without slipping: the rotation angle that matches a travelled distance. */
export function rollAngle(distance: number, radius: number): number {
  return radius > 1e-6 ? distance / radius : 0;
}

/** Pop: a small soft swell, then shrink to nothing. Scale for progress t in [0, 1]. */
export function popScale(t01: number): number {
  const t = clamp01(t01);
  if (t < 0.4) return 1 + 0.18 * ease("outQuad", t / 0.4);
  return 1.18 * (1 - ease("inQuad", (t - 0.4) / 0.6));
}

/** Gentle highlight breathing for touch targets: 1 -> 1 + amount -> 1, slow (never flashing). */
export function breathe(timeSec: number, amount: number, periodSec = 2.4): number {
  return 1 + amount * 0.5 * (1 - Math.cos((TAU * timeSec) / periodSec));
}

/** Talking pulse: a soft squash/bob while a line plays. Not lip sync; there are no mouth morphs. */
export function talkPulse(timeSec: number, strength: number, hz = 2.4): PoseOffset {
  const k = strength * 0.5 * (1 - Math.cos(TAU * hz * timeSec));
  const [sx, sy, sz] = squashStretch(k);
  return pose({ sx, sy, sz, rx: -k * 0.6 });
}

/**
 * Door swing about its left hinge. Returns the base offset that keeps the hinge edge
 * in place while the door turns by `angle` radians about Y.
 */
export function hingeSwingOffset(width: number, angle: number): Vec3 {
  const h = -width / 2;
  // R_y(angle) applied to (h, 0, 0) is (h cos a, 0, -h sin a); offset = hinge - rotated hinge.
  return [h - h * Math.cos(angle), 0, h * Math.sin(angle)];
}

/**
 * Tipping over: the base offset that keeps the bottom edge on the side the object
 * falls toward in place while it turns by `angle` radians about Z (a positive angle
 * tips its top toward -X), so a toppled block lies on the floor instead of sinking
 * half its width into it. `halfWidth` is its half-extent along X.
 */
export function tipEdgeOffset(halfWidth: number, angle: number): Vec3 {
  if (angle === 0 || !(halfWidth > 0)) return [0, 0, 0];
  const e = -Math.sign(angle) * halfWidth;
  // R_z(angle) applied to (e, 0, 0) is (e cos a, e sin a, 0); offset = edge - rotated edge.
  return [e * (1 - Math.cos(angle)), -e * Math.sin(angle), 0];
}

// ---------------------------------------------------------------- rotation math

/** Applies R = Rz * Ry * Rx (the engine's default "ZYX" Euler order) to a vector. */
export function rotateZYX(rotation: Vec3, v: Vec3): Vec3 {
  const [ax, ay, az] = rotation;
  // Rx
  const cx = Math.cos(ax), sx = Math.sin(ax);
  const x1 = v[0];
  const y1 = v[1] * cx - v[2] * sx;
  const z1 = v[1] * sx + v[2] * cx;
  // Ry
  const cy = Math.cos(ay), sy = Math.sin(ay);
  const x2 = x1 * cy + z1 * sy;
  const y2 = y1;
  const z2 = -x1 * sy + z1 * cy;
  // Rz
  const cz = Math.cos(az), sz = Math.sin(az);
  return [x2 * cz - y2 * sz, x2 * sz + y2 * cz, z2];
}

/** Rotates a vector by yaw only. */
export function rotateYaw(yaw: number, v: Vec3): Vec3 {
  return rotateZYX([0, yaw, 0], v);
}

/** Row-major 3x3 matrix of R = Rz * Ry * Rx. */
export function rotationMatrixZYX(rotation: Vec3): readonly number[] {
  const [a, b, c] = rotation;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  const cc = Math.cos(c), sc = Math.sin(c);
  return [
    cb * cc, sa * sb * cc - ca * sc, ca * sb * cc + sa * sc,
    cb * sc, sa * sb * sc + ca * cc, ca * sb * sc - sa * cc,
    -sb, sa * cb, ca * cb
  ];
}

/** Euler angles [x, y, z] (ZYX order) of a row-major rotation matrix. */
export function eulerZYXFromMatrix(m: readonly number[]): Vec3 {
  const m20 = clamp(m[6] ?? 0, -1, 1);
  const b = Math.asin(-m20);
  if (Math.abs(m20) < 0.999999) {
    return [Math.atan2(m[7] ?? 0, m[8] ?? 1), b, Math.atan2(m[3] ?? 0, m[0] ?? 1)];
  }
  // Gimbal lock: fold the x rotation into z.
  return [0, b, Math.atan2(-(m[1] ?? 0), m[4] ?? 1)];
}

/** Euler angles of R(outer) * R(inner): a piece's local rotation carried by its node's rotation. */
export function composeRotation(outer: Vec3, inner: Vec3): Vec3 {
  if (inner[0] === 0 && inner[1] === 0 && inner[2] === 0) return outer;
  if (outer[0] === 0 && outer[1] === 0 && outer[2] === 0) return inner;
  const a = rotationMatrixZYX(outer);
  const b = rotationMatrixZYX(inner);
  const m: number[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      m.push((a[row * 3] ?? 0) * (b[col] ?? 0) + (a[row * 3 + 1] ?? 0) * (b[3 + col] ?? 0) + (a[row * 3 + 2] ?? 0) * (b[6 + col] ?? 0));
    }
  }
  return eulerZYXFromMatrix(m);
}

/** Where a stage node draws. `pivot` is the point rotations and scales are applied about. */
export interface StagePose {
  /** The point the node stands on (feet / bottom centre). */
  readonly base: Vec3;
  readonly rotation: Vec3;
  readonly scale: Vec3;
  /** "base": rotate about the feet (rocking, leaning). "center": rotate about the middle (rolling balls). */
  readonly pivot: "base" | "center";
  /** Height of the rotation centre above the base when pivot is "center" (unscaled). */
  readonly centerHeight: number;
}

/**
 * World position of one drawn piece of a node. `localCenter` is the piece's origin
 * relative to the node base before scaling: (0, 0, 0) for a fitted model (the engine
 * grounds it on its lowest point) and the primitive's centre for stand-in pieces.
 */
export function placePiece(p: StagePose, localCenter: Vec3): Vec3 {
  const pivotHeight = p.pivot === "center" ? p.centerHeight : 0;
  const pivotWorld: Vec3 = [p.base[0], p.base[1] + pivotHeight * p.scale[1], p.base[2]];
  const local: Vec3 = [
    localCenter[0] * p.scale[0],
    (localCenter[1] - pivotHeight) * p.scale[1],
    localCenter[2] * p.scale[2]
  ];
  return addVec3(pivotWorld, rotateZYX(p.rotation, local));
}

// ---------------------------------------------------------------- procedural motion

export type ProceduralKind =
  | "still" | "bob" | "hop" | "squash" | "rock" | "wag" | "nod" | "lean" | "turn" | "spin" | "float"
  | "pulse" | "dip" | "duck" | "peek" | "bow" | "shake" | "stretch" | "flap" | "chomp" | "tilt";

/** One layer of procedural motion. Amplitudes are metres for translations, radians for rotations, fractions for scales. */
export interface ProceduralMotion {
  readonly kind: ProceduralKind;
  /** Length of one play-through (or one loop period) in seconds. */
  readonly durationSec: number;
  readonly amplitude: number;
  /** Oscillations inside one play-through. Default 1. */
  readonly cycles?: number;
}

export function proc(kind: ProceduralKind, durationSec: number, amplitude: number, cycles = 1): ProceduralMotion {
  return { kind, durationSec, amplitude, cycles };
}

/** A gesture's motion when no clip plays it: one or more procedural layers. */
export interface GestureMotionSpec {
  readonly layers: readonly ProceduralMotion[];
  /** Nominal play time when not looping. */
  readonly durationSec: number;
  /** Keep the final pose after it ends (duck, sit, lean) until the next gesture. */
  readonly hold?: boolean;
  /** Show the soft glow halo while it plays (never flashing). */
  readonly halo?: boolean;
  /** Suppress idle breathing while active (freeze). */
  readonly still?: boolean;
}

export function gestureMotion(layers: readonly ProceduralMotion[], options: { durationSec?: number; hold?: boolean; halo?: boolean; still?: boolean } = {}): GestureMotionSpec {
  const longest = layers.reduce((max, layer) => Math.max(max, layer.durationSec), 0);
  return {
    layers,
    durationSec: options.durationSec ?? (longest > 0 ? longest : 1),
    ...(options.hold ? { hold: true } : {}),
    ...(options.halo ? { halo: true } : {}),
    ...(options.still ? { still: true } : {})
  };
}

/** Hold-style ease: ramps to 1 over the first 35% and stays there. */
function holdRamp(u: number): number {
  return ease("inOutSine", clamp01(u / 0.35));
}

/**
 * Samples one procedural layer at `tSec` seconds since it started.
 * `loop` wraps the play-through; otherwise time is clamped to the end. `hold`
 * keeps hold-style kinds (duck, lean, tilt, dip-and-stay) at their end pose.
 */
export function sampleLayer(m: ProceduralMotion, tSec: number, loop: boolean, hold = false): PoseOffset {
  const d = Math.max(1e-3, m.durationSec);
  const cycles = m.cycles ?? 1;
  const u = loop ? frac(Math.max(0, tSec) / d) : clamp01(tSec / d);
  const env = loop ? 1 : envelope(u);
  const a = m.amplitude;
  const osc = (phaseCycles: number): number => Math.sin(TAU * phaseCycles * u);
  const rise = (phaseCycles: number): number => 0.5 * (1 - Math.cos(TAU * phaseCycles * u));
  switch (m.kind) {
    case "still":
      return NEUTRAL_POSE;
    case "bob":
      return pose({ dy: a * rise(cycles) });
    case "hop": {
      if (!loop && u >= 1) return NEUTRAL_POSE;
      const p = frac(cycles * u);
      const [sx, sy, sz] = squashStretch(0.05 * Math.sin(TAU * p));
      return pose({ dy: hopArc(p, a), sx, sy, sz });
    }
    case "squash": {
      const k = -a * rise(cycles);
      const [sx, sy, sz] = squashStretch(k);
      return pose({ sx, sy, sz });
    }
    case "rock":
      return pose({ rz: a * osc(cycles) * env });
    case "wag":
      return pose({ ry: a * osc(cycles) * env });
    case "nod":
      return pose({ rx: a * rise(cycles) });
    case "lean":
      return pose({ rx: a * (hold ? holdRamp(u) : envelope(u)) });
    case "tilt":
      return pose({ rz: a * (hold ? holdRamp(u) : envelope(u)) });
    case "turn":
      return pose({ ry: a * osc(cycles) * env });
    case "spin":
      return pose({ ry: TAU * cycles * (loop ? u : ease("inOutSine", u)) * Math.sign(a || 1) });
    case "float":
      return pose({ dy: a * osc(cycles) });
    case "pulse": {
      const s = 1 + a * rise(cycles);
      return pose({ sx: s, sy: s, sz: s });
    }
    case "dip": {
      const k = -a * rise(cycles);
      const [sx, sy, sz] = squashStretch(k);
      return pose({ sx, sy, sz });
    }
    case "duck": {
      const k = hold ? holdRamp(u) : envelope(u);
      return pose({ sy: 1 - a * k, sx: 1 + 0.3 * a * k, sz: 1 + 0.3 * a * k });
    }
    case "peek": {
      const k = envelope(u);
      return pose({ dx: a * k, rz: -0.6 * a * k });
    }
    case "bow":
      return pose({ rx: a * rise(cycles) });
    case "shake":
      return pose({ dx: a * osc(cycles) * env });
    case "stretch": {
      const [sx, sy, sz] = squashStretch(a * envelope(u));
      return pose({ sx, sy, sz });
    }
    case "flap": {
      const k = a * Math.abs(osc(cycles)) * env;
      return pose({ sx: 1 + k });
    }
    case "chomp": {
      const k = a * Math.abs(osc(cycles)) * env;
      return pose({ sy: 1 - k, sx: 1 + 0.5 * k, sz: 1 + 0.5 * k });
    }
  }
}

/** Samples every layer of a gesture motion and combines them. */
export function sampleGestureMotion(spec: GestureMotionSpec, tSec: number, loop: boolean): PoseOffset {
  if (spec.layers.length === 0) return NEUTRAL_POSE;
  const hold = spec.hold === true && !loop;
  return addPose(...spec.layers.map((layer) => sampleLayer(layer, tSec, loop, hold)));
}

/** True when a non-looping gesture has finished playing. */
export function gestureFinished(spec: GestureMotionSpec, tSec: number): boolean {
  return tSec >= spec.durationSec;
}

/**
 * Layers reduced motion leaves out. A spin is pure secondary motion, and damped to half it would end a gesture
 * half-way round (facing away) and snap back when the gesture ends.
 */
export const REDUCED_MOTION_DROPPED: readonly ProceduralKind[] = ["spin"];

/** The gesture as reduced motion plays it: the same timing, hold and halo, without the dropped layers. */
export function reducedMotionSpec(spec: GestureMotionSpec): GestureMotionSpec {
  if (!spec.layers.some((layer) => REDUCED_MOTION_DROPPED.includes(layer.kind))) return spec;
  return { ...spec, layers: spec.layers.filter((layer) => !REDUCED_MOTION_DROPPED.includes(layer.kind)) };
}

// ---------------------------------------------------------------- tweens

/** A scalar that eases toward a target over time. Deterministic: only `step(dt)` moves it. */
export class Tweened {
  private from: number;
  private to: number;
  private duration = 0;
  private elapsed = 0;
  private easing: EaseName = "inOutSine";

  constructor(initial: number) {
    this.from = initial;
    this.to = initial;
  }

  get value(): number {
    if (this.duration <= 0) return this.to;
    return lerp(this.from, this.to, ease(this.easing, this.elapsed / this.duration));
  }

  get target(): number {
    return this.to;
  }

  get active(): boolean {
    return this.duration > 0 && this.elapsed < this.duration;
  }

  /** Starts easing from the current value to `to`. A non-positive duration jumps. */
  set(to: number, durationSec: number, easing: EaseName = "inOutSine"): void {
    const current = this.value;
    this.from = current;
    this.to = to;
    this.easing = easing;
    this.elapsed = 0;
    this.duration = durationSec > 0 ? durationSec : 0;
  }

  jump(to: number): void {
    this.from = to;
    this.to = to;
    this.duration = 0;
    this.elapsed = 0;
  }

  step(dt: number): void {
    if (this.duration <= 0) return;
    this.elapsed = Math.min(this.duration, this.elapsed + Math.max(0, dt));
    if (this.elapsed >= this.duration) {
      this.from = this.to;
      this.duration = 0;
      this.elapsed = 0;
    }
  }
}

// ---------------------------------------------------------------- moves

/** Travel speed per style, metres per second (calm toddler pace). */
export const MOVE_SPEED: Readonly<Record<MoveStyle, number>> = {
  walk: 1.1,
  run: 2.0,
  roll: 1.6,
  float: 0.9,
  hop: 1.0,
  drive: 1.5,
  fly: 1.3,
  slide: 1.3
};

const MOVE_EASE: Readonly<Record<MoveStyle, EaseName>> = {
  walk: "inOutSine",
  run: "inOutSine",
  roll: "outCubic",
  float: "inOutSine",
  hop: "inOutSine",
  drive: "inOutCubic",
  fly: "inOutSine",
  slide: "inOutQuad"
};

/** Move time in seconds: distance over speed, kept between 0.6 s and 3.2 s so entries never drag. */
export function moveDurationSec(style: MoveStyle, distance: number): number {
  const speed = MOVE_SPEED[style];
  const raw = Math.max(0, distance) / speed;
  const max = style === "run" ? 2.2 : 3.2;
  return clamp(raw, 0.6, max);
}

export interface MoveSample {
  readonly position: Vec3;
  /** Secondary motion for the style (walk bob, hop arc, flutter). Neutral in reduced motion. */
  readonly pose: PoseOffset;
  /** Travel heading (yaw), or null when the move has no horizontal extent. */
  readonly heading: number | null;
  /** Distance travelled along the path so far (drives rolling). */
  readonly travelled: number;
}

/**
 * Position and secondary motion of a move at progress t in [0, 1].
 * `elapsedSec` drives the step rhythm; `reduced` keeps the semantic path and drops bounce.
 */
export function sampleMove(style: MoveStyle, from: Vec3, to: Vec3, t01: number, elapsedSec: number, reduced: boolean): MoveSample {
  const t = clamp01(t01);
  const p = ease(reduced ? "inOutSine" : MOVE_EASE[style], t);
  const position = lerpVec3(from, to, p);
  const horizontal = distanceXZ(from, to);
  const total = distance3(from, to);
  const heading = horizontal > 0.05 ? yawTowards(from, to) : null;
  const travelled = total * p;
  if (reduced || t >= 1) return { position, pose: NEUTRAL_POSE, heading, travelled };
  const moving = envelope(t) > 0.02 ? 1 : 0;
  switch (style) {
    case "walk":
      return {
        position, heading, travelled,
        pose: pose({ dy: moving * 0.035 * Math.abs(Math.sin(TAU * 1.6 * elapsedSec)), rz: moving * 0.045 * Math.sin(TAU * 0.8 * elapsedSec) })
      };
    case "run":
      return {
        position, heading, travelled,
        pose: pose({ dy: moving * 0.06 * Math.abs(Math.sin(TAU * 2.6 * elapsedSec)), rx: 0.08 * envelope(t) })
      };
    case "hop": {
      const hops = Math.max(1, Math.round(horizontal / 0.45));
      const phase = frac(hops * p);
      const [sx, sy, sz] = squashStretch(0.05 * Math.sin(TAU * phase));
      return { position, heading, travelled, pose: pose({ dy: hopArc(phase, 0.16), sx, sy, sz }) };
    }
    case "float":
      return { position, heading, travelled, pose: pose({ dy: 0.1 * envelope(t), rz: 0.04 * Math.sin(TAU * 0.5 * elapsedSec) }) };
    case "fly":
      // A slow 2.4 Hz glide bob (never a buzzy flutter).
      return { position, heading, travelled, pose: pose({ dy: 0.45 * envelope(t) + 0.025 * Math.sin(TAU * 2.4 * elapsedSec) }) };
    case "drive":
      // Three soft bumps a second.
      return { position, heading, travelled, pose: pose({ dy: moving * 0.01 * Math.abs(Math.sin(TAU * 1.5 * elapsedSec)) }) };
    case "roll":
    case "slide":
      return { position, heading, travelled, pose: NEUTRAL_POSE };
  }
}

// ---------------------------------------------------------------- object actions

/** Persistent state an object keeps between actions. */
export interface ObjectState {
  /** Metres above the rest height (rise, up, down). */
  readonly lift: number;
  /** True after "rise": the next "down" returns all the way to the ground. */
  readonly floating: boolean;
  /** Uniform scale multiplier (grow, shrink). */
  readonly scaleMul: number;
  /** -1 / 0 / +1: lying on its side after topple or fall. */
  readonly toppled: number;
  /** Door or lid is open. */
  readonly open: boolean;
  /** A vehicle is running (go) until it stops. */
  readonly running: boolean;
  /** Popped or eaten: hidden until it is shown again. */
  readonly gone: boolean;
}

export const INITIAL_OBJECT_STATE: ObjectState = Object.freeze({
  lift: 0,
  floating: false,
  scaleMul: 1,
  toppled: 0,
  open: false,
  running: false,
  gone: false
});

export type TransientKind =
  | "pop" | "eat" | "bounce" | "wobble" | "spin" | "glow" | "bloom" | "wash" | "dry" | "shake" | "ring"
  | "brake" | "pulse" | "drop" | "lidHop" | "sway" | "tumble";

export interface ObjectActionPlan {
  readonly next: ObjectState;
  /** One-shot motion layered over the persistent state. */
  readonly transient: TransientKind | null;
  /** Seconds the transient (and any persistent change) takes. */
  readonly durationSec: number;
  /** Hide the node when the transient ends (pop, eat). */
  readonly hideAtEnd: boolean;
  /** Ease persistent values (lift, scale, topple, open) over this many seconds. */
  readonly settleSec: number;
  /** Show the soft glow halo while the transient plays. */
  readonly halo: boolean;
  /** Roll this many metres sideways (roll without a destination). */
  readonly rollBy: number;
  /** Stop any move in progress where it is (stop). */
  readonly stopMove: boolean;
}

export interface ObjectActionContext {
  /** The object is a door that swings on a hinge. */
  readonly door: boolean;
  /** The object is a box, basket or building that opens. */
  readonly container: boolean;
  /** Current horizontal position (roll goes toward the middle of the stage). */
  readonly x: number;
}

/** Height one "up" or "down" step moves (one lift floor). */
export const LIFT_STEP_M = 0.8;
/** Height "rise" floats an object to. */
export const RISE_HEIGHT_M = 1.5;

const TRANSIENT_SECONDS: Readonly<Record<TransientKind, number>> = {
  pop: 0.55,
  eat: 1.6,
  bounce: 0.7,
  wobble: 1.0,
  spin: 1.4,
  glow: 2.0,
  bloom: 1.6,
  wash: 1.6,
  dry: 1.4,
  shake: 0.9,
  ring: 1.0,
  brake: 0.8,
  pulse: 0.5,
  drop: 0.8,
  lidHop: 0.7,
  sway: 2.2,
  tumble: 0.9
};

export function transientSeconds(kind: TransientKind): number {
  return TRANSIENT_SECONDS[kind];
}

/** Decides what an object action does: the next persistent state plus a one-shot transient. Pure. */
export function planObjectAction(action: ObjectAction, state: ObjectState, ctx: ObjectActionContext): ObjectActionPlan {
  const base = { next: state, transient: null, durationSec: 0, hideAtEnd: false, settleSec: 0, halo: false, rollBy: 0, stopMove: false };
  const transient = (kind: TransientKind, extra: Partial<ObjectActionPlan> = {}): ObjectActionPlan => ({
    ...base,
    transient: kind,
    durationSec: TRANSIENT_SECONDS[kind],
    ...extra
  });
  switch (action) {
    case "pop":
      return transient("pop", { next: { ...state, gone: true, running: false }, hideAtEnd: true });
    case "eat":
      return transient("eat", { next: { ...state, gone: true, running: false }, hideAtEnd: true });
    case "bounce":
      return transient("bounce");
    case "wobble":
      return transient("wobble");
    case "spin":
      return transient("spin");
    case "glow":
      return transient("glow", { halo: true });
    case "bloom":
      return transient("bloom", { halo: true, next: { ...state, scaleMul: clamp(Math.max(state.scaleMul, 1.12), 0.35, 2.2) }, settleSec: 1.2 });
    case "wash":
      return transient("wash");
    case "dry":
      return transient("dry");
    case "shake":
      return transient("shake");
    case "ring":
      return transient("ring");
    case "tint":
      return transient("pulse");
    case "grow":
      return transient("pulse", { next: { ...state, scaleMul: clamp(state.scaleMul * 1.3, 0.35, 2.2) }, settleSec: 0.7 });
    case "shrink":
      return transient("pulse", { next: { ...state, scaleMul: clamp(state.scaleMul * 0.7, 0.35, 2.2) }, settleSec: 0.7 });
    case "rise":
      return transient("sway", { next: { ...state, lift: RISE_HEIGHT_M, floating: true }, settleSec: 2.2 });
    case "up":
      return { ...base, next: { ...state, lift: clamp(state.lift + LIFT_STEP_M, 0, 2.4), floating: false }, settleSec: 1.2, durationSec: 1.2 };
    case "down": {
      const lift = state.floating ? 0 : clamp(state.lift - LIFT_STEP_M, 0, 2.4);
      return { ...base, next: { ...state, lift, floating: false }, settleSec: state.floating ? 1.8 : 1.2, durationSec: state.floating ? 1.8 : 1.2 };
    }
    case "fall":
      if (state.lift > 0.01) {
        return transient("drop", { next: { ...state, lift: 0, floating: false }, settleSec: 0.8 });
      }
      return transient("tumble", { next: { ...state, toppled: ctx.x > 0 ? -1 : 1 }, settleSec: 0.9 });
    case "topple":
      return transient("tumble", { next: { ...state, toppled: ctx.x > 0 ? -1 : 1 }, settleSec: 0.9 });
    case "stack":
      return transient("drop", { next: { ...state, toppled: 0, gone: false } , settleSec: 0.3 });
    case "open":
      if (ctx.door) return { ...base, next: { ...state, open: true }, settleSec: 1.1, durationSec: 1.1 };
      return transient("lidHop", { next: { ...state, open: true } });
    case "close":
      if (ctx.door) return { ...base, next: { ...state, open: false }, settleSec: 1.0, durationSec: 1.0 };
      return transient("lidHop", { next: { ...state, open: false } });
    case "roll": {
      const direction = ctx.x > 0.05 ? -1 : 1;
      return { ...base, rollBy: direction * 1.0 };
    }
    case "go":
      return { ...base, next: { ...state, running: true } };
    case "stop":
      return transient("brake", { next: { ...state, running: false }, stopMove: true });
  }
}

/**
 * One-shot object motion at `tSec` into a transient of `durationSec`.
 * `reduced` halves amplitudes and removes overshoot; the action still reads.
 */
export function sampleTransient(kind: TransientKind, tSec: number, durationSec: number, reduced: boolean): PoseOffset {
  const u = clamp01(tSec / Math.max(1e-3, durationSec));
  const env = envelope(u);
  const k = reduced ? 0.5 : 1;
  switch (kind) {
    case "pop": {
      const s = reduced ? 1 - ease("inQuad", u) : popScale(u);
      return pose({ sx: s, sy: s, sz: s });
    }
    case "eat": {
      const shrink = 1 - ease("inQuad", clamp01((u - 0.45) / 0.55));
      const chomp = 1 - 0.12 * k * Math.abs(Math.sin(TAU * 1.5 * clamp01(u / 0.45))) * (u < 0.45 ? 1 : 0);
      return pose({ sx: shrink, sy: shrink * chomp, sz: shrink });
    }
    case "bounce": {
      const [sx, sy, sz] = squashStretch(0.05 * k * Math.sin(TAU * u));
      return pose({ dy: hopArc(u, 0.25 * k), sx, sy, sz });
    }
    case "wobble":
      return pose({ rz: 0.12 * k * Math.sin(TAU * 1.6 * u) * (1 - u) });
    case "spin":
      return pose({ ry: TAU * ease("inOutSine", u) });
    case "glow": {
      const s = 1 + 0.04 * k * env;
      return pose({ sx: s, sy: s, sz: s });
    }
    case "bloom": {
      const s = 1 + 0.18 * k * env;
      return pose({ sx: s, sy: s, sz: s, ry: 0.5 * k * ease("inOutSine", u) });
    }
    case "wash":
      return pose({ dx: 0.04 * k * Math.sin(TAU * 4 * u) * env, sy: 1 - 0.03 * k * env });
    case "dry":
      return pose({ rz: 0.06 * k * Math.sin(TAU * 2 * u) * env });
    case "shake":
      return pose({ dx: 0.03 * k * Math.sin(TAU * 3.6 * u) * env });
    case "ring":
      return pose({ rz: 0.12 * k * Math.sin(TAU * 3 * u) * (1 - u) });
    case "brake":
      return pose({ rx: 0.06 * k * Math.sin(TAU * u) * (1 - u) });
    case "pulse": {
      const s = 1 + 0.08 * k * env;
      return pose({ sx: s, sy: s, sz: s });
    }
    case "drop":
      return pose({ dy: reduced ? 0.4 * (1 - ease("inOutSine", u)) : 0.8 * (1 - ease("outBounceSoft", u)) });
    case "lidHop": {
      const [sx, sy, sz] = squashStretch(0.05 * k * Math.sin(TAU * u));
      return pose({ dy: hopArc(u, 0.08 * k), sx, sy, sz });
    }
    case "sway":
      return pose({ rz: 0.05 * k * Math.sin(TAU * u) });
    case "tumble":
      return pose({ dy: hopArc(clamp01(u * 1.4), 0.06 * k) });
  }
}

/** Gentle running loop for a vehicle that is "going" (chug). */
export function runningPose(timeSec: number, reduced: boolean): PoseOffset {
  if (reduced) return NEUTRAL_POSE;
  return pose({ dy: 0.018 * Math.abs(Math.sin(TAU * 2.5 * timeSec)), rx: 0.015 * Math.sin(TAU * 2.5 * timeSec) });
}

/** Lying-on-its-side angle for a toppled state (slightly less than 90 degrees so it reads as a toy). */
export const TOPPLE_ANGLE = 1.4;

/** Door swing angle when open (about 100 degrees, toward the viewer). */
export const DOOR_OPEN_ANGLE = -1.75;
