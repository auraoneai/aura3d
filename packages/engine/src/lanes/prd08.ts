/**
 * Lane prd08 barrel — owned by lane 08 (CONTRACTS.md §3.8).
 *
 * Registrations:
 * - `time` (C-23 / C-38): real `TimeController` under `A3D_QR_CAMERA`, the
 *   PR 0a `StubTimeController` when the flag is off.
 * - `feel` (C-23 / C-38): `StubFeelBus` placeholder until the real FeelBus
 *   lands (phase 2); kept registered so `app.feel` is never undefined.
 *
 * The barrel is imported by `packages/engine/src/index.ts` — registrations
 * run once at module load, like every other lane.
 */

import { registerAppExtension } from "../contracts/app.js";
import { StubFeelBus, StubTimeController } from "../contracts/time.js";
import { createTimeController } from "../agent-api/time/TimeController.js";
import {
  createAuraCameraController,
  createStubCameraController
} from "../agent-api/camera/extension.js";
import type { AuraCameraController } from "../contracts/camera.js";
import type { AuraRuntimeNodeHandle } from "../agent-api/index.js";

// Lane public surface — the agent-api barrel (`index.ts`) is lane-15's, so
// lane-08 additions are exported here via `@aura3d/engine/lanes`.
export {
  createTimeController,
  TimeController,
  type TimeControllerOptions,
  type TimeControllerScopeEntry
} from "../agent-api/time/TimeController.js";
export {
  createFixedStepDriver,
  FixedStepDriver,
  type FixedStepDriverApp,
  type FixedStepDriverOptions,
  type AuraRenderFrame,
  type AuraRenderCallback
} from "../agent-api/time/FixedStepDriver.js";
export {
  createInterpolationStore,
  InterpolationStore,
  type AuraInterpolationTransform,
  type AuraInterpolableHandle
} from "../agent-api/time/Interpolation.js";
export {
  springDamp,
  springDampVec3,
  springStep,
  springStepVec3,
  smoothingToHalflife,
  type AuraSpringState,
  type AuraSpringVec3State
} from "../agent-api/camera/Spring.js";
export {
  catmullRom,
  catmullRomDerivative,
  createSpline,
  AuraCameraSpline,
  type AuraSplineOptions
} from "../agent-api/camera/Spline.js";
export {
  distanceForFraction,
  distanceForFractionInContext,
  effectiveAxisFov,
  fractionForDistance,
  fractionForDistanceInContext,
  type AuraFramingContext
} from "../agent-api/camera/framing.js";
// AuraQuat itself comes from contracts/sceneGraph (C-22's first public
// quaternion type); the lane-local helpers stay camera-prefixed.
export {
  quatFromAxisAngle as cameraQuatFromAxisAngle,
  quatFromEulerXYZ as cameraQuatFromEulerXYZ,
  quatMultiply as cameraQuatMultiply,
  quatNormalize as cameraQuatNormalize,
  quatSlerp as cameraQuatSlerp,
  quatToEulerXYZ as cameraQuatToEulerXYZ
} from "../agent-api/camera/quat.js";
export { createNoise1D, perlin1 } from "../agent-api/feel/Noise.js";
export {
  createCameraController,
  type AuraCameraControllerDeps,
  type AuraCameraControllerImpl
} from "../agent-api/camera/CameraController.js";
export {
  createAuraCameraController
} from "../agent-api/camera/extension.js";
export {
  createFromSpecRig,
  staticRig,
  LegacySpecRig,
  DEFAULT_POSE as CAMERA_DEFAULT_POSE,
  type LegacyCameraSpec,
  type LegacySpecRigDeps,
  type LegacyTargetSource
} from "../agent-api/camera/rigs/legacy.js";
export {
  createFovKickLayer,
  createLookAtLayer,
  createPunchLayer,
  createTraumaLayer,
  type AuraLookAtLayer
} from "../agent-api/camera/layers.js";
export { ease } from "../agent-api/camera/ease.js";
export {
  BicycleModel,
  createBicycleModel,
  type BicycleModelInput,
  type BicycleModelOptions,
  type BicycleModelState,
  type BicycleTyreParams
} from "../agent-api/vehicle/BicycleModel.js";
export type { FrameLoopTick, FrameLoopTickCallback } from "../agent-api/FrameLoop.js";

registerAppExtension({
  id: "prd08.time",
  owner: "prd08",
  flag: "A3D_QR_CAMERA",
  member: "time",
  create: (app, ctx) =>
    ctx.flags.on("A3D_QR_CAMERA")
      ? createTimeController({
          resolveHandle: (id) => app.nodes?.get(id) as AuraRuntimeNodeHandle | undefined
        })
      : new StubTimeController()
});

registerAppExtension({
  id: "prd08.feel",
  owner: "prd08",
  flag: "A3D_QR_CAMERA",
  member: "feel",
  create: () => new StubFeelBus()
});

registerAppExtension({
  id: "prd08.camera",
  owner: "prd08",
  flag: "A3D_QR_CAMERA",
  member: "camera",
  create: (app, ctx): AuraCameraController => {
    const cameraOptions =
      (ctx.options as { camera?: { legacy?: boolean; freezeSpecs?: boolean } } | undefined)?.camera ?? {};
    if (cameraOptions.legacy === true || !ctx.flags.on("A3D_QR_CAMERA")) {
      // `camera.legacy` forces the stub even when the flag is on (C-22).
      return createStubCameraController(
        () => (app.scene as { camera?: { position?: readonly number[]; target?: readonly number[]; fov?: number; near?: number; far?: number; orthographicSize?: number } } | undefined)?.camera as never
      );
    }
    return createAuraCameraController(app, { freezeSpecs: cameraOptions.freezeSpecs === true });
  }
});

export {};
