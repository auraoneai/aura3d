// apps/showcase-pulse-tunnel/src/v2/scene/camera.ts — chase rig (T2.3).
// §6.9.9 rig "chase": low camera behind the drone looking down the tunnel;
// the eye drifts a fraction of the player's lane/jump offsets so the craft
// stays ~0.2 of frame height and incoming gates stay readable. FOV 62 sits
// inside the authored [55, 75] band.
import { camera, type AuraCameraPose, type AuraCameraRig, type AuraCameraRigContext } from "@aura3d/engine";
import { PULSE_PLAYER_Z } from "../../gameplay/gates";

const EYE_Z = PULSE_PLAYER_Z + 2.6;
const EYE_Y = 0.85;
const TARGET_Z = -8;
const TARGET_Y = 0.4;
const FOV = 62;
// Partial follow: eye tracks 40% of the lateral offset and 55% of the jump
// rise; the target leads the player so lane switches still read ahead.
const EYE_X_FRACTION = 0.4;
const EYE_Y_FRACTION = 0.55;
const TARGET_X_FRACTION = 0.55;
const TARGET_Y_FRACTION = 0.45;

export interface PulseRigState {
  x: number;
  y: number;
}

export function createPulseRig(state: PulseRigState): AuraCameraRig {
  const pose: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
    up: [number, number, number];
    roll: number;
  } = {
    position: [0, EYE_Y, EYE_Z],
    target: [0, TARGET_Y, TARGET_Z],
    fov: FOV,
    up: [0, 1, 0],
    roll: 0
  };

  return {
    id: "pulse-tunnel.chase",
    reset: () => {
      pose.position = [0, EYE_Y, EYE_Z];
      pose.target = [0, TARGET_Y, TARGET_Z];
    },
    update(ctx: AuraCameraRigContext): AuraCameraPose {
      const dt = Math.min(Math.max(ctx.dt, 0.001), 0.1);
      const k = Math.min(1, dt / 0.1);
      pose.position[0] += (state.x * EYE_X_FRACTION - pose.position[0]) * k;
      pose.position[1] += (EYE_Y + state.y * EYE_Y_FRACTION - pose.position[1]) * k;
      pose.target[0] += (state.x * TARGET_X_FRACTION - pose.target[0]) * k;
      pose.target[1] += (TARGET_Y + state.y * TARGET_Y_FRACTION - pose.target[1]) * k;
      return { ...pose, near: 0.1, far: 120 };
    }
  };
}

export function fallbackCameraNode() {
  return camera.perspective({
    position: [0, EYE_Y, EYE_Z],
    target: [0, TARGET_Y, TARGET_Z],
    fov: FOV
  });
}
