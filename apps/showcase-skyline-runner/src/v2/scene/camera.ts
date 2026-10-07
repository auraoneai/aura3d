// apps/showcase-skyline-runner/src/v2/scene/camera.ts — follow2d rig. Eye sits at
// camera-readability distance behind the play plane, leading the runner in the
// facing direction; the frame math is the legacy SkylineCameraFrame helper so the
// look-ahead sign can never stay wrong after a turn.
import type { AuraCameraPose } from "@aura3d/engine/contracts";
import { camera } from "@aura3d/engine";
import { skylineCameraFrame, skylineCameraTuning } from "../../legacy/camera-readability";
import { GAMEPLAY_ACTOR_DEPTH, platformerScene } from "./binding";

const TUNING = skylineCameraTuning(false);

// Distance is pulled back from the legacy 2.5 tuning so the rendered hero sits
// inside the direction's [0.10, 0.22] subject-height band at fov 46.
const SKYLINE_CAMERA_DISTANCE = 3.0;

export const SKYLINE_CAMERA_FOV = Math.min(50, Math.max(42, TUNING.fov + 4));

export function skylinePoseFor(input: {
  readonly playerX: number;
  readonly playerY: number;
  readonly facing: number;
  readonly shake?: readonly [number, number, number];
}): AuraCameraPose {
  const frame = skylineCameraFrame({ ...TUNING, distance: SKYLINE_CAMERA_DISTANCE }, input.facing, input.shake ?? [0, 0, 0]);
  const [sceneX, sceneY] = platformerScene.toScenePoint({ x: input.playerX, y: input.playerY });
  return {
    position: [sceneX + frame.offset[0], sceneY + frame.offset[1], GAMEPLAY_ACTOR_DEPTH + frame.offset[2]],
    target: [sceneX + frame.targetOffset[0], sceneY + frame.targetOffset[1], GAMEPLAY_ACTOR_DEPTH],
    up: [0, 1, 0],
    roll: 0,
    fov: SKYLINE_CAMERA_FOV,
    near: 0.05,
    far: 140
  };
}

export function createSkylineRig(rigState: {
  playerX: number;
  playerY: number;
  facing: number;
  shake: readonly [number, number, number];
}) {
  return {
    id: "skyline-runner.follow2d",
    update() {
      return skylinePoseFor(rigState);
    },
    reset(pose?: AuraCameraPose) {
      void pose;
    }
  };
}

export function skylineCameraSpec() {
  const pose = skylinePoseFor({ playerX: 0, playerY: 0.4, facing: 1 });
  return camera.perspective({ position: pose.position, target: pose.target, fov: SKYLINE_CAMERA_FOV });
}
