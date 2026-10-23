import type { QaHookApp } from "@aura3d/engine";
import type { MatchState } from "./contract/sim";
import { appearance } from "./sim/appearance";
import { physics } from "./sim/physics";
import { startAuraSlam, type StartAuraSlamOptions } from "./shell/start";
import type { AuraSlamHandle, SlamRenderer } from "./shell/boot";
import { createSceneRenderer, type SceneRendererHandle } from "./view/renderer";
import { createAthletePose } from "./view/pose";
import { createPoseRig } from "./view/poseRig";
import type { ActorState, BallState } from "./contract/sim";

export { createSceneRenderer } from "./view/renderer";
export type { SceneRendererHandle, SceneRendererOptions } from "./view/renderer";
export { STANDING_POSE } from "./view/standingPose";
export type { MatchState };
export type RenderMain = { renderer: SceneRendererHandle };

export interface NativeRenderer extends SlamRenderer {
  readonly handle: SceneRendererHandle;
}

/** The scene renderer (M-RENDER) with the M-POSE athlete rig and the native outfit resolver, in the shape the shell expects. */
export function createNativeRenderer(options: { safety?: boolean; search?: string } = {}): NativeRenderer {
  const handle = createSceneRenderer({
    pose: createAthletePose(),
    rig: createPoseRig({ resolveAppearance: (value, role) => appearance.resolve(value, role === "ai" ? "ai" : "player") }),
    landing: (ball: BallState) => physics.landing(ball),
    ...(options.safety !== undefined ? { safety: options.safety } : {}),
    ...(options.search !== undefined ? { search: options.search } : {})
  });
  return {
    handle,
    mount: (canvas) => handle.mount(canvas),
    setVenue: (venue) => handle.setVenue(venue),
    project: (world) => handle.project(world),
    resize: (width, height, ratio) => handle.resize(width, height, ratio),
    dispose: () => handle.dispose(),
    render: (state, dt) => handle.render(state as unknown as MatchState, dt),
    projectCourt: (x, y, z = 0) => handle.project([x, y, z]),
    debug: () => handle.debug()
  };
}

/** Boot the native game on the page's `#game` canvas. */
export function launchAuraSlam(options: Partial<Omit<StartAuraSlamOptions, "renderer">> & { renderer?: NativeRenderer } = {}): Promise<AuraSlamHandle> {
  const renderer = options.renderer ?? createNativeRenderer();
  return startAuraSlam({
    ...options,
    renderer,
    app: options.app ?? (() => renderer.handle.app as unknown as QaHookApp | null),
    nodeCount: options.nodeCount ?? (() => {
      const nodes = (renderer.handle.app as unknown as { nodes?: { count?: () => number } } | null)?.nodes;
      return typeof nodes?.count === "function" ? nodes.count() : 0;
    })
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __AURA_SLAM_NO_BOOT__: boolean | undefined;
}

/** The shipped page loads this module as its entry. Specs and harnesses opt out with `__AURA_SLAM_NO_BOOT__`. */
if (typeof document !== "undefined" && !globalThis.__AURA_SLAM_NO_BOOT__ && document.getElementById("game")) {
  void launchAuraSlam().catch((error) => console.error("[aura-slam] boot failed", error));
}

export type { ActorState };
