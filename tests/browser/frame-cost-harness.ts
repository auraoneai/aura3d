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
  /** Pixel statistics of the very first frame (WP-8): mean RGB over the whole buffer, and over the pixels that are not the clear colour. */
  firstFrame?: FrameStats;
  /** Probe state read right after the first frame was drawn (WP-8). */
  firstFrameProbe?: Record<string, unknown>;
  /** `a3d:` performance marks, in ms relative to the start of main() (WP-8). */
  marks?: Record<string, number>;
  probeSnapshot?(): Record<string, unknown>;
  /** Pixel statistics of the current drawing buffer (WP-8). */
  frameStats?(): FrameStats;
  /** `warmup` frames run first and are not measured (default 10; the gate figure uses the default). */
  measure(frames: number, warmup?: number): { cpuMs: number[]; totalMs: number[] };
  /** Advance and draw exactly one frame (no warm-up). */
  stepOnce(): void;
  /** Advance `frames` frames, then read the whole drawing buffer back (RGBA, row 0 = bottom) as base64. Same yaw for the same `frames` on any build. */
  snapshot(frames: number): { width: number; height: number; rgbaBase64: string };
  drawCalls(): number;
}
declare global { interface Window { __FRAME_COST__?: FrameCostApi } }

interface FrameStats { width: number; height: number; meanRgb: [number, number, number]; nonBlack: number; lumaMean: number; litMeanRgb: [number, number, number]; litPixels: number }

/** Statistics over the whole drawing buffer. "Lit" pixels are those that differ from the buffer's corner pixel (the clear colour). */
function readFirstFrame(gl: WebGL2RenderingContext): FrameStats {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const px = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const bg = [px[0]!, px[1]!, px[2]!];
  const sum = [0, 0, 0];
  const litSum = [0, 0, 0];
  let lit = 0;
  let nonBlack = 0;
  for (let i = 0; i < px.length; i += 4) {
    const differs = px[i] !== bg[0] || px[i + 1] !== bg[1] || px[i + 2] !== bg[2];
    for (let c = 0; c < 3; c += 1) {
      sum[c]! += px[i + c]!;
      if (differs) litSum[c]! += px[i + c]!;
    }
    if (px[i] || px[i + 1] || px[i + 2]) nonBlack += 1;
    if (differs) lit += 1;
  }
  const n = width * height;
  const mean = sum.map((s) => s / n) as [number, number, number];
  return {
    width,
    height,
    meanRgb: mean,
    nonBlack,
    lumaMean: 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2],
    litMeanRgb: litSum.map((s) => (lit ? s / lit : 0)) as [number, number, number],
    litPixels: lit
  };
}

function probeSnapshot(app: ReturnType<typeof createAuraApp>): Record<string, unknown> {
  const d = app.diagnostics() as unknown as Record<string, unknown>;
  const pick = (o: unknown, keys: string[]): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (o && typeof o === "object") for (const k of keys) if (k in (o as object)) out[k] = (o as Record<string, unknown>)[k];
    return out;
  };
  return { ...pick(d, ["hdriStatus", "iblPixelBacked", "environmentProbeStatus"]), ...pick(d.environment, ["hdriStatus", "iblPixelBacked", "probe", "probeStatus", "status", "source"]) };
}

function a3dMarks(origin: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of performance.getEntriesByType("mark")) if (entry.name.startsWith("a3d:")) out[entry.name] = Math.round((entry.startTime - origin) * 10) / 10;
  return out;
}

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
  makeScene(name: "cube" | "pbr" | "bloom" | "lit" | "fog"): ReturnType<typeof scene>;
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
  if (name === "lit" || name === "fog") {
    // Authored background, hemisphere + coloured sun, rough/metal/emissive materials, optionally forward fog: the direct
    // path's parity scenes (no post, no HDR output, no transmission).
    const lit = scene()
      .background("#1a2030")
      .camera(view)
      .add(lights.hemisphere({ skyColor: "#cfe3ff", groundColor: "#3a2f28", intensity: 0.8 }))
      .add(lights.directional({ position: [4, 6, 3], intensity: 2.4, color: "#fff2dd" }))
      .add(primitives.plane({ name: "floor", size: [10, 10], material: material.pbr({ color: "#7a8a6a", roughness: 0.95 }) }).rotate(-Math.PI / 2, 0, 0))
      .add(primitives.box({ name: "cube", size: [1, 1, 1], material: material.pbr({ color: "#d86a3a", roughness: 0.5 }) }).position(-1.2, 0.5, 0).runtime({ id: "cube" }))
      .add(primitives.sphere({ name: "ball", material: material.pbr({ color: "#4aa3df", metallic: 0.8, roughness: 0.25 }) }).position(0.4, 0.5, 0.6))
      .add(primitives.cylinder({ name: "post", material: material.pbr({ color: "#e0c040", roughness: 0.7, emissive: "#301800" }) }).position(1.6, 0.6, -0.4).scale(0.5));
    return name === "fog" ? lit.add(effects.fog({ density: 0.08 })) : lit;
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
    // WP-8: what the very first frame looked like, read in the task that drew it (the drawing buffer is only guaranteed until
    // the page composites), and which environment probe it was lit with.
    const firstFrame = readFirstFrame(gl);
    const firstFrameProbe = probeSnapshot(app);
    window.__FRAME_COST__ = {
      ready: true,
      scene: sceneName,
      quality,
      firstFrameMs,
      mountMs: firstFrameMs - mountStart,
      firstFrame,
      firstFrameProbe,
      marks: a3dMarks(mountStart),
      probeSnapshot: () => probeSnapshot(app),
      frameStats: () => readFirstFrame(gl),
      errors,
      renderPath: (app.diagnostics() as { renderPath?: unknown }).renderPath,
      measure(frames, warmup = 10) {
        for (let i = 0; i < warmup; i += 1) { frame(); finish(); }
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
      snapshot(frames) {
        for (let i = 0; i < frames; i += 1) frame();
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        // Read in the task that rendered: the drawing buffer is only guaranteed until the page composites.
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let binary = "";
        for (let i = 0; i < pixels.length; i += 0x8000) binary += String.fromCharCode(...pixels.subarray(i, i + 0x8000));
        return { width, height, rgbaBase64: btoa(binary) };
      },
      drawCalls: () => app.diagnostics().drawCalls
    };
  } catch (error) {
    errors.push(`start failed: ${(error as Error)?.stack ?? error}`);
    window.__FRAME_COST__ = { ready: false, scene: sceneName, quality, firstFrameMs: -1, mountMs: -1, errors, renderPath: null, measure: () => ({ cpuMs: [], totalMs: [] }), stepOnce: () => undefined, snapshot: () => ({ width: 0, height: 0, rgbaBase64: "" }), drawCalls: () => 0 };
  }
}

void main();
