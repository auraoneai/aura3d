import { type ColorLike } from "./Particle.js";
import type { ParticleModule, ParticleUpdateContext } from "./ParticleModule.js";
import type { Particle } from "./Particle.js";

export interface ColorKeyframe {
  time: number;
  color: ColorLike;
}

function validateGradient(keyframes: readonly ColorKeyframe[]): void {
  if (keyframes.length === 0) {
    throw new RangeError("ColorModule requires at least one color keyframe.");
  }

  let previous = -Number.POSITIVE_INFINITY;
  for (const keyframe of keyframes) {
    if (keyframe.time < 0 || keyframe.time > 1 || keyframe.time < previous) {
      throw new RangeError("ColorModule keyframe times must be sorted in the normalized range [0, 1].");
    }
    previous = keyframe.time;
  }
}

export function sampleColorGradient(keyframes: readonly ColorKeyframe[], time: number): ColorLike {
  if (time <= keyframes[0].time) {
    return { ...keyframes[0].color };
  }

  for (let index = 1; index < keyframes.length; index += 1) {
    const next = keyframes[index];
    if (time <= next.time) {
      const previous = keyframes[index - 1];
      const span = next.time - previous.time || 1;
      const alpha = (time - previous.time) / span;

      return {
        r: previous.color.r + (next.color.r - previous.color.r) * alpha,
        g: previous.color.g + (next.color.g - previous.color.g) * alpha,
        b: previous.color.b + (next.color.b - previous.color.b) * alpha,
        a: previous.color.a + (next.color.a - previous.color.a) * alpha,
      };
    }
  }

  return { ...keyframes[keyframes.length - 1].color };
}

export class ColorModule implements ParticleModule {
  readonly name = "ColorModule";
  readonly gradient: readonly ColorKeyframe[];

  constructor(gradient: readonly ColorKeyframe[]) {
    this.gradient = gradient;
    validateGradient(gradient);
  }

  update(particle: Particle, context: ParticleUpdateContext): void {
    particle.color = sampleColorGradient(this.gradient, context.normalizedAge);
  }
}
