import type { KinematicBody } from "./KinematicBody";

export interface CameraStageBounds {
  minX: number;
  maxX: number;
}

export interface CameraDirectorFrame {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  zoom: number;
  shake: number;
  reducedMotion: boolean;
  stageBounds: CameraStageBounds;
  unclampedCenterX: number;
  clampedCenterX: number;
  clampedToStage: boolean;
}

const DEFAULT_STAGE_BOUNDS: CameraStageBounds = { minX: -3.2, maxX: 3.2 };

export function frameFightCamera(
  player: KinematicBody,
  opponent: KinematicBody,
  options?: { impact?: boolean; reducedMotion?: boolean; stageBounds?: CameraStageBounds },
): CameraDirectorFrame {
  const stageBounds = options?.stageBounds ?? DEFAULT_STAGE_BOUNDS;
  const unclampedCenterX = (player.position.x + opponent.position.x) / 2;
  const cameraMargin = 0.62;
  const clampedCenterX = clamp(unclampedCenterX, stageBounds.minX + cameraMargin, stageBounds.maxX - cameraMargin);
  const distance = Math.abs(player.position.x - opponent.position.x);
  const reducedMotion = Boolean(options?.reducedMotion);
  const shake = options?.impact && !reducedMotion ? 0.055 : 0;
  const zoom = clamp(1.08 - distance * 0.075, 0.82, 1.08);
  const z = clamp(4.35 + distance * 0.36, 4.35, 6.2);
  const fov = reducedMotion ? 32 : Math.round(clamp(30 + distance * 2.1, 32, 38));

  return {
    position: [clampedCenterX * 0.16 + shake, 1.05 + shake, z],
    target: [clampedCenterX * 0.12, 0.68, 0.12],
    fov,
    zoom,
    shake,
    reducedMotion,
    stageBounds,
    unclampedCenterX,
    clampedCenterX,
    clampedToStage: clampedCenterX !== unclampedCenterX,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
