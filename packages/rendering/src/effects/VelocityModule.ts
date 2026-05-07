import type { ParticleModule, ParticleUpdateContext } from "./ParticleModule.js";
import type { Particle, Vector3Like } from "./Particle.js";

export interface VectorKeyframe {
  time: number;
  value: Vector3Like;
}

function validateKeyframes(keyframes: readonly VectorKeyframe[]): void {
  if (keyframes.length === 0) {
    throw new RangeError("VelocityModule requires at least one keyframe.");
  }

  let previous = -Number.POSITIVE_INFINITY;
  for (const keyframe of keyframes) {
    if (keyframe.time < 0 || keyframe.time > 1 || keyframe.time < previous) {
      throw new RangeError("VelocityModule keyframe times must be sorted in the normalized range [0, 1].");
    }
    previous = keyframe.time;
  }
}

function sampleVectorKeyframes(keyframes: readonly VectorKeyframe[], time: number): Vector3Like {
  if (time <= keyframes[0].time) {
    return { ...keyframes[0].value };
  }

  for (let index = 1; index < keyframes.length; index += 1) {
    const next = keyframes[index];
    if (time <= next.time) {
      const previous = keyframes[index - 1];
      const span = next.time - previous.time || 1;
      const alpha = (time - previous.time) / span;

      return {
        x: previous.value.x + (next.value.x - previous.value.x) * alpha,
        y: previous.value.y + (next.value.y - previous.value.y) * alpha,
        z: previous.value.z + (next.value.z - previous.value.z) * alpha,
      };
    }
  }

  return { ...keyframes[keyframes.length - 1].value };
}

export class VelocityModule implements ParticleModule {
  readonly name = "VelocityModule";
  readonly keyframes: readonly VectorKeyframe[];
  readonly mode: "replace" | "add";

  constructor(keyframes: readonly VectorKeyframe[], mode: "replace" | "add" = "replace") {
    this.keyframes = keyframes;
    this.mode = mode;
    validateKeyframes(keyframes);
  }

  update(particle: Particle, context: ParticleUpdateContext): void {
    const velocity = sampleVectorKeyframes(this.keyframes, context.normalizedAge);

    if (this.mode === "add") {
      particle.velocity.x += velocity.x;
      particle.velocity.y += velocity.y;
      particle.velocity.z += velocity.z;
      return;
    }

    particle.velocity.x = velocity.x;
    particle.velocity.y = velocity.y;
    particle.velocity.z = velocity.z;
  }
}

export function constantVelocity(value: Vector3Like, mode: "replace" | "add" = "replace"): VelocityModule {
  return new VelocityModule([{ time: 0, value }], mode);
}
