import type { QaHookApp } from "@aura3d/engine";
import type { MatchState } from "./contract/sim";
import { appearance } from "./sim/appearance";
import { physics } from "./sim/physics";
import { startAuraSlam, type StartAuraSlamOptions } from "./shell/start";
import type { AuraSlamHandle, SlamRenderer } from "./shell/boot";
import { createBootProgress } from "./shell/bootProgress";
import { createSceneRenderer, type SceneRendererHandle, type SceneRendererOptions } from "./view/renderer";
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

/**
 * A3/A10 lab flags: `?backend=auto|webgpu|webgl2` (WebGL2 fallback kept; the game passes "auto" as its default) and `?gamut=p3`
 * (falls back to sRGB).
 * Same mapping as apps/showcase-port-shared/lab-flags.ts, kept local so the example stays self-contained. EXPERIMENTAL.
 */
export function labAppOptions(search: string, defaultBackend?: "auto" | "webgpu"): { appOptions?: NonNullable<SceneRendererOptions["appOptions"]> } {
  const params = new URLSearchParams(search);
  const raw = params.get("backend")?.trim().toLowerCase();
  // `?backend=webgl2` forces WebGL2 (the opt-out when `defaultBackend` is set); unknown values fall back to the default.
  const backend = raw === "auto" || raw === "webgpu" || raw === "webgl2" ? raw : defaultBackend;
  const gamut = params.get("gamut")?.trim().toLowerCase();
  const renderer = backend === "auto" || backend === "webgpu" ? { backend, allowFallback: true as const } : undefined;
  const output = gamut === "p3" ? { outputColorSpace: "display-p3" as const } : undefined;
  return renderer || output ? { appOptions: { ...(renderer ? { renderer } : {}), ...(output ? { output } : {}) } } : {};
}

/** The scene renderer (M-RENDER) with the M-POSE athlete rig and the native outfit resolver, in the shape the shell expects. */
export function createNativeRenderer(options: { safety?: boolean; search?: string; onBootProgress?: SceneRendererOptions["onBootProgress"] } = {}): NativeRenderer {
  const handle = createSceneRenderer({
    pose: createAthletePose(),
    rig: createPoseRig({ resolveAppearance: (value, role) => appearance.resolve(value, role === "ai" ? "ai" : "player") }),
    landing: (ball: BallState) => physics.landing(ball),
    ...(options.safety !== undefined ? { safety: options.safety } : {}),
    ...(options.search !== undefined ? { search: options.search } : {}),
    ...(options.onBootProgress ? { onBootProgress: options.onBootProgress } : {}),
    // WebGPU by default (real-GPU check 2026-11-08: same frame, >= 0.9x WebGL2 fps); ?backend=webgl2 opts out.
    ...labAppOptions(options.search ?? (typeof window !== "undefined" ? window.location.search : ""), "auto")
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
  const progress = createBootProgress();
  const renderer = options.renderer ?? createNativeRenderer({ onBootProgress: (fraction, label) => progress.set(fraction, label) });
  return startAuraSlam({
    // A1: the splash lifts after the first drawn frame (or 3 s), not before the canvas has pixels.
    revealBoot: () => {
      const app = renderer.handle.app;
      void progress.reveal(app && typeof app.readiness === "function" ? () => app.readiness({ stage: "first-frame" }) : undefined);
    },
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
  var __AURA_SLAM_NO_BOOT__: boolean | undefined;
}

/** The shipped page loads this module as its entry. Specs and harnesses opt out with `__AURA_SLAM_NO_BOOT__`. */
if (typeof document !== "undefined" && !globalThis.__AURA_SLAM_NO_BOOT__ && document.getElementById("game")) {
  void launchAuraSlam().catch((error) => console.error("[aura-slam] boot failed", error));
}

export type { ActorState };
