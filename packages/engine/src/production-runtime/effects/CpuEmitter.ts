// PRD-07 P1-T14 — deterministic CPU particle emitter (PRD-07 §6.3).
// Fixed-step, seeded (mulberry32), writes the §6.2.1 16-float layout directly.
// Deterministic: same seed + same step sequence = same instances.

export type AuraVec3 = readonly [number, number, number];

export interface EmitterDescriptor {
  readonly key: string;
  readonly nodeId: string;
  readonly origin: AuraVec3;
  readonly capacity: number;
  readonly emissionRate: number;      // particles/second
  readonly life: readonly [number, number]; // min,max seconds
  readonly speed: readonly [number, number];
  readonly spread: number;            // 0 = straight up, 1 = sphere
  readonly direction: AuraVec3;
  readonly gravity: number;           // y accel (negative = fall)
  readonly size: readonly [number, number];
  readonly color: AuraVec3;
  readonly alpha: number;
  readonly spin: number;
  readonly stretch: number;
  readonly drag: number;
  readonly seed: number;
  /** Seconds of simulation applied at creation (steady-state at t=0, capped at 30s). */
  readonly prewarm?: number;
  /** One-shot particles spawned at t=0 (effects.burst); emissionRate stays for continuous flow. */
  readonly burst?: number;
  /** Spawn disc radius (XZ, uniform by area); default 0.05 m point-ish source. */
  readonly spawnRadius?: number;
  /**
   * 5.1 spawn volume (`effects.particles({ shape, shapeSize })`). Absent keeps the `spawnRadius` disc path and its
   * exact RNG stream. `size` is the shape's extents: full box extents, otherwise radii (x for disc/ring/cone base,
   * edge length).
   */
  readonly shape?: {
    readonly kind: "point" | "sphere" | "hemisphere" | "cone" | "box" | "disc" | "ring" | "edge";
    readonly size: AuraVec3;
  };
  /** 5.1 half-angle (radians) of a uniform cone around `direction`; absent keeps the `spread` jitter. */
  readonly coneAngle?: number;
  /** 5.1 constant air drift (m/s) added to every particle's motion. */
  readonly wind?: AuraVec3;
  /** 5.1 size multiplier over normalized life, piecewise-linear across evenly spaced samples. */
  readonly sizeOverLife?: readonly number[];
  /** 5.1 alpha multiplier over normalized life; replaces the default fade-in/fade-out envelope. */
  readonly alphaOverLife?: readonly number[];
  /** 5.1 linear-RGB colour ramp over normalized life, evenly spaced; replaces `color`. */
  readonly colorOverLife?: readonly AuraVec3[];
  /**
   * Flipbook sprite (§6.2 `flipbook-sprite`): the frame advances with age at
   * `frameRate` over `frames` cells (wrapping when `loop`), the sprite keeps
   * full alpha (no life fade) and an upright billboard (no random rotation).
   */
  readonly flipbook?: {
    readonly frames: number;
    readonly frameRate: number;
    readonly loop: boolean;
    /** Sheet grid + seed — the feeder builds the built-in sheet from these. */
    readonly columns?: number;
    readonly rows?: number;
    readonly seed?: number;
  };
}

export interface EmitterState {
  desc: EmitterDescriptor;
  live: number;
  emitRemainder: number;
  rng: number;
  /** Interleaved particle fields (parallel to instance data packing). */
  px: Float32Array; py: Float32Array; pz: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  age: Float32Array; life: Float32Array; size: Float32Array;
  seedA: Float32Array;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEmitter(desc: EmitterDescriptor): EmitterState {
  const n = Math.max(1, desc.capacity);
  const state: EmitterState = {
    desc,
    live: 0,
    emitRemainder: 0,
    rng: desc.seed >>> 0,
    px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n),
    vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
    age: new Float32Array(n), life: new Float32Array(n), size: new Float32Array(n),
    seedA: new Float32Array(n)
  };
  const burstCount = Math.min(desc.burst ?? 0, n);
  for (let i = 0; i < burstCount; i++) spawn(state);
  if (desc.prewarm && desc.prewarm > 0) {
    // Same fixed-step path as live sim so prewarmed state is identical to an
    // emitter that ran for `prewarm` seconds.
    const steps = Math.min(Math.ceil(Math.min(desc.prewarm, 30) * 60), 1800);
    for (let i = 0; i < steps; i++) stepEmitter(state, 1 / 60);
  }
  return state;
}

function next(state: EmitterState): number {
  // inline mulberry32 on the stored state word — allocation-free stepping.
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(state.rng ^ (state.rng >>> 15), 1 | state.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function spawn(state: EmitterState): void {
  if (state.live >= state.desc.capacity) return;
  const i = state.live++;
  const d = state.desc;
  const r = next(state);
  const theta = next(state) * Math.PI * 2;
  const spread = d.spread;
  // Cone around desc.direction: jitter ±spread.
  const jx = (next(state) - 0.5) * 2 * spread;
  const jy = (next(state) - 0.5) * 2 * spread;
  const jz = (next(state) - 0.5) * 2 * spread;
  let dx = d.direction[0] + jx;
  let dy = d.direction[1] + jy;
  let dz = d.direction[2] + jz;
  const dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl; dy /= dl; dz /= dl;
  const speed = d.speed[0] + (d.speed[1] - d.speed[0]) * r;
  // Disc spawn: sqrt of a uniform keeps density uniform by area. The default
  // path consumes no extra RNG so seeded streams without a disc are unchanged.
  const spawnR = d.spawnRadius !== undefined && d.spawnRadius > 0 ? Math.sqrt(next(state)) * d.spawnRadius : 0.05;
  state.px[i] = d.origin[0] + Math.cos(theta) * spawnR;
  state.py[i] = d.origin[1];
  state.pz[i] = d.origin[2] + Math.sin(theta) * spawnR;
  state.vx[i] = dx * speed;
  state.vy[i] = dy * speed;
  state.vz[i] = dz * speed;
  state.age[i] = 0;
  state.life[i] = d.life[0] + (d.life[1] - d.life[0]) * next(state);
  state.size[i] = d.size[0] + (d.size[1] - d.size[0]) * next(state);
  state.seedA[i] = next(state);
  // 5.1 extras draw after the legacy stream so emitters without them are unchanged.
  if (d.shape !== undefined) applyShape(state, i, d.shape);
  if (d.coneAngle !== undefined) applyCone(state, i, speed, d.coneAngle);
}

function applyShape(state: EmitterState, i: number, shape: NonNullable<EmitterDescriptor["shape"]>): void {
  const d = state.desc;
  const [sx, sy, sz] = shape.size;
  let ox = 0; let oy = 0; let oz = 0;
  switch (shape.kind) {
    case "point": break;
    case "box":
      ox = (next(state) - 0.5) * sx; oy = (next(state) - 0.5) * sy; oz = (next(state) - 0.5) * sz;
      break;
    case "sphere":
    case "hemisphere": {
      // Uniform in the unit ball by rejection-free direction + cube-root radius.
      const u = next(state) * 2 - 1;
      const phi = next(state) * Math.PI * 2;
      const rad = Math.cbrt(next(state));
      const ring = Math.sqrt(Math.max(0, 1 - u * u));
      ox = ring * Math.cos(phi) * rad * sx;
      oy = (shape.kind === "hemisphere" ? Math.abs(u) : u) * rad * sy;
      oz = ring * Math.sin(phi) * rad * sz;
      break;
    }
    case "cone":
    case "disc": {
      const a = next(state) * Math.PI * 2;
      const rad = Math.sqrt(next(state)) * sx;
      ox = Math.cos(a) * rad; oz = Math.sin(a) * rad;
      break;
    }
    case "ring": {
      const a = next(state) * Math.PI * 2;
      ox = Math.cos(a) * sx; oz = Math.sin(a) * sx;
      break;
    }
    case "edge":
      ox = (next(state) - 0.5) * sx;
      break;
  }
  state.px[i] = d.origin[0] + ox;
  state.py[i] = d.origin[1] + oy;
  state.pz[i] = d.origin[2] + oz;
}

/** Re-aim the spawned velocity uniformly inside a cone of `halfAngle` around the descriptor direction. */
function applyCone(state: EmitterState, i: number, speed: number, halfAngle: number): void {
  const d = state.desc;
  const dl = Math.hypot(d.direction[0], d.direction[1], d.direction[2]) || 1;
  const ax = d.direction[0] / dl; const ay = d.direction[1] / dl; const az = d.direction[2] / dl;
  const cosMax = Math.cos(Math.max(0, Math.min(Math.PI, halfAngle)));
  const cosT = 1 - next(state) * (1 - cosMax);
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
  const phi = next(state) * Math.PI * 2;
  // Orthonormal basis (t1, t2) perpendicular to the axis.
  const hx = Math.abs(ay) < 0.99 ? 0 : 1; const hy = Math.abs(ay) < 0.99 ? 1 : 0;
  let t1x = hy * az; let t1y = -hx * az; let t1z = hx * ay - hy * ax;
  const t1l = Math.hypot(t1x, t1y, t1z) || 1;
  t1x /= t1l; t1y /= t1l; t1z /= t1l;
  const t2x = ay * t1z - az * t1y; const t2y = az * t1x - ax * t1z; const t2z = ax * t1y - ay * t1x;
  const c = Math.cos(phi) * sinT; const sn = Math.sin(phi) * sinT;
  state.vx[i] = (ax * cosT + t1x * c + t2x * sn) * speed;
  state.vy[i] = (ay * cosT + t1y * c + t2y * sn) * speed;
  state.vz[i] = (az * cosT + t1z * c + t2z * sn) * speed;
}

/** Piecewise-linear sample of evenly spaced values at t in [0, 1]. */
export function sampleCurve(curve: readonly number[], t: number): number {
  const n = curve.length;
  if (n === 0) return 1;
  if (n === 1) return curve[0]!;
  const f = Math.min(1, Math.max(0, t)) * (n - 1);
  const k = Math.min(n - 2, Math.floor(f));
  const w = f - k;
  return curve[k]! * (1 - w) + curve[k + 1]! * w;
}

/** Fixed-step advance; kills expired, emits at rate, integrates. */
export function stepEmitter(state: EmitterState, dt: number): void {
  const d = state.desc;
  state.emitRemainder += d.emissionRate * dt;
  while (state.emitRemainder >= 1) {
    state.emitRemainder -= 1;
    spawn(state);
  }
  let i = 0;
  while (i < state.live) {
    state.age[i] += dt;
    if (state.age[i] >= state.life[i]) {
      // swap-remove with the last live particle (order within batch irrelevant
      // to the renderer; deterministic because the RNG order is untouched).
      const last = --state.live;
      state.px[i] = state.px[last]; state.py[i] = state.py[last]; state.pz[i] = state.pz[last];
      state.vx[i] = state.vx[last]; state.vy[i] = state.vy[last]; state.vz[i] = state.vz[last];
      state.age[i] = state.age[last]; state.life[i] = state.life[last];
      state.size[i] = state.size[last]; state.seedA[i] = state.seedA[last];
      continue;
    }
    const drag = Math.max(0, 1 - d.drag * dt);
    state.vx[i] *= drag;
    state.vy[i] = state.vy[i] * drag + d.gravity * dt;
    state.vz[i] *= drag;
    state.px[i] += state.vx[i] * dt;
    state.py[i] += state.vy[i] * dt;
    state.pz[i] += state.vz[i] * dt;
    if (d.wind !== undefined) {
      state.px[i] += d.wind[0] * dt;
      state.py[i] += d.wind[1] * dt;
      state.pz[i] += d.wind[2] * dt;
    }
    i++;
  }
}

function flipbookFrame(fb: NonNullable<EmitterDescriptor["flipbook"]>, age: number): number {
  const frames = Math.max(1, fb.frames);
  const f = Math.max(0, age * fb.frameRate);
  return fb.loop ? f % frames : Math.min(f, frames - 1);
}

/**
 * Pack live particles into the §6.2.1 16-float layout. `out` must be at least
 * state.live * 16 floats. Returns live count written.
 */
export function writeEmitterInstances(state: EmitterState, out: Float32Array): number {
  const live = state.live;
  const d = state.desc;
  for (let i = 0; i < live; i++) {
    const o = i * 16;
    out[o] = state.px[i];
    out[o + 1] = state.py[i];
    out[o + 2] = state.pz[i];
    const lifeT = state.life[i] > 0 ? state.age[i] / state.life[i] : 1;
    out[o + 3] = d.sizeOverLife ? state.size[i] * sampleCurve(d.sizeOverLife, lifeT) : state.size[i];
    out[o + 4] = state.vx[i];
    out[o + 5] = state.vy[i];
    out[o + 6] = state.vz[i];
    out[o + 7] = d.stretch;
    const fb = d.flipbook;
    const fadeIn = Math.min(1, lifeT * 8);
    const fadeOut = Math.min(1, (1 - lifeT) * 4);
    const a = fb ? d.alpha : d.alphaOverLife ? d.alpha * sampleCurve(d.alphaOverLife, lifeT) : d.alpha * fadeIn * fadeOut;
    if (d.colorOverLife && d.colorOverLife.length > 0) {
      const ramp = d.colorOverLife;
      const rf = Math.min(1, Math.max(0, lifeT)) * (ramp.length - 1);
      const rk = Math.min(Math.max(0, ramp.length - 2), Math.floor(rf));
      const rw = ramp.length > 1 ? rf - rk : 0;
      const c0 = ramp[rk]!; const c1 = ramp[Math.min(ramp.length - 1, rk + 1)]!;
      out[o + 8] = c0[0] * (1 - rw) + c1[0] * rw;
      out[o + 9] = c0[1] * (1 - rw) + c1[1] * rw;
      out[o + 10] = c0[2] * (1 - rw) + c1[2] * rw;
    } else {
      out[o + 8] = d.color[0];
      out[o + 9] = d.color[1];
      out[o + 10] = d.color[2];
    }
    out[o + 11] = a;
    out[o + 12] = fb ? 0 : state.seedA[i] * Math.PI * 2 + state.age[i] * d.spin; // rotation
    out[o + 13] = fb ? flipbookFrame(fb, state.age[i]) : 0;            // frame (fraction = blend)
    out[o + 14] = 1;                                                   // fog participation
    out[o + 15] = 0;                                                   // normalMix
  }
  return live;
}
