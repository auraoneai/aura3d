/**
 * J1 governor 60fps-hold wall-clock probe.
 *
 * Closed loop, no synthetic telemetry: every governor step consumes the real
 * requestAnimationFrame wall-clock delta of a real `@aura3d/rendering` frame,
 * and every governor knob is applied back to that same frame:
 * - resolutionScale -> Renderer.resize (real backing-store change)
 * - particleScale   -> drawn instance count (real draw-count change)
 * - lodBias         -> submitted fraction, ceil(candidate / lodBias) (real cull)
 * - shadowSize      -> renderer-owned shadow map size (real depth-target realloc)
 *
 * Ramp phase doubles the instance load until a measurement window actually
 * goes over budget, so the degrade phase below always starts from genuine
 * over-budget wall-clock frames (or reports holds-60fps-no-degrade-needed
 * with numbers when even the cap holds 60fps).
 */
import {
  Geometry,
  InstancedUnlitMaterial,
  Renderer,
  type RenderItem
} from "@aura3d/rendering";
import { DirectionalLight, Scene } from "@aura3d/scene";
import {
  createPerformanceGovernor,
  createSideViewGameRenderPreset,
  type GamePerFramePerfTelemetry
} from "@aura3d/engine/production-runtime";

const DEGRADE_ORDER = ["resolutionScale", "particleScale", "lodBias", "shadowSize"] as const;

interface GovernorHoldRung {
  readonly settings: { readonly resolutionScale: number; readonly lodBias: number; readonly particleScale: number; readonly shadowSize: number };
  readonly degraded: readonly string[];
  readonly windowFps: number;
  readonly windowFrameMs: number;
  readonly draws: number;
  readonly drawnInstances: number;
  readonly shadowMounted: boolean;
}

interface GovernorHoldReport {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly wallClock: { readonly rafFrames: number; readonly totalMs: number };
  readonly rampInstances: number;
  readonly rampWindowFps: number;
  readonly nonBlackPixels: number;
  readonly realWebGL2: boolean;
  readonly shadowMounted: boolean;
  readonly degraded: readonly string[];
  readonly orderValid: boolean;
  readonly rungs: readonly GovernorHoldRung[];
  /** holds-60fps-after-degrade | holds-60fps-no-degrade-needed | blocked-fully-degraded-below-60fps | inconclusive-timeout */
  readonly verdict: string;
  readonly finalFps: number;
}

declare global {
  interface Window {
    __a3dGovernorHold?: GovernorHoldReport;
  }
}

void run();

async function run(): Promise<void> {
  const pageStart = performance.now();
  const params = new URLSearchParams(location.search);
  const startInstances = Math.max(64, Number(params.get("instances") ?? 16_384));
  const capInstances = Math.max(startInstances, Number(params.get("cap") ?? 131_072));
  const windowFrames = Math.max(10, Number(params.get("window") ?? 30));
  const deadlineMs = Number(params.get("deadlineMs") ?? 120_000);
  try {
    const canvas = document.getElementById("viewport");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing canvas#viewport.");
    const baseWidth = canvas.width;
    const baseHeight = canvas.height;
    const budget = createSideViewGameRenderPreset().performanceBudget;
    let governor = createPerformanceGovernor("conservative");

    const scene = new Scene();
    const key = new DirectionalLight("governor-hold-key");
    key.castsShadow = true;
    key.intensity = 1.2;
    scene.root.addChild(key);

    const material = new InstancedUnlitMaterial({ name: "governor-hold-instanced", color: [0.95, 0.52, 0.15, 1] });
    const triangle = Geometry.triangle();
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: baseWidth,
      height: baseHeight,
      preserveDrawingBuffer: true,
      clearColor: [0.006, 0.008, 0.012, 1]
    });
    const realWebGL2 = renderer.device.kind === "webgl2";

    let candidateInstances = startInstances;
    let rafFrames = 0;
    let shadowMounted = true;
    const timedOut = (): boolean => performance.now() - pageStart > deadlineMs;

    const buildItems = (drawn: number): RenderItem[] => {
      const items: RenderItem[] = [];
      for (let start = 0; start < drawn; start += 64) {
        const count = Math.min(64, drawn - start);
        items.push({ geometry: triangle, material, instanceTransforms: buildInstanceMatrices(start, count), label: `governor-hold-${start}` });
      }
      return items;
    };

    // Measures one window of real rAF wall-clock frames at the given load and
    // returns the mean fps. Every frame here is a real render + real timestamp.
    const measureWindow = async (drawn: number, shadowSize: number): Promise<{ fps: number; frameMs: number; draws: number; shadowOk: boolean }> => {
      const items = buildItems(drawn);
      let shadowOk = true;
      let draws = 0;
      let sumDt = 0;
      let frames = 0;
      let lastStart = await nextFrame();
      rafFrames += 1;
      for (let frame = 0; frame < windowFrames; frame += 1) {
        // Wall-clock frame interval: rAF timestamp to rAF timestamp, so the
        // reading covers render cost + display idle, never render cost alone.
        const frameStart = await nextFrame();
        rafFrames += 1;
        const dt = frameStart - lastStart;
        lastStart = frameStart;
        try {
          const diagnostics = renderer.render({
            scene,
            renderItems: items,
            shadow: { enabled: true, size: shadowSize, strength: 0.38, light: key }
          });
          draws = diagnostics.drawCalls;
        } catch {
          // Renderer-owned shadows are optional for the hold proof: without a
          // shadow pass the shadowSize rung is recorded but not mounted.
          shadowOk = false;
          const diagnostics = renderer.render(items);
          draws = diagnostics.drawCalls;
        }
        sumDt += dt;
        frames += 1;
      }
      const frameMs = sumDt / Math.max(1, frames);
      return { fps: 1000 / Math.max(frameMs, 0.001), frameMs, draws, shadowOk };
    };

    // RAMP: double the load until a window genuinely goes over budget.
    let rampWindowFps = 0;
    let rampWindow = { fps: 0, frameMs: 0, draws: 0, shadowOk: true };
    for (;;) {
      rampWindow = await measureWindow(candidateInstances, governor.settings.shadowSize);
      rampWindowFps = rampWindow.fps;
      shadowMounted = rampWindow.shadowOk;
      const overBudget = rampWindow.frameMs > budget.maxFrameTimeMs || rampWindowFps < budget.minFps;
      if (overBudget || candidateInstances >= capInstances || timedOut()) break;
      candidateInstances = Math.min(capInstances, candidateInstances * 2);
    }

    const rungs: GovernorHoldRung[] = [];
    const overBudgetAtCap = rampWindow.frameMs > budget.maxFrameTimeMs || rampWindowFps < budget.minFps;
    let verdict: string;
    let finalFps = rampWindowFps;

    if (!overBudgetAtCap) {
      verdict = timedOut() ? "inconclusive-timeout" : "holds-60fps-no-degrade-needed";
    } else {
      // DEGRADE: step the governor once per measured window and apply every
      // knob back to the real frame it will be measured on.
      verdict = "inconclusive-timeout";
      for (let rung = 0; rung < 12; rung += 1) {
        if (timedOut()) break;
        const settings = governor.settings;
        renderer.resize(
          Math.max(64, Math.round(baseWidth * settings.resolutionScale)),
          Math.max(64, Math.round(baseHeight * settings.resolutionScale))
        );
        const drawn = Math.max(64, Math.floor((candidateInstances * settings.particleScale) / settings.lodBias));
        const window = await measureWindow(drawn, settings.shadowSize);
        if (!window.shadowOk) shadowMounted = false;
        const telemetry: GamePerFramePerfTelemetry = {
          fps: window.fps,
          frameTimeMs: window.frameMs,
          draws: window.draws,
          tris: drawn,
          particles: drawn,
          shadowBytes: window.shadowOk ? settings.shadowSize * settings.shadowSize * 4 : 0
        };
        governor = governor.step(telemetry, budget);
        rungs.push({
          settings: { ...governor.settings },
          degraded: [...governor.degraded],
          windowFps: Number(window.fps.toFixed(2)),
          windowFrameMs: Number(window.frameMs.toFixed(3)),
          draws: window.draws,
          drawnInstances: drawn,
          shadowMounted: window.shadowOk
        });
        finalFps = window.fps;
        if (window.fps >= budget.minFps) {
          verdict = "holds-60fps-after-degrade";
          break;
        }
        const s = governor.settings;
        if (s.resolutionScale === 0.5 && s.particleScale === 0.2 && s.lodBias === 2 && s.shadowSize === 256) {
          // One more window at full degradation to confirm the floor reading.
          const floor = await measureWindow(
            Math.max(64, Math.floor((candidateInstances * 0.2) / 2)),
            256
          );
          finalFps = floor.fps;
          verdict = floor.fps >= budget.minFps ? "holds-60fps-after-degrade" : "blocked-fully-degraded-below-60fps";
          break;
        }
      }
    }

    renderer.resize(baseWidth, baseHeight);
    // One real frame after the final resize: resize reallocates the drawing
    // buffer, so readPixels without a fresh render would read a blank target.
    renderer.render(buildItems(Math.min(candidateInstances, 2048)));
    await nextFrame();
    const pixels = analyzePixels(renderer.device.readPixels(0, 0, canvas.width, canvas.height));
    const degraded = [...governor.degraded];
    window.__a3dGovernorHold = {
      status: "ready",
      wallClock: { rafFrames, totalMs: Number((performance.now() - pageStart).toFixed(1)) },
      rampInstances: candidateInstances,
      rampWindowFps: Number(rampWindowFps.toFixed(2)),
      nonBlackPixels: pixels.nonBlackPixels,
      realWebGL2,
      shadowMounted,
      degraded,
      orderValid: isOrderPrefix(degraded),
      rungs,
      verdict,
      finalFps: Number(finalFps.toFixed(2))
    };
    renderer.dispose();
  } catch (error) {
    window.__a3dGovernorHold = {
      status: "error",
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      wallClock: { rafFrames: 0, totalMs: Number((performance.now() - pageStart).toFixed(1)) },
      rampInstances: 0,
      rampWindowFps: 0,
      nonBlackPixels: 0,
      realWebGL2: false,
      shadowMounted: false,
      degraded: [],
      orderValid: false,
      rungs: [],
      verdict: "inconclusive-timeout",
      finalFps: 0
    };
  }
}

/** First-degrade occurrences must follow resolution -> particles -> LOD -> shadow. */
function isOrderPrefix(degraded: readonly string[]): boolean {
  const first = new Map<string, number>();
  for (let index = 0; index < degraded.length; index += 1) {
    const name = degraded[index] ?? "";
    if (!name.startsWith("recovered:") && !first.has(name)) first.set(name, index);
  }
  let cursor = -1;
  for (const knob of DEGRADE_ORDER) {
    const at = first.get(knob);
    if (at === undefined) continue;
    if (at < cursor) return false;
    cursor = at;
  }
  return true;
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame((time) => resolve(time));
  });
}

function buildInstanceMatrices(start: number, count: number): Float32Array {
  const matrices = new Float32Array(count * 16);
  for (let index = 0; index < count; index += 1) {
    const instance = start + index;
    const column = instance % 128;
    const row = Math.floor(instance / 128);
    matrices.set([
      0.02, 0, 0, 0,
      0, 0.02, 0, 0,
      0, 0, 0.02, 0,
      -0.94 + column * 0.0148, -0.88 + row * 0.03, 0, 1
    ], index * 16);
  }
  return matrices;
}

function analyzePixels(pixels: Uint8Array): { readonly nonBlackPixels: number } {
  let nonBlackPixels = 0;
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    if ((pixels[offset] ?? 0) + (pixels[offset + 1] ?? 0) + (pixels[offset + 2] ?? 0) > 12) nonBlackPixels += 1;
  }
  return { nonBlackPixels };
}
