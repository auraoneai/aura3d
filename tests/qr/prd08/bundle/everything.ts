/**
 * S19 "everything" bundle fixture (PRD-08 §17): the full lane — all 8 genre
 * rigs + rail + Spline, bicycle + platformer motion, touch kit, feel, fade
 * chunk. Budget ≤ 24 KB gzip (the §7.4 column sum ≈ 23.9 KB).
 * Leaf imports: the budgets model per-module lane cost; non-lane packages
 * (three, rendering runtime, assets, physics) are externalized in
 * bundle.test.ts the same way `tools/bundle-size` treats `three`.
 */
import { createCameraController } from "../../../../packages/engine/src/agent-api/camera/CameraController.js";
import { createChaseRig } from "../../../../packages/engine/src/agent-api/camera/rigs/chase.js";
import { createFlightRig } from "../../../../packages/engine/src/agent-api/camera/rigs/flight.js";
import { createFollow2dRig } from "../../../../packages/engine/src/agent-api/camera/rigs/follow2d.js";
import { createFightingRig } from "../../../../packages/engine/src/agent-api/camera/rigs/fighting.js";
import { createShoulderRig } from "../../../../packages/engine/src/agent-api/camera/rigs/shoulder.js";
import { createOrbitRig, bindOrbitPointer } from "../../../../packages/engine/src/agent-api/camera/rigs/orbit.js";
import { createTopDownRig } from "../../../../packages/engine/src/agent-api/camera/rigs/topDown.js";
import { createAltitudeRig } from "../../../../packages/engine/src/agent-api/camera/rigs/altitude.js";
import { createRailRig } from "../../../../packages/engine/src/agent-api/camera/rigs/rail.js";
import { createFromSpecRig } from "../../../../packages/engine/src/agent-api/camera/rigs/fromSpec.js";
import { staticRig } from "../../../../packages/engine/src/agent-api/camera/rigs/static.js";
import { createSpline, catmullRom } from "../../../../packages/engine/src/agent-api/camera/Spline.js";
import { createCollisionDamper } from "../../../../packages/engine/src/agent-api/camera/collision.js";
import { createCameraProbe } from "../../../../packages/engine/src/agent-api/camera/Probe.js";
import { createOccluderFade, createOccluderFadeContributor } from "../../../../packages/engine/src/agent-api/camera/OccluderFade.js";
import { createCinematicBarsLayer, createLetterboxContributor } from "../../../../packages/engine/src/agent-api/camera/layers/cinematicBars.js";
import { createTimeController } from "../../../../packages/engine/src/agent-api/time/TimeController.js";
import { createFixedStepDriver } from "../../../../packages/engine/src/agent-api/time/FixedStepDriver.js";
import { createInterpolationStore } from "../../../../packages/engine/src/agent-api/time/Interpolation.js";
import { createFeelBus } from "../../../../packages/engine/src/agent-api/feel/FeelBus.js";
import { FEEL_PRESETS } from "../../../../packages/engine/src/agent-api/feel/presets.js";
import { bindFeelSound } from "../../../../packages/engine/src/agent-api/feel/bindFeelSound.js";
import { createScreenOverlay } from "../../../../packages/engine/src/agent-api/feel/ScreenOverlay.js";
import { createTraumaLayer, createFovKickLayer, createLookAtLayer, createPunchLayer } from "../../../../packages/engine/src/agent-api/camera/layers/index.js";
import { createBicycleModel } from "../../../../packages/engine/src/agent-api/vehicle/BicycleModel.js";
import { solvePlatformerMotion } from "../../../../packages/engine/src/agent-api/PlatformerMotion.js";
import { ease } from "../../../../packages/engine/src/agent-api/camera/ease.js";
import { springDamp } from "../../../../packages/engine/src/agent-api/camera/Spring.js";
import { perlin1 } from "../../../../packages/engine/src/agent-api/feel/Noise.js";
import { createTouchLayoutPreset } from "../../../../packages/input/src/TouchLayouts.js";
import { VirtualTouchJoystick } from "../../../../packages/input/src/VirtualTouchControls.js";
import {
  cameraFadeParsChunk,
  cameraFadeDiscardChunk,
  cameraFadeFeature,
  createCameraFadeOffsetContributor
} from "../../../../packages/rendering/src/shaders/camera-fade.glsl.js";

export const everything = {
  controller: createCameraController,
  rigs: {
    chase: createChaseRig,
    flight: createFlightRig,
    follow2d: createFollow2dRig,
    fighting: createFightingRig,
    shoulder: createShoulderRig,
    orbit: createOrbitRig,
    topDown: createTopDownRig,
    altitude: createAltitudeRig,
    rail: createRailRig,
    fromSpec: createFromSpecRig,
    static: staticRig
  },
  bindOrbitPointer,
  spline: { createSpline, catmullRom },
  collision: { createCameraProbe, createCollisionDamper },
  occluderFade: { createOccluderFade, createOccluderFadeContributor },
  bars: { createCinematicBarsLayer, createLetterboxContributor },
  time: { createTimeController, createFixedStepDriver, createInterpolationStore },
  feel: { createFeelBus, presets: FEEL_PRESETS, bindFeelSound, createScreenOverlay },
  layers: [createTraumaLayer, createFovKickLayer, createLookAtLayer, createPunchLayer],
  vehicle: { createBicycleModel, solvePlatformerMotion },
  touch: { createTouchLayoutPreset, VirtualTouchJoystick },
  fade: { cameraFadeParsChunk, cameraFadeDiscardChunk, cameraFadeFeature, createCameraFadeOffsetContributor },
  ease,
  springDamp,
  perlin1
};
