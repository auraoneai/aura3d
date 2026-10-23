import { createSceneRenderer, type SceneRendererHandle } from "./view/renderer";
import type { AthletePose } from "./contract/modules";
import type { MatchState } from "./contract/sim";

export { createSceneRenderer } from "./view/renderer";
export type { SceneRendererHandle, SceneRendererOptions } from "./view/renderer";

/** Resting pose used when no pose module is wired yet (render-only harness). */
export const STANDING_POSE: AthletePose = {
  pose: (actor) => ({
    mode: "ready", sliding: false,
    legs: [
      { hip: [-0.14, 0.92, 0], knee: [-0.15, 0.5, 0.04], foot: [-0.16, 0.06, 0.02], planted: true },
      { hip: [0.14, 0.92, 0], knee: [0.15, 0.5, 0.04], foot: [0.16, 0.06, 0.02], planted: true }
    ],
    right: [0.42, 1.0, 0.28], left: [-0.34, 1.05, 0.2],
    racketDirection: [actor.end > 0 ? 0.2 : -0.2, 0.45, -0.85],
    hipY: 0.92, torsoYaw: 0, shoulderY: 1.45, headY: 1.72, leanX: 0, leanZ: 0
  })
};

export type { MatchState };
export type RenderMain = { renderer: SceneRendererHandle };
