import type { AuraVec3 } from "./index.js";
import type { ShotCameraInstruction } from "./ShotTimeline.js";
import type { PromptAnimationId } from "./PromptAnimationContract.js";

export type CameraPresetId =
  | "establishing"
  | "medium"
  | "close-up"
  | "over-shoulder"
  | "tracking"
  | "crane"
  | "dolly-zoom"
  | "pan"
  | "two-shot"
  | string;

export interface CameraPreset {
  readonly id: CameraPresetId;
  readonly label: string;
  readonly description: string;
  readonly camera: ShotCameraInstruction;
  readonly subjectDistance: number;
  readonly fov: number;
  readonly composition: readonly string[];
}

export const cameraPresetLibrary: readonly CameraPreset[] = [
  {
    id: "establishing",
    label: "Establishing",
    description: "Wide shot that introduces the location and character staging.",
    camera: { move: "static", position: [0, 3.2, 7.5], target: [0, 1.2, 0], fov: 45 },
    subjectDistance: 7.5,
    fov: 45,
    composition: ["safe-area", "rule-of-thirds"]
  },
  {
    id: "medium",
    label: "Medium",
    description: "Waist-up dialogue framing for one or two characters.",
    camera: { move: "static", position: [0, 1.7, 4.2], target: [0, 1.25, 0], fov: 38 },
    subjectDistance: 4.2,
    fov: 38,
    composition: ["headroom", "leading-room"]
  },
  {
    id: "close-up",
    label: "Close Up",
    description: "Face-focused emotional beat with shallow framing.",
    camera: { move: "push-in", from: [0, 1.55, 2.8], to: [0, 1.55, 2.1], target: [0, 1.45, 0], fov: 32 },
    subjectDistance: 2.4,
    fov: 32,
    composition: ["headroom", "safe-area"]
  },
  {
    id: "over-shoulder",
    label: "Over Shoulder",
    description: "Dialogue shot from behind a listening character toward the speaker.",
    camera: { move: "static", position: [-1.1, 1.55, 3.2], target: [0.55, 1.35, 0], fov: 35 },
    subjectDistance: 3.4,
    fov: 35,
    composition: ["leading-room", "shot-reverse-shot"]
  },
  {
    id: "tracking",
    label: "Tracking",
    description: "Side-follow camera for walking or running blocking.",
    camera: { move: "truck", from: [-2.5, 1.6, 4], to: [2.5, 1.6, 4], target: [0, 1.2, 0], fov: 40 },
    subjectDistance: 4,
    fov: 40,
    composition: ["leading-room"]
  },
  {
    id: "crane",
    label: "Crane",
    description: "Vertical move that reveals the set scale.",
    camera: { move: "dolly", from: [0, 1.8, 5.5], to: [0, 5.5, 7.2], target: [0, 1, 0], fov: 48 },
    subjectDistance: 6.2,
    fov: 48,
    composition: ["safe-area"]
  },
  {
    id: "dolly-zoom",
    label: "Dolly Zoom",
    description: "Push/pull perspective move for surprise or realization beats.",
    camera: { move: "dolly", from: [0, 1.6, 5], to: [0, 1.6, 2.4], target: [0, 1.35, 0], fov: 55 },
    subjectDistance: 3.8,
    fov: 55,
    composition: ["headroom", "center-punch"]
  },
  {
    id: "pan",
    label: "Pan",
    description: "Horizontal reveal across a set or two-character staging.",
    camera: { move: "pan", from: [-1.4, 1.7, 4.4], to: [1.4, 1.7, 4.4], target: [0, 1.2, 0], fov: 42 },
    subjectDistance: 4.4,
    fov: 42,
    composition: ["safe-area", "leading-room"]
  },
  {
    id: "two-shot",
    label: "Two Shot",
    description: "Readable two-character dialogue framing with both performers visible.",
    camera: { move: "static", position: [0, 1.75, 4.8], target: [0, 1.25, 0], fov: 44 },
    subjectDistance: 4.8,
    fov: 44,
    composition: ["two-character-framing", "headroom", "safe-area"]
  }
];

export function getCameraPreset(id: CameraPresetId): CameraPreset | undefined {
  return cameraPresetLibrary.find((preset) => preset.id === id);
}

export function cameraPreset(id: CameraPresetId): CameraPreset {
  const preset = getCameraPreset(id);
  if (!preset) throw new Error(`Unknown camera preset: ${id}`);
  return preset;
}

export function applyCameraPreset(
  presetId: CameraPresetId,
  options: {
    readonly subjectPosition?: AuraVec3 | undefined;
    readonly focusTargetId?: PromptAnimationId | undefined;
    readonly overrides?: Partial<ShotCameraInstruction> | undefined;
  } = {}
): ShotCameraInstruction {
  const preset = cameraPreset(presetId);
  const offset = options.subjectPosition ?? [0, 0, 0];
  return {
    ...preset.camera,
    ...(preset.camera.position ? { position: addVec3(preset.camera.position, offset) } : {}),
    ...(preset.camera.target ? { target: addVec3(preset.camera.target, offset) } : {}),
    ...(preset.camera.from ? { from: addVec3(preset.camera.from, offset) } : {}),
    ...(preset.camera.to ? { to: addVec3(preset.camera.to, offset) } : {}),
    ...(options.focusTargetId ? { focusTargetId: options.focusTargetId } : {}),
    ...options.overrides
  };
}

function addVec3(a: AuraVec3, b: AuraVec3): AuraVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
