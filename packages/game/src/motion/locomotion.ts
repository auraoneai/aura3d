export interface LocomotionGait {
  readonly name: string;
  /** Ground speed in m/s that the clip's root travels at playback rate 1. 0 for idle. */
  readonly speed: number;
  /** Seconds for one full stride cycle at playback rate 1. */
  readonly cycle: number;
}

export interface LocomotionOptions {
  readonly gaits: readonly LocomotionGait[];
  /** Weight change per second when blending between gaits (default 6). */
  readonly blendRate?: number;
  readonly minRate?: number;
  readonly maxRate?: number;
}

export interface LocomotionFrame {
  readonly weights: Readonly<Record<string, number>>;
  readonly rates: Readonly<Record<string, number>>;
  /** Stride phase of the dominant gait, 0 to 1. */
  readonly phase: number;
  readonly dominant: string;
  /** True when ground speed exceeds the fastest gait by more than the rate clamp can hide. */
  readonly overspeed: boolean;
}

export interface Locomotion {
  update(groundSpeed: number, dt: number): LocomotionFrame;
  reset(): void;
}

/**
 * Drives idle/walk/run/sprint clips from real ground speed so feet match the ground: clip weights
 * follow speed brackets and playback rate = speed / clip speed (clamped), so planted feet do not slide.
 */
export function createLocomotion(options: LocomotionOptions): Locomotion {
  const gaits = [...options.gaits].sort((a, b) => a.speed - b.speed);
  if (gaits.length < 2) throw new Error("LOCOMOTION_GAITS: at least an idle and one moving gait are required.");
  const blendRate = options.blendRate ?? 6;
  const minRate = options.minRate ?? 0.6;
  const maxRate = options.maxRate ?? 1.6;
  const smooth: Record<string, number> = {};
  for (const g of gaits) smooth[g.name] = g === gaits[0] ? 1 : 0;
  let phase = 0;
  let dominant = gaits[0]!.name;

  const target = (speed: number): Record<string, number> => {
    const w: Record<string, number> = {};
    for (const g of gaits) w[g.name] = 0;
    const last = gaits[gaits.length - 1]!;
    if (speed >= last.speed) {
      w[last.name] = 1;
      return w;
    }
    for (let i = 0; i < gaits.length - 1; i += 1) {
      const a = gaits[i]!;
      const b = gaits[i + 1]!;
      if (speed >= a.speed && speed <= b.speed) {
        const t = b.speed === a.speed ? 1 : (speed - a.speed) / (b.speed - a.speed);
        w[a.name] = 1 - t;
        w[b.name] = t;
        return w;
      }
    }
    w[gaits[0]!.name] = 1;
    return w;
  };

  return {
    update(groundSpeed, dt) {
      const speed = Math.max(0, Number.isFinite(groundSpeed) ? groundSpeed : 0);
      const want = target(speed);
      const step = Math.min(1, blendRate * Math.max(0, dt));
      let total = 0;
      for (const g of gaits) {
        smooth[g.name] = smooth[g.name]! + (want[g.name]! - smooth[g.name]!) * step;
        total += smooth[g.name]!;
      }
      const weights: Record<string, number> = {};
      for (const g of gaits) weights[g.name] = total > 0 ? smooth[g.name]! / total : 0;
      const rates: Record<string, number> = {};
      const last = gaits[gaits.length - 1]!;
      for (const g of gaits) {
        if (g.speed <= 0) rates[g.name] = 1;
        else rates[g.name] = Math.max(minRate, Math.min(maxRate, speed / g.speed));
      }
      let best = gaits[0]!;
      for (const g of gaits) if (weights[g.name]! > weights[best.name]!) best = g;
      dominant = best.name;
      if (best.speed > 0) phase = (phase + (dt * rates[best.name]!) / best.cycle) % 1;
      return {
        weights,
        rates,
        phase,
        dominant,
        overspeed: speed > last.speed * maxRate
      };
    },
    reset() {
      for (const g of gaits) smooth[g.name] = g === gaits[0] ? 1 : 0;
      phase = 0;
    }
  };
}

export interface LegPose {
  /** Hip flexion, radians (positive swings the leg forward). */
  readonly hip: number;
  /** Knee flexion, radians (0 straight, positive bends). */
  readonly knee: number;
  readonly ankle: number;
}

export interface ProceduralGait {
  readonly left: LegPose;
  readonly right: LegPose;
  /** Arm swing, radians, opposite to the same-side leg. */
  readonly armLeft: number;
  readonly armRight: number;
  /** Vertical bob of the pelvis in metres. */
  readonly bob: number;
}

/** Procedural leg-swing fallback for rigs with no usable walk/run clip. `phase` is a 0..1 stride phase. */
export function proceduralLegSwing(phase: number, groundSpeed: number, options: { readonly maxHip?: number; readonly maxKnee?: number; readonly speedForMax?: number } = {}): ProceduralGait {
  const maxHip = options.maxHip ?? 0.7;
  const maxKnee = options.maxKnee ?? 1.2;
  const k = Math.max(0, Math.min(1, groundSpeed / (options.speedForMax ?? 6)));
  const leg = (offset: number): LegPose => {
    const a = (phase + offset) * Math.PI * 2;
    const swing = Math.sin(a);
    const lift = Math.max(0, Math.cos(a));
    return {
      hip: swing * maxHip * k,
      knee: lift * maxKnee * k,
      ankle: -swing * 0.25 * k
    };
  };
  const left = leg(0);
  const right = leg(0.5);
  return {
    left,
    right,
    armLeft: right.hip * 0.8,
    armRight: left.hip * 0.8,
    bob: Math.abs(Math.sin(phase * Math.PI * 2)) * 0.03 * k
  };
}
