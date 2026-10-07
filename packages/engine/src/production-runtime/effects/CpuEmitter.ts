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
  state.px[i] = d.origin[0] + Math.cos(theta) * 0.05;
  state.py[i] = d.origin[1];
  state.pz[i] = d.origin[2] + Math.sin(theta) * 0.05;
  state.vx[i] = dx * speed;
  state.vy[i] = dy * speed;
  state.vz[i] = dz * speed;
  state.age[i] = 0;
  state.life[i] = d.life[0] + (d.life[1] - d.life[0]) * next(state);
  state.size[i] = d.size[0] + (d.size[1] - d.size[0]) * next(state);
  state.seedA[i] = next(state);
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
    i++;
  }
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
    out[o + 3] = state.size[i];
    out[o + 4] = state.vx[i];
    out[o + 5] = state.vy[i];
    out[o + 6] = state.vz[i];
    out[o + 7] = d.stretch;
    const lifeT = state.life[i] > 0 ? state.age[i] / state.life[i] : 1;
    const fadeIn = Math.min(1, lifeT * 8);
    const fadeOut = Math.min(1, (1 - lifeT) * 4);
    const a = d.alpha * fadeIn * fadeOut;
    out[o + 8] = d.color[0];
    out[o + 9] = d.color[1];
    out[o + 10] = d.color[2];
    out[o + 11] = a;
    out[o + 12] = state.seedA[i] * Math.PI * 2 + state.age[i] * d.spin; // rotation
    out[o + 13] = 0;                                                   // frame
    out[o + 14] = 1;                                                   // fog participation
    out[o + 15] = 0;                                                   // normalMix
  }
  return live;
}
