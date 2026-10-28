import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";

/**
 * Frame-cost harness (beat-three.js PRD, WP-P1.4). Query: `?scene=cube|pbr&quality=auto|production|safe-basic`.
 * Both scenes mirror tools/bench-vs-threejs: 640x360, devicePixelRatio 1, same camera and the same cube material.
 * `pbr` is the primitives-only stand-in for the PBR viewer (a lit, shadowed, PBR-material grid): the GLB
 * milk truck lives in the published-package bench (tools/bench-vs-threejs), not in this in-repo harness.
 */
interface FrameCostApi {
  ready: boolean;
  scene: string;
  quality: string;
  firstFrameMs: number;
  /** createAuraApp() call to first frame finished: the engine-owned part of firstFrameMs (no dev-server module loading). */
  mountMs: number;
  errors: string[];
  renderPath: unknown;
  measure(frames: number): { cpuMs: number[]; totalMs: number[] };
  /** Advance and draw exactly one frame (no warm-up). */
  stepOnce(): void;
  drawCalls(): number;
}
declare global { interface Window { __FRAME_COST__?: FrameCostApi } }

const WIDTH = 640;
const HEIGHT = 360;
const params = new URLSearchParams(location.search);
const sceneName = params.get("scene") ?? "cube";
const quality = params.get("quality") ?? "auto";
/** `?fit=1`: the canvas fills the viewport, resizes with it and uses the engine's default pixel ratio (edge-case spec). */
const fit = params.get("fit") === "1";

/** Edge-case spec surface: the app, the canvas and scene builders (`cube`, `pbr`, `bloom`) so a spec can setScene / lose context / resize. */
interface FrameCostEdgeApi {
  readonly app: ReturnType<typeof createAuraApp>;
  readonly canvas: HTMLCanvasElement;
  makeScene(name: "cube" | "pbr" | "bloom"): ReturnType<typeof scene>;
}
declare global { interface Window { __FC__?: FrameCostEdgeApi } }

function buildScene(name: string = sceneName) {
  const view = camera.perspective({ fov: 50, near: 0.1, far: 100, position: [2, 2, 4], target: [0, 0.5, 0] });
  if (name === "cube" || name === "bloom") {
    const built = scene()
      .camera(view)
      .add(lights.ambient({ color: "#ffffff", intensity: 1 }))
      .add(primitives.box({ name: "cube", size: [1, 1, 1], material: material.pbr({ color: "#d86a3a" }) }).runtime({ id: "cube" }));
    return name === "bloom" ? built.add(effects.bloom({ intensity: 0.4 })) : built;
  }
  const grid = scene()
    .camera(view)
    .add(lights.studio())
    .add(lights.directional({ position: [3, 5, 2], intensity: 2.2, shadow: true }))
    .add(primitives.plane({ name: "floor", size: [8, 8], material: material.pbr({ color: "#3a3f4a", roughness: 0.9 }) }).rotate(-Math.PI / 2, 0, 0))
    .add(primitives.box({ name: "cube", size: [1, 1, 1], material: material.pbr({ color: "#d86a3a" }) }).position(0, 0.5, 0).runtime({ id: "cube" }));
  for (let i = 0; i < 6; i += 1) {
    grid.add(primitives.sphere({ name: `ball-${i}`, material: material.pbr({ color: "#4aa3df", metallic: i / 5, roughness: 0.15 + (i / 5) * 0.6 }) }).position(-2.5 + i, 0.3, 1.8).scale(0.6));
  }
  return grid;
}

async function main(): Promise<void> {
  const mountStart = performance.now();
  const errors: string[] = [];
  window.addEventListener("error", (event) => errors.push(String(event.message)));
  window.addEventListener("unhandledrejection", (event) => errors.push(String((event.reason as Error)?.message ?? event.reason)));
  const canvas = document.createElement("canvas");
  if (fit) {
    document.body.style.cssText = "margin:0;overflow:hidden";
    canvas.style.cssText = "display:block;width:100vw;height:100vh";
  } else {
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.style.cssText = `width:${WIDTH}px;height:${HEIGHT}px`;
  }
  document.body.appendChild(canvas);
  try {
    const app = createAuraApp(canvas, {
      autoStart: false,
      resize: fit,
      ...(fit ? {} : { pixelRatio: 1 }),
      quality: quality as "auto",
      scene: buildScene()
    });
    window.__FC__ = { app, canvas, makeScene: (name) => buildScene(name) };
    await app.ready();
    let cube = app.nodes.require("cube");
    const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
    const sink = new Uint8Array(4);
    // readPixels blocks until the (software) GPU has executed everything submitted.
    const finish = (): void => { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sink); };
    let yaw = 0;
    // A setScene() remount replaces the node handles; re-resolve when the cached one stops working.
    const frame = (): void => {
      yaw += 1 / 60;
      try { cube.setRotation(0, yaw, 0); } catch { cube = app.nodes.require("cube"); cube.setRotation(0, yaw, 0); }
      app.step(1 / 60);
    };
    frame();
    finish();
    const firstFrameMs = performance.now();
    window.__FRAME_COST__ = {
      ready: true,
      scene: sceneName,
      quality,
      firstFrameMs,
      mountMs: firstFrameMs - mountStart,
      errors,
      renderPath: (app.diagnostics() as { renderPath?: unknown }).renderPath,
      measure(frames) {
        for (let i = 0; i < 10; i += 1) { frame(); finish(); }
        const cpuMs: number[] = [];
        const totalMs: number[] = [];
        for (let i = 0; i < frames; i += 1) {
          const t0 = performance.now();
          frame();
          const t1 = performance.now();
          finish();
          const t2 = performance.now();
          cpuMs.push(t1 - t0);
          totalMs.push(t2 - t0);
        }
        return { cpuMs, totalMs };
      },
      stepOnce() { frame(); finish(); },
      drawCalls: () => app.diagnostics().drawCalls
    };
  } catch (error) {
    errors.push(`start failed: ${(error as Error)?.stack ?? error}`);
    window.__FRAME_COST__ = { ready: false, scene: sceneName, quality, firstFrameMs: -1, mountMs: -1, errors, renderPath: null, measure: () => ({ cpuMs: [], totalMs: [] }), stepOnce: () => undefined, drawCalls: () => 0 };
  }
}

void main();
