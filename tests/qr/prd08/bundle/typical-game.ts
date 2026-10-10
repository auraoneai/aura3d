/**
 * S19 "typical game" bundle fixture (PRD-08 §17): controller + layers +
 * rigs.chase + collision + time + loop/interpolation + feel bus + touch kit.
 * Budget ≤ 15 KB gzip and MUST NOT pull rail/Spline/BicycleModel — those are
 * optional systems a typical game does not pay for (tree-shake gate in
 * bundle.test.ts via metafile inputs). Leaf imports: the §7.4 budget models
 * per-module cost, not the lanes barrel.
 */
import { createCameraController } from "../../../../packages/engine/src/agent-api/camera/CameraController.js";
import { createChaseRig } from "../../../../packages/engine/src/agent-api/camera/rigs/chase.js";
import { createCollisionDamper } from "../../../../packages/engine/src/agent-api/camera/collision.js";
import { createTimeController } from "../../../../packages/engine/src/agent-api/time/TimeController.js";
import { createFixedStepDriver } from "../../../../packages/engine/src/agent-api/time/FixedStepDriver.js";
import { createInterpolationStore } from "../../../../packages/engine/src/agent-api/time/Interpolation.js";
import { createFeelBus } from "../../../../packages/engine/src/agent-api/feel/FeelBus.js";
import { FEEL_PRESETS } from "../../../../packages/engine/src/agent-api/feel/presets.js";
import { createTraumaLayer, createFovKickLayer, createLookAtLayer, createPunchLayer } from "../../../../packages/engine/src/agent-api/camera/layers/index.js";
import { ease } from "../../../../packages/engine/src/agent-api/camera/ease.js";
import { createTouchLayoutPreset } from "../../../../packages/input/src/TouchLayouts.js";

export const typicalGame = {
  controller: createCameraController,
  layers: [createTraumaLayer, createFovKickLayer, createLookAtLayer, createPunchLayer],
  chase: createChaseRig,
  collision: createCollisionDamper,
  time: createTimeController,
  loop: createFixedStepDriver,
  interpolation: createInterpolationStore,
  feel: createFeelBus,
  presets: FEEL_PRESETS.fighting,
  touch: createTouchLayoutPreset,
  ease
};
