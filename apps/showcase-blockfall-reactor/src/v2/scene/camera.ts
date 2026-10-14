// apps/showcase-blockfall-reactor/src/v2/scene/camera.ts — static rig (RIGS).
// The direction names the static rig: the well is the subject, framed from a
// fixed eye with an 8–12° downward tilt, a ±1.5° idle drift so the room keeps
// breathing during empty boards, and the authored camera-feel punch composited
// on quads and level-ups (boot.ts owns the composition).
import { camera } from "@aura3d/engine";
import type { AuraCameraPose } from "@aura3d/engine";

export const BASE_POSE = {
  // 8–12° downward tilt onto the well: dy 1.48 over dz 8.33 ≈ 10°.
  position: [0, 3.3, 8.45] as readonly [number, number, number],
  target: [0, 1.82, 0.12] as readonly [number, number, number]
};

export interface BlockfallRigState {
  /** Seconds elapsed while unpaused; drives the idle drift. */
  time: number;
  /** Camera-feel punch strength (0 = none), pushed in by boot each frame. */
  punch: number;
}

export function blockfallPoseFor(rigState: BlockfallRigState): AuraCameraPose {
  const { time, punch } = rigState;
  // ±1.5° idle drift on the eye's orbit; the well stays centred while the
  // room parallax breathes around it.
  const yawDrift = Math.sin(time * 0.35) * 0.0225; // ±~1.29°
  const pitchDrift = Math.sin(time * 0.21 + 1.1) * 0.008; // ±~0.46°
  const position: [number, number, number] = [
    BASE_POSE.position[0] + Math.sin(yawDrift) * BASE_POSE.position[2],
    BASE_POSE.position[1] + pitchDrift * BASE_POSE.position[2] * 0.12,
    BASE_POSE.position[2] + (Math.cos(yawDrift) - 1) * BASE_POSE.position[2] - punch * 0.2
  ];
  const target: [number, number, number] = [
    BASE_POSE.target[0],
    BASE_POSE.target[1] - punch * 0.05,
    BASE_POSE.target[2]
  ];
  return { position, target, up: [0, 1, 0], roll: 0, fov: 44, near: 0.1, far: 80 };
}

/** Engine-shaped rig: update(ctx) → pose; boot feeds punch via rigState. */
export function createBlockfallRig() {
  const rigState: BlockfallRigState = { time: 0, punch: 0 };
  return {
    id: "blockfall-reactor.static" as const,
    rigState,
    reset(): void {
      rigState.time = 0;
      rigState.punch = 0;
    },
    update(ctx: { dt: number }): AuraCameraPose {
      rigState.time += Math.max(0, ctx.dt);
      return blockfallPoseFor(rigState);
    }
  };
}

/** Camera spec consumed by the scene builder (engine camera node). */
export function blockfallCameraSpec() {
  return camera.perspective({
    position: BASE_POSE.position,
    target: BASE_POSE.target,
    fov: 44
  });
}
