export type Vec3Tuple = [number, number, number];

export interface DampResult {
  readonly value: number;
  readonly velocity: number;
}

/** Critically damped follow (no overshoot, frame-rate independent). `smoothTime` is the time to reach about 95% of the way. */
export function smoothDamp(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  dt: number,
  maxSpeed = Number.POSITIVE_INFINITY
): DampResult {
  if (!(dt > 0)) return { value: current, velocity };
  const st = Math.max(1e-4, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const maxChange = maxSpeed * st;
  const change = Math.max(-maxChange, Math.min(maxChange, current - target));
  const clampedTarget = current - change;
  const temp = (velocity + omega * change) * dt;
  let nextVelocity = (velocity - omega * temp) * exp;
  let value = clampedTarget + (change + temp) * exp;
  if (target - current > 0 === value > target) {
    value = target;
    nextVelocity = (value - target) / dt;
  }
  return { value, velocity: nextVelocity };
}

export interface SmoothFollow3 {
  readonly position: Vec3Tuple;
  readonly velocity: Vec3Tuple;
  step(target: readonly [number, number, number], dt: number): Vec3Tuple;
  snap(target: readonly [number, number, number]): void;
}

export function createSmoothFollow3(
  start: readonly [number, number, number],
  options: { readonly smoothTime: number; readonly maxSpeed?: number }
): SmoothFollow3 {
  const position: Vec3Tuple = [start[0], start[1], start[2]];
  const velocity: Vec3Tuple = [0, 0, 0];
  return {
    position,
    velocity,
    step(target, dt) {
      for (let i = 0; i < 3; i += 1) {
        const r = smoothDamp(position[i]!, target[i]!, velocity[i]!, options.smoothTime, dt, options.maxSpeed);
        position[i] = r.value;
        velocity[i] = r.velocity;
      }
      return position;
    },
    snap(target) {
      position[0] = target[0];
      position[1] = target[1];
      position[2] = target[2];
      velocity[0] = velocity[1] = velocity[2] = 0;
    }
  };
}

export function lerpAngle(a: number, b: number, t: number): number {
  const twoPi = Math.PI * 2;
  let d = (b - a) % twoPi;
  if (d > Math.PI) d -= twoPi;
  else if (d < -Math.PI) d += twoPi;
  return a + d * t;
}

/** Render-time interpolation between the last two fixed simulation states. */
export interface RenderInterpolator<T> {
  push(state: T): void;
  sample(alpha: number): T | undefined;
  reset(state?: T): void;
}

export function createRenderInterpolator<T>(lerp: (a: T, b: T, t: number) => T): RenderInterpolator<T> {
  let prev: T | undefined;
  let curr: T | undefined;
  return {
    push(state) {
      prev = curr ?? state;
      curr = state;
    },
    sample(alpha) {
      if (curr === undefined) return undefined;
      if (prev === undefined) return curr;
      return lerp(prev, curr, Math.max(0, Math.min(1, alpha)));
    },
    reset(state) {
      prev = state;
      curr = state;
    }
  };
}

/** RMS of the second difference of a uniformly sampled series: near 0 for smooth motion, large for jitter. */
export function secondDifferenceRms(samples: readonly number[]): number {
  if (samples.length < 3) return 0;
  let sum = 0;
  for (let i = 2; i < samples.length; i += 1) {
    const d2 = samples[i]! - 2 * samples[i - 1]! + samples[i - 2]!;
    sum += d2 * d2;
  }
  return Math.sqrt(sum / (samples.length - 2));
}

export interface JitterReport {
  readonly rms: number;
  readonly max: number;
  readonly passed: boolean;
}

export function jitterReport(samples: readonly number[], threshold: number): JitterReport {
  let max = 0;
  for (let i = 2; i < samples.length; i += 1) {
    max = Math.max(max, Math.abs(samples[i]! - 2 * samples[i - 1]! + samples[i - 2]!));
  }
  const rms = secondDifferenceRms(samples);
  return { rms, max, passed: rms <= threshold };
}
