// apps/showcase-mech-hangar/src/v2/scene/camera.ts — fighting rig.
// One anchor node the rig tracks: orbit yaw in the hangar (turntable drag),
// bout midpoint in the arena. Offset/fov come from the legacy review-capture
// framing — distance 5.55 at fov 52 keeps a 1.7 m fighter inside the
// direction's [0.28, 0.42] subject-height band.
import type { AuraCameraPose } from "@aura3d/engine/contracts";
import { camera } from "@aura3d/engine";

const ARENA_OFFSET: readonly [number, number, number] = [0, 1.66, 5.28];
const HANGAR_OFFSET: readonly [number, number, number] = [0, 1.62, 4.9];
export const MECH_CAMERA_FOV = 52;

export interface MechRigInput {
  /** Anchor world position (hangar chest / bout midpoint). */
  readonly anchor: readonly [number, number, number];
  /** Anchor yaw: hangar orbit yaw; 0 in the arena. */
  readonly anchorYaw: number;
  readonly mode: "hangar" | "arena";
}

export function mechPoseFor(input: MechRigInput): AuraCameraPose {
  const offset = input.mode === "hangar" ? HANGAR_OFFSET : ARENA_OFFSET;
  const cos = Math.cos(input.anchorYaw);
  const sin = Math.sin(input.anchorYaw);
  // Rotate the follow offset by anchor yaw (legacy camera.follow target-yaw mode).
  const position: [number, number, number] = [
    input.anchor[0] + offset[0] * cos + offset[2] * sin,
    input.anchor[1] + offset[1],
    input.anchor[2] - offset[0] * sin + offset[2] * cos
  ];
  return {
    position,
    target: [input.anchor[0], input.anchor[1], input.anchor[2]],
    up: [0, 1, 0],
    roll: 0,
    fov: MECH_CAMERA_FOV,
    near: 0.05,
    far: 160
  };
}

export function createMechRig(rigState: {
  anchor(): readonly [number, number, number];
  anchorYaw(): number;
  mode(): "hangar" | "arena";
}) {
  return {
    id: "mech-hangar.fighting",
    update(): AuraCameraPose {
      return mechPoseFor({ anchor: rigState.anchor(), anchorYaw: rigState.anchorYaw(), mode: rigState.mode() });
    },
    reset(_pose?: AuraCameraPose): void {}
  };
}

export const MECH_CAMERA_DISTANCE = 5.55;

export function mechCameraSpec() {
  const pose = mechPoseFor({ anchor: [0, 0.95, 0], anchorYaw: 0.62, mode: "hangar" });
  return camera.perspective({ position: pose.position, target: pose.target, fov: MECH_CAMERA_FOV });
}
