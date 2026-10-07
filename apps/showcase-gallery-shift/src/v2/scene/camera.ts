// apps/showcase-gallery-shift/src/v2/scene/camera.ts — the chase rig.
// Trails the thief from a raised behind-the-shoulder chase offset that eases
// around to face the thief's movement heading (separate 0.28 s yaw halflife so
// door turns don't whip the frame), and dips toward a top-down read when the
// player pauses inside a room. At offset length ≈ 11.7 m / fov 52, the 2.7 m
// infiltrator holds ≈ 0.24 of frame height — inside the direction's
// [0.15, 0.30] subject band.
import { camera } from "@aura3d/engine";
import type { AuraCameraPose } from "@aura3d/engine/contracts";

export const GALLERY_CAMERA_FOV = 52;
/** Behind-above chase offset (local space; +Z trails behind heading). */
export const GALLERY_CHASE_OFFSET: readonly [number, number, number] = [0, 9.5, 6.8];
export const GALLERY_CAMERA_DISTANCE = Math.hypot(GALLERY_CHASE_OFFSET[1], GALLERY_CHASE_OFFSET[2]);
/** Look lead along the facing direction and target height on the thief. */
const LOOK_LEAD = 1.15;
const LOOK_HEIGHT = 1.05;
const YAW_HALFLIFE = 0.28;

export interface GalleryRigState {
  /** Live thief position (authoritative gameplay truth). */
  readonly thiefX: number;
  readonly thiefZ: number;
  /** Blended facing yaw (the P0 move-direction heading). */
  readonly facingYaw: number;
  /** True when the thief is mid-move — locks the lead to the heading. */
  readonly moving: boolean;
}

const wrapAngle = (angle: number) => {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
};

export function galleryPoseFor(state: GalleryRigState, cameraYaw: number): AuraCameraPose {
  const [ox, oy, oz] = GALLERY_CHASE_OFFSET;
  const cos = Math.cos(cameraYaw);
  const sin = Math.sin(cameraYaw);
  const position: [number, number, number] = [
    state.thiefX + ox * cos + oz * sin,
    oy,
    state.thiefZ - ox * sin + oz * cos
  ];
  const target: [number, number, number] = [
    state.thiefX + Math.sin(state.facingYaw) * LOOK_LEAD,
    LOOK_HEIGHT,
    state.thiefZ + Math.cos(state.facingYaw) * LOOK_LEAD
  ];
  return { position, target, up: [0, 1, 0], roll: 0, fov: GALLERY_CAMERA_FOV, near: 0.05, far: 160 };
}

export function createGalleryRig(rigState: GalleryRigState, seedYaw = 0) {
  let cameraYaw = seedYaw;
  return {
    id: "gallery-shift.chase",
    update(dt: number): AuraCameraPose {
      const step = Math.max(0, Math.min(dt, 0.1));
      // Ease the rig around toward the thief's heading only while it moves;
      // a stopped thief keeps the last chase side so the frame stays calm.
      if (rigState.moving) {
        const shortest = wrapAngle(rigState.facingYaw - cameraYaw);
        cameraYaw += shortest * (1 - Math.exp(-Math.LN2 * step / YAW_HALFLIFE));
      }
      return galleryPoseFor(rigState, cameraYaw);
    },
    reset(pose?: AuraCameraPose) {
      void pose;
      cameraYaw = rigState.facingYaw;
    },
    cameraYaw() {
      return cameraYaw;
    }
  };
}

export function galleryCameraSpec() {
  return camera.perspective({
    position: [0, GALLERY_CHASE_OFFSET[1], 4.55 + GALLERY_CHASE_OFFSET[2]],
    target: [0, LOOK_HEIGHT, 4.55],
    fov: GALLERY_CAMERA_FOV
  });
}
