/**
 * Lane prd08 barrel — owned by lane 08 (CONTRACTS.md §3.8).
 *
 * Registrations:
 * - `time` (C-23 / C-38): real `TimeController` under `A3D_QR_CAMERA`, the
 *   PR 0a `StubTimeController` when the flag is off.
 * - `feel` (C-23 / C-38): the real FeelBus under `A3D_QR_CAMERA` — channels
 *   dispatch to camera layers, `app.time`, haptics, C-25 audio, C-20 effects
 *   and the `prd08.screenFeel` blackboard key; `StubFeelBus` with the flag off.
 * - `prd08.letterbox`: publishes the active cinematicBars layer's rect.
 *
 * The barrel is imported by `packages/engine/src/index.ts` — registrations
 * run once at module load, like every other lane.
 */

import { registerAppExtension } from "../contracts/app.js";
import { StubFeelBus, StubTimeController } from "../contracts/time.js";
import { registerFrameContributor } from "@aura3d/rendering/contracts";
import { createTimeController } from "../agent-api/time/TimeController.js";
import { createAuraFeelBus } from "../agent-api/feel/extension.js";
import { createLetterboxContributor } from "../agent-api/camera/layers/cinematicBars.js";
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
  quatRotateVec3 as cameraQuatRotateVec3,
  quatSlerp as cameraQuatSlerp,
  quatToEulerXYZ as cameraQuatToEulerXYZ
} from "../agent-api/camera/quat.js";
export { createNoise1D, perlin1 } from "../agent-api/feel/Noise.js";
export {
  createCameraController,
  presentedViewProjection,
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
} from "../agent-api/camera/rigs/fromSpec.js";
export { createChaseRig, type ChaseRigOptions } from "../agent-api/camera/rigs/chase.js";
export { createFlightRig, type FlightRigOptions } from "../agent-api/camera/rigs/flight.js";
export { createFollow2dRig, type Follow2dRigOptions } from "../agent-api/camera/rigs/follow2d.js";
export { createFightingRig, type FightingRigOptions } from "../agent-api/camera/rigs/fighting.js";
export { createShoulderRig, type ShoulderRigOptions } from "../agent-api/camera/rigs/shoulder.js";
export { createOrbitRig, bindOrbitPointer, type OrbitRigOptions, type AuraOrbitRig } from "../agent-api/camera/rigs/orbit.js";
export { createTopDownRig, type TopDownRigOptions } from "../agent-api/camera/rigs/topDown.js";
export { createAltitudeRig, type AltitudeRigOptions } from "../agent-api/camera/rigs/altitude.js";
export { createRailRig } from "../agent-api/camera/rigs/rail.js";
export {
  createCameraProbe,
  type AuraCameraProbeDeps,
  type ProbeBoundsEntry,
  type ProbePhysicsEntry
} from "../agent-api/camera/Probe.js";
export {
  createCollisionDamper,
  type CollisionDamper,
  type CollisionDamperOptions
} from "../agent-api/camera/collision.js";
export {
  createOccluderFade,
  createOccluderFadeContributor,
  type AuraOccluderFade,
  type AuraOccluderFadeOptions
} from "../agent-api/camera/OccluderFade.js";
export {
  createCinematicBarsLayer,
  createLetterboxContributor,
  LETTERBOX_BLACKBOARD_KEY,
  type AuraCinematicBarsLayer,
  type AuraCinematicBarsOptions
} from "../agent-api/camera/layers/cinematicBars.js";
export {
  createFeelBus,
  type AuraFeelBusDeps,
  type AuraFeelBusImpl,
  type FeelChannel
} from "../agent-api/feel/FeelBus.js";
export { FEEL_PRESETS, feelPresets, FEEL_PRESET_EVENTS, type AuraFeelPresetName } from "../agent-api/feel/presets.js";
export { bindFeelSound, type FeelSoundListener } from "../agent-api/feel/bindFeelSound.js";
export { combatFeelEvent, emitCombatFeel, type CombatFeelEvent, type CombatFeelMove } from "../agent-api/feel/combatFeel.js";
export { createScreenOverlay, type AuraScreenOverlay } from "../agent-api/feel/ScreenOverlay.js";
export {
  createAuraFeelBus,
  SCREEN_FEEL_KEY,
  type AuraFeelExtensionOptions
} from "../agent-api/feel/extension.js";
export {
  createFovKickLayer,
  createLookAtLayer,
  createPunchLayer,
  createTraumaLayer,
  type AuraLookAtLayer
} from "../agent-api/camera/layers/index.js";
export { ease } from "../agent-api/camera/ease.js";
export {
  BicycleModel,
  createBicycleModel,
  type BicycleModelInput,
  type BicycleModelOptions,
  type BicycleModelState,
  type BicycleTyreParams
} from "../agent-api/vehicle/BicycleModel.js";
export {
  createFrameLoop,
  FrameLoop,
  type FrameLoopCallback,
  type FrameLoopFrame,
  type FrameLoopOptions,
  type FrameLoopSnapshot,
  type FrameLoopSource,
  type FrameLoopTick,
  type FrameLoopTickCallback
} from "../agent-api/FrameLoop.js";
// T0-32: QR-15 (bf1789b0) repointed `@aura3d/engine` to `public/index.ts`,
// which does not carry these legacy symbols; the lane surface is the
// supported import site for them now.
export { resolveCameraFrame } from "../agent-api/compiler/camera.js";
export type { AuraRuntimeNodeRegistry } from "../agent-api/nodes/types.js";
export {
  createShoulderCamera,
  type ShoulderCamera,
  type ShoulderCameraOptions
} from "../agent-api/GameCameraRigs.js";

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
  create: (app, ctx) => {
    if (!ctx.flags.on("A3D_QR_CAMERA")) return new StubFeelBus();
    const feelOpts = (ctx.options as { feel?: { screenFallback?: "dom" } } | undefined)?.feel ?? {};
    return createAuraFeelBus(app, { screenFallback: feelOpts.screenFallback });
  },
  dispose: (value) => {
    (value as { dispose?: () => void }).dispose?.();
  }
});

registerFrameContributor(createLetterboxContributor());

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

// X-3 (Q-15-4 lane side): byte-parity adapters so packages/lean shares lane-08
// math instead of a private copy.
export {
  createLeanCameraRigAdapter,
  createLeanGameFeelAdapter,
  type LeanCameraRigAdapterOptions,
  type LeanCameraRigAdapter,
  type LeanGameFeelAdapterOptions,
  type LeanGameFeelAdapter
} from "../agent-api/camera/leanAdapters.js";
