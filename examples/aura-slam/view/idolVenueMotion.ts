/**
 * Idol wow pass, moving parts: the two courtside broadcast cameras pan to follow the ball (the procedural tripods were a
 * static part of the merged stadium bowl; a TV camera that never tracks play reads as a prop). The whole camera node pans
 * about its vertical axis (the Idol GLB is one rigid mesh), damped and limited to +-0.55 rad around its rest aim.
 */
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { Vec3 } from "../contract/units";

export interface TvCameraRig {
  readonly id: string;
  readonly position: Vec3;
  /** node yaw at rest: the GLB's lens (+X) turned to the procedural tripod's aim (-sin a, -cos a), a = +-0.42 */
  readonly baseYaw: number;
}

export const TV_CAMERAS: readonly TvCameraRig[] = ([-1, 1] as const).map((sx) => ({
  id: `wt-tv-camera-${sx < 0 ? "left" : "right"}`,
  position: [sx * 10.55, 0, 4.4] as Vec3,
  baseYaw: sx * 0.42 + Math.PI / 2
}));

/** pan range around the rest aim (radians) and the follow half-life (seconds) */
export const TV_PAN_LIMIT = 0.55;
export const TV_PAN_HALF_LIFE = 0.35;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Node yaw that points the lens (+X of the GLB) at the ball (x, z), clamped around the rest aim. */
export function tvCameraTargetYaw(rig: TvCameraRig, ballX: number, ballZ: number): number {
  const dx = ballX - rig.position[0];
  const dz = ballZ - rig.position[2];
  // R_y(yaw) maps +X to (cos yaw, -sin yaw): the lens looks along (dx, dz) when yaw = atan2(-dz, dx)
  const want = Math.atan2(-dz, dx);
  const off = Math.max(-TV_PAN_LIMIT, Math.min(TV_PAN_LIMIT, wrap(want - rig.baseYaw)));
  return rig.baseYaw + off;
}

export function createTvCameraPans(handles: readonly (AuraRuntimeNodeHandle | undefined)[]) {
  const yaws = TV_CAMERAS.map((r) => r.baseYaw);
  return {
    yaws: yaws as readonly number[],
    update(ballX: number, ballZ: number, dt: number): void {
      const k = 1 - Math.pow(0.5, Math.max(0, Math.min(0.1, dt)) / TV_PAN_HALF_LIFE);
      TV_CAMERAS.forEach((rig, i) => {
        const target = tvCameraTargetYaw(rig, ballX, ballZ);
        yaws[i] = yaws[i]! + wrap(target - yaws[i]!) * k;
        handles[i]?.setRotation(0, yaws[i]!, 0);
      });
    }
  };
}
