// apps/showcase-neon-swarm/src/v2/scene/camera.ts — top-down rig (T2.3).
// Route-local AuraCameraRig (direction rig "topDown"): elevated chase view
// over the courier at the §6.9.8 height/offset, eased toward a small lead
// along the live aim so shots read before they land.
import { camera } from "@aura3d/engine";
import type {
  AuraCameraPose, AuraCameraRig, AuraCameraRigContext, AuraVec3
} from "@aura3d/engine";

const OFFSET: AuraVec3 = [0, 9.1, 4.8];
const FOV = 44;
const AIM_LEAD = 1.35;

export interface SwarmRigState {
  /** Player position (x,z) and normalized aim (x,z). */
  player: { x: number; z: number };
  aim: { x: number; z: number };
}

const UP: AuraVec3 = [0, 1, 0];

export function createSwarmRig(state: SwarmRigState): AuraCameraRig {
  const eye: [number, number, number] = [0, OFFSET[1], OFFSET[2]];
  const tracked: [number, number, number] = [0, 0.4, 0];
  return {
    id: "neon-swarm.topdown",
    reset: () => {
      eye[0] = state.player.x + OFFSET[0];
      eye[1] = OFFSET[1];
      eye[2] = state.player.z + OFFSET[2];
      tracked[0] = state.player.x;
      tracked[1] = 0.4;
      tracked[2] = state.player.z;
    },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const want: AuraVec3 = [
        state.player.x + OFFSET[0],
        OFFSET[1],
        state.player.z + OFFSET[2]
      ];
      const wantTarget: AuraVec3 = [
        state.player.x + state.aim.x * AIM_LEAD,
        0.4,
        state.player.z + state.aim.z * AIM_LEAD
      ];
      const t = Math.min(1, ctx.dt / 0.14);
      for (let i = 0; i < 3; i += 1) {
        eye[i] = eye[i] + (want[i] - eye[i]) * t;
        tracked[i] = tracked[i] + (wantTarget[i] - tracked[i]) * Math.min(1, t * 1.6);
      }
      return {
        position: [eye[0], eye[1], eye[2]],
        target: [tracked[0], tracked[1], tracked[2]],
        up: UP,
        roll: 0,
        fov: FOV,
        near: 0.1,
        far: 140
      };
    }
  };
}

/** Compiled fallback camera for scene() snapshots (opening frame). */
export function fallbackCameraNode(): ReturnType<typeof camera.perspective> {
  return camera.perspective({
    position: [0, OFFSET[1], OFFSET[2]],
    target: [0, 0.4, 0],
    fov: FOV
  });
}
