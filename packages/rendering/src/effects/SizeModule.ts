import type { Particle } from "./Particle.js";
import type { ParticleModule, ParticleUpdateContext } from "./ParticleModule.js";

export interface SizeKeyframe {
  time: number;
  size: number;
}

function validateCurve(keyframes: readonly SizeKeyframe[]): void {
  if (keyframes.length === 0) {
    throw new RangeError("SizeModule requires at least one size keyframe.");
  }

  let previous = -Number.POSITIVE_INFINITY;
  for (const keyframe of keyframes) {
    if (keyframe.time < 0 || keyframe.time > 1 || keyframe.time < previous) {
      throw new RangeError("SizeModule keyframe times must be sorted in the normalized range [0, 1].");
    }
    if (!Number.isFinite(keyframe.size) || keyframe.size < 0) {
      throw new RangeError("SizeModule keyframe sizes must be finite non-negative numbers.");
    }
    previous = keyframe.time;
  }
}

export function sampleSizeCurve(keyframes: readonly SizeKeyframe[], time: number): number {
  if (time <= keyframes[0].time) {
    return keyframes[0].size;
  }

  for (let index = 1; index < keyframes.length; index += 1) {
    const next = keyframes[index];
    if (time <= next.time) {
      const previous = keyframes[index - 1];
      const span = next.time - previous.time || 1;
      const alpha = (time - previous.time) / span;
      return previous.size + (next.size - previous.size) * alpha;
    }
  }

  return keyframes[keyframes.length - 1].size;
}

/** Pack a size-over-life curve into a fixed-stop LUT for the compute kernel. */
export function encodeSizeCurveLUT(keyframes: readonly SizeKeyframe[], stops = 16): Float32Array {
  validateCurve(keyframes);
  if (!Number.isInteger(stops) || stops < 2 || stops > 64) {
    throw new RangeError("Size curve LUT stops must be an integer in [2, 64].");
  }
  const lut = new Float32Array(stops);
  for (let index = 0; index < stops; index += 1) {
    lut[index] = sampleSizeCurve(keyframes, stops === 1 ? 0 : index / (stops - 1));
  }
  return lut;
}

export class SizeModule implements ParticleModule {
  readonly name = "SizeModule";
  readonly supportsGPU = true;
  readonly curve: readonly SizeKeyframe[];

  constructor(curve: readonly SizeKeyframe[]) {
    this.curve = curve;
    validateCurve(curve);
  }

  update(particle: Particle, context: ParticleUpdateContext): void {
    particle.size = sampleSizeCurve(this.curve, context.normalizedAge);
  }

  toGPUSizeCurve(stops = 16): Float32Array {
    return encodeSizeCurveLUT(this.curve, stops);
  }
}
