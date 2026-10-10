/**
 * Shoulder camera (over-shoulder offset + look-ahead) — leaf home of the
 * `createShoulderCamera` implementation shared by `GameCameraRigs` (legacy
 * facade, re-exports this) and `rigs/shoulder.ts` (S19 tree-shake: rigs must
 * not pull the facade).
 */
import type { GameCameraRigSnapshot, GameCameraRigTarget, GameCameraRigVec3 } from "../../GameCameraRigs.js";
import { assertFinite, assertVec3, dampFactor, lerpTuple } from "../rigDamping.js";

export interface ShoulderCameraOptions {
  readonly side?: "right" | "left";
  readonly sideOffset?: number;
  readonly heightOffset?: number;
  readonly distance?: number;
  readonly lookAhead?: number;
  readonly smoothing?: number;
  readonly fov?: number;
}

export interface ShoulderCamera {
  update(dt: number, target: GameCameraRigTarget, overrides?: { readonly distance?: number }): GameCameraRigSnapshot;
  snapshot(): GameCameraRigSnapshot;
  reset(eye: GameCameraRigVec3): void;
}

export function createShoulderCamera(options: ShoulderCameraOptions = {}): ShoulderCamera {
  const api = "camera.shoulder";
  const sideSign = options.side === "left" ? -1 : 1;
  const sideOffset = options.sideOffset ?? 0.85;
  const heightOffset = options.heightOffset ?? 1.55;
  const distance = options.distance ?? 2.6;
  const lookAhead = options.lookAhead ?? 2.2;
  const smoothing = options.smoothing ?? 10;
  const fov = options.fov ?? 55;
  for (const [field, value] of [["sideOffset", sideOffset], ["heightOffset", heightOffset], ["distance", distance], ["lookAhead", lookAhead], ["smoothing", smoothing], ["fov", fov]] as const) {
    assertFinite(value, api, field);
  }
  if (distance < 0) throw new RangeError(`${api} distance must be >= 0.`);
  if (smoothing < 0) throw new RangeError(`${api} smoothing must be >= 0.`);

  let eye: GameCameraRigVec3 = [sideSign * sideOffset, heightOffset, distance];
  let look: GameCameraRigVec3 = [0, 1, -lookAhead];
  let currentFov = fov;

  const solve = (target: GameCameraRigTarget, dist = distance): { eye: GameCameraRigVec3; look: GameCameraRigVec3 } => {
    assertVec3(target.position, api, "target.position");
    const yaw = target.facing ?? 0;
    assertFinite(yaw, api, "target.facing");
    const forward: GameCameraRigVec3 = [Math.sin(yaw), 0, -Math.cos(yaw)];
    const right: GameCameraRigVec3 = [Math.cos(yaw), 0, Math.sin(yaw)];
    const [px, py, pz] = target.position;
    return {
      eye: [
        px - forward[0] * dist + right[0] * sideSign * sideOffset,
        py + heightOffset,
        pz - forward[2] * dist + right[2] * sideSign * sideOffset
      ],
      look: [px + forward[0] * lookAhead, py + heightOffset * 0.55, pz + forward[2] * lookAhead]
    };
  };

  const snap = (): GameCameraRigSnapshot => ({
    kind: "aura-game-shoulder-camera",
    position: eye,
    target: look,
    fov: currentFov
  });

  return {
    update(dt: number, target: GameCameraRigTarget, overrides?: { readonly distance?: number }): GameCameraRigSnapshot {
      assertFinite(dt, api, "dt");
      // #76: `overrides.distance` lets the shoulder rig re-solve the back-off
      // each frame (framing.subjectHeightFraction); absent → fixed distance.
      const solved = solve(target, overrides?.distance ?? distance);
      const alpha = dampFactor(smoothing, dt);
      eye = lerpTuple(eye, solved.eye, alpha);
      look = lerpTuple(look, solved.look, alpha);
      currentFov = fov;
      return snap();
    },
    snapshot: snap,
    reset(nextEye: GameCameraRigVec3): void {
      assertVec3(nextEye, api, "eye");
      eye = [...nextEye] as GameCameraRigVec3;
    }
  };
}
