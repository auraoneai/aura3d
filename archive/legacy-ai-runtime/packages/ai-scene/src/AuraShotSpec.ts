import type { AuraVec3 } from "./AuraSceneIR.js";

export type AuraCinematicCameraMovement = "static" | "push-in" | "dolly" | "orbit" | "truck" | "crane" | "handheld";
export type AuraCinematicLensIntent = "wide" | "normal" | "portrait" | "telephoto" | "macro";

export interface AuraShotCameraSpec {
  readonly id: string;
  readonly lens: AuraCinematicLensIntent;
  readonly focalLengthMm: number;
  readonly startPosition: AuraVec3;
  readonly endPosition?: AuraVec3;
  readonly target: AuraVec3;
  readonly framing: "wide-establishing" | "medium-hero" | "close-detail" | "over-shoulder" | "low-angle";
}

export interface AuraShotSpec {
  readonly id: string;
  readonly label: string;
  readonly durationSeconds: number;
  readonly movement: AuraCinematicCameraMovement;
  readonly camera: AuraShotCameraSpec;
  readonly emotionalBeat: string;
  readonly blockingNotes: string;
}

export function hasConcreteCameraMovement(shot: Pick<AuraShotSpec, "durationSeconds" | "movement" | "camera">): boolean {
  if (!Number.isFinite(shot.durationSeconds) || shot.durationSeconds <= 0) return false;
  if (shot.movement === "static") return true;
  return Array.isArray(shot.camera.endPosition) && shot.camera.endPosition.length === 3;
}
