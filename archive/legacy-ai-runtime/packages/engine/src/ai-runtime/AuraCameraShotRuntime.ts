import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "@aura3d/rendering";
import type { AuraCameraPlan, AuraShotPlan, AuraVec3 } from "@aura3d/ai-scene";

export type AuraCameraShotMovement =
  | "locked"
  | "dolly-in"
  | "orbit"
  | "pan-tilt"
  | "establishing"
  | "close-up"
  | "hero-reveal"
  | "target-tracking";

export type AuraCameraFramingRule = "rule-of-thirds" | "close-up" | "medium-shot" | "over-shoulder" | "low-angle";

export interface AuraCameraShotSample {
  readonly timeSeconds: number;
  readonly normalizedTime: number;
  readonly movement: AuraCameraShotMovement;
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly fovDegrees: number;
  readonly focalLengthMm: number;
  readonly framingRules: readonly AuraCameraFramingRule[];
}

export interface AuraCameraShotRuntime {
  readonly id: string;
  readonly cameraId: string;
  readonly movement: AuraCameraShotMovement;
  readonly durationSeconds: number;
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
  sample(timeSeconds: number): AuraCameraShotSample;
  reset(): AuraCameraShotSample;
}

export function createAuraCameraShotRuntime(input: {
  readonly camera: AuraCameraPlan;
  readonly shot: AuraShotPlan;
  readonly framingRules?: readonly AuraCameraFramingRule[];
}): AuraCameraShotRuntime {
  const movement = normalizeMovement(input.shot);
  const durationSeconds = Math.max(0.001, input.shot.endSeconds - input.shot.startSeconds);
  const sample = (timeSeconds: number): AuraCameraShotSample => {
    const normalizedTime = clamp01((timeSeconds - input.shot.startSeconds) / durationSeconds);
    return {
      timeSeconds,
      normalizedTime,
      movement,
      position: samplePosition(input.camera.position, input.camera.target, movement, normalizedTime),
      target: sampleTarget(input.camera.target, movement, normalizedTime),
      fovDegrees: sampleFov(input.camera.fovDegrees, movement, normalizedTime),
      focalLengthMm: input.camera.focalLengthMm,
      framingRules: input.framingRules ?? inferFramingRules(movement)
    };
  };
  return {
    id: input.shot.id,
    cameraId: input.camera.id,
    movement,
    durationSeconds,
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: `camera:${input.shot.id}`,
      feature: "camera",
      label: `Camera shot ${input.shot.id}`,
      source: "renderer-camera",
      diagnostics: [`Camera movement '${movement}' is sampled as runtime camera state, not orbit-control product framing.`]
    }),
    sample,
    reset() {
      return sample(input.shot.startSeconds);
    }
  };
}

function normalizeMovement(shot: AuraShotPlan): AuraCameraShotMovement {
  const text = `${shot.movement} ${shot.label} ${shot.notes}`.toLowerCase();
  if (text.includes("establish")) return "establishing";
  if (text.includes("close")) return "close-up";
  if (text.includes("reveal")) return "hero-reveal";
  if (text.includes("track")) return "target-tracking";
  if (text.includes("pan") || text.includes("tilt")) return "pan-tilt";
  if (shot.movement === "push-in" || text.includes("dolly")) return "dolly-in";
  if (shot.movement === "orbit") return "orbit";
  return "locked";
}

function samplePosition(position: AuraVec3, target: AuraVec3, movement: AuraCameraShotMovement, t: number): AuraVec3 {
  const dx = position[0] - target[0];
  const dz = position[2] - target[2];
  const distance = Math.hypot(dx, dz) || 1;
  if (movement === "dolly-in" || movement === "hero-reveal" || movement === "close-up") {
    const factor = movement === "close-up" ? 0.58 : 0.76;
    return [target[0] + dx * (1 - t * (1 - factor)), position[1], target[2] + dz * (1 - t * (1 - factor))];
  }
  if (movement === "orbit") {
    const angle = Math.atan2(dz, dx) + t * Math.PI * 0.42;
    return [target[0] + Math.cos(angle) * distance, position[1] + Math.sin(t * Math.PI) * 0.18, target[2] + Math.sin(angle) * distance];
  }
  if (movement === "establishing") {
    return [position[0] * (1.16 - t * 0.16), position[1] + 0.35 * (1 - t), position[2] * (1.18 - t * 0.18)];
  }
  if (movement === "target-tracking") {
    return [position[0] + (t - 0.5) * 0.36, position[1], position[2]];
  }
  return position;
}

function sampleTarget(target: AuraVec3, movement: AuraCameraShotMovement, t: number): AuraVec3 {
  if (movement === "pan-tilt") return [target[0] + (t - 0.5) * 0.5, target[1] + Math.sin(t * Math.PI) * 0.18, target[2]];
  if (movement === "hero-reveal") return [target[0], target[1] + t * 0.2, target[2]];
  return target;
}

function sampleFov(fovDegrees: number, movement: AuraCameraShotMovement, t: number): number {
  if (movement === "close-up") return Math.max(18, fovDegrees - t * 8);
  if (movement === "establishing") return Math.min(70, fovDegrees + (1 - t) * 8);
  return fovDegrees;
}

function inferFramingRules(movement: AuraCameraShotMovement): readonly AuraCameraFramingRule[] {
  if (movement === "close-up") return ["close-up", "rule-of-thirds"];
  if (movement === "establishing") return ["medium-shot", "rule-of-thirds"];
  if (movement === "hero-reveal") return ["low-angle", "rule-of-thirds"];
  return ["medium-shot", "rule-of-thirds"];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
