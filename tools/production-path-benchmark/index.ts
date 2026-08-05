/**
 * WS-1.4 — the real production-path benchmark, and the readiness gate that reads it.
 *
 * What this replaces
 * ------------------
 * Two instruments used to supply this project's performance claims, and neither measured an engine:
 *
 * 1. `tests/browser/external-parity-large-scene.spec.ts` (deleted in WS-1.1) drew 640 `fillRect`s on
 *    a Canvas 2D context and returned `cpuFrameMs: 13.8` as a literal constant in its own source.
 * 2. `tools/compare-engines/index.ts` (relabelled in WS-1.2) compiles a 6-line shader and draws a
 *    3-vertex triangle through a raw WebGL2 context, importing none of the three engines.
 *
 * R1 requires evidence that executes the public production path. Here both engines are bundled from
 * a public entry point — `@aura3d/engine` and `three` — and both draw the same scene on the same
 * real WebGL2 device in the same browser.
 *
 * Timing taxonomy
 * ---------------
 * Fields are named after what they measure, and never conflated. In particular
 * `gpuTimerQueryMs` is only populated from `EXT_disjoint_timer_query_webgl2` via the renderer's own
 * `createWebGL2GpuTimingBackend`, which handles `GPU_DISJOINT_EXT`. When the extension is
 * unavailable the field is `null` with a reason — an honest null, not a CPU number wearing a GPU
 * label.
 *
 * Usage:
 *   tsx tools/production-path-benchmark/index.ts            # measure, then gate
 *   tsx tools/production-path-benchmark/index.ts --gate-only # gate an existing report
 */
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";
import { requireFreshDist } from "../dist-freshness/index";
import { chromium, type Browser } from "@playwright/test";
import { PRODUCTION_PATH_BENCHMARK_SCENE, type BenchmarkSceneDefinition } from "./scene";

const REPORT_PATH = "tests/reports/production-path-benchmark.json";

/** Independent browser sessions. ≥ 3 is the PRD's minimum; variance across them is reported. */
const SESSIONS = 3;

type Engine = "aura3d" | "threejs";

interface FrameSampleStats {
  readonly min: number;
  readonly median: number;
  readonly p95: number;
  readonly max: number;
  readonly stddev: number;
  readonly sampleCount: number;
}

interface SessionMeasurement {
  readonly session: number;
  readonly engine: Engine;
  /** Time spent in the engine's own draw call, CPU side. Submission, not completion. */
  readonly cpuFrameSubmissionMs: FrameSampleStats;
  /** Wall-clock interval between successive `requestAnimationFrame` callbacks. */
  readonly rafIntervalMs: FrameSampleStats;
  /** From `EXT_disjoint_timer_query_webgl2` only. `null` when unsupported or disjoint. */
  readonly gpuTimerQueryMs: FrameSampleStats | null;
  readonly gpuTimerQueryUnavailableReason: string | null;
  /** First frame including shader compilation and pipeline creation. */
  readonly firstFrameCompileMs: number;
  /** Median CPU submission after warmup. The headline number, named for what it is. */
  readonly steadyStateFrameMs: number;
  /** Total wall-clock duration of the measured window divided by frame count. */
  readonly wallClockFrameMs: number;
  readonly browserReportedMemoryMb: number | null;
  readonly drawnObjectCount: number;
  readonly nonBlankPixels: number;
  readonly realWebGL2: boolean;
}

interface EngineSummary {
  readonly engine: Engine;
  readonly bundleBytes: number;
  readonly steadyStateFrameMs: number;
  readonly steadyStateFrameMsPerSession: readonly number[];
  readonly steadyStateVarianceMs: number;
  readonly cpuFrameSubmissionMs: FrameSampleStats;
  readonly rafIntervalMs: FrameSampleStats;
  readonly gpuTimerQueryMs: FrameSampleStats | null;
  readonly gpuTimerQueryUnavailableReason: string | null;
  readonly firstFrameCompileMs: number;
  readonly wallClockFrameMs: number;
  readonly browserReportedMemoryMb: number | null;
  readonly sessions: readonly SessionMeasurement[];
}

interface BrowserFrameReport {
  readonly cpuFrameSubmissionSamples: readonly number[];
  readonly rafIntervalSamples: readonly number[];
  readonly gpuTimerQuerySamples: readonly number[];
  readonly gpuTimerQueryUnavailableReason: string | null;
  readonly firstFrameCompileMs: number;
  readonly wallClockTotalMs: number;
  readonly measuredFrames: number;
  readonly browserReportedMemoryMb: number | null;
  readonly drawnObjectCount: number;
  readonly nonBlankPixels: number;
  readonly realWebGL2: boolean;
}

/* ------------------------------------------------------------------------------------------- */
/* Statistics                                                                                   */
/* ------------------------------------------------------------------------------------------- */

function stats(samples: readonly number[]): FrameSampleStats {
  if (samples.length === 0) {
    return { min: 0, median: 0, p95: 0, max: 0, stddev: 0, sampleCount: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
  const variance = sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / sorted.length;
  return {
    min: round(sorted[0]!),
    median: round(sorted[Math.floor(sorted.length / 2)]!),
    p95: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!),
    max: round(sorted[sorted.length - 1]!),
    stddev: round(Math.sqrt(variance)),
    sampleCount: sorted.length
  };
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

/* ------------------------------------------------------------------------------------------- */
/* Browser bundles — each built from a public entry point                                       */
/* ------------------------------------------------------------------------------------------- */

/**
 * Shared browser-side helpers, injected into both bundles verbatim.
 *
 * Both engines therefore share the timing loop, the pixel check and the statistic collection, so a
 * difference in the numbers cannot come from a difference in how they were timed.
 */
function sharedHarness(): string {
  return `
    function hexToLinearRgb(hex) {
      const value = hex.replace("#", "");
      const srgb = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
      return srgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
    }
    function countNonBlankPixels(canvas) {
      const probe = document.createElement("canvas");
      probe.width = canvas.width;
      probe.height = canvas.height;
      const context = probe.getContext("2d");
      context.drawImage(canvas, 0, 0);
      const data = context.getImageData(0, 0, probe.width, probe.height).data;
      let count = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] > 24 || data[index + 1] > 24 || data[index + 2] > 24) count += 1;
      }
      return count;
    }
    function browserReportedMemoryMb() {
      const memory = performance.memory;
      if (!memory || typeof memory.usedJSHeapSize !== "number") return null;
      return Number((memory.usedJSHeapSize / (1024 * 1024)).toFixed(3));
    }
    /**
     * Drive N frames through requestAnimationFrame, timing each one three ways.
     *
     * \`drawFrame\` is expected to submit exactly one frame synchronously and return nothing. The
     * caller supplies a gpu timing hook when the extension is available; when it is not, the samples
     * array stays empty and a reason is reported rather than substituting CPU time.
     */
    async function runTimedFrames(options) {
      const { drawFrame, warmupFrames, measuredFrames, gpu } = options;
      let firstFrameCompileMs = 0;
      const cpuFrameSubmissionSamples = [];
      const rafIntervalSamples = [];
      const gpuTimerQuerySamples = [];
      let previousRafTime = 0;
      let frame = 0;
      let wallClockStart = 0;
      await new Promise((resolveLoop) => {
        const tick = (rafTime) => {
          const measuring = frame >= warmupFrames;
          if (frame === warmupFrames) wallClockStart = performance.now();
          const token = measuring && gpu ? gpu.begin("frame") : undefined;
          const started = performance.now();
          drawFrame(frame);
          const cpuMs = performance.now() - started;
          if (token && gpu) gpu.end(token, cpuMs);
          if (frame === 0) firstFrameCompileMs = cpuMs;
          if (measuring) {
            cpuFrameSubmissionSamples.push(cpuMs);
            if (previousRafTime > 0) rafIntervalSamples.push(rafTime - previousRafTime);
            if (gpu) {
              for (const result of gpu.collectAvailable()) gpuTimerQuerySamples.push(result.durationMs);
            }
          }
          previousRafTime = rafTime;
          frame += 1;
          if (frame >= warmupFrames + measuredFrames) {
            resolveLoop();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      // Drain any timer queries still in flight at the end of the window.
      if (gpu) {
        for (let attempt = 0; attempt < 12 && gpuTimerQuerySamples.length < measuredFrames; attempt += 1) {
          await new Promise((r) => setTimeout(r, 16));
          for (const result of gpu.collectAvailable()) gpuTimerQuerySamples.push(result.durationMs);
        }
      }
      return {
        cpuFrameSubmissionSamples,
        rafIntervalSamples,
        gpuTimerQuerySamples,
        firstFrameCompileMs,
        wallClockTotalMs: performance.now() - wallClockStart,
        measuredFrames: cpuFrameSubmissionSamples.length
      };
    }
  `;
}

/**
 * The Aura3D bundle. Imports `@aura3d/engine` — the documented public entry point — and nothing
 * else from this repository. No `@aura3d/*\/src/*` deep import appears here, which is what makes
 * this evidence admissible under R1.
 */
function aura3dBundleSource(): string {
  return `
    import { createAuraApp, scene, primitives, material, camera, lights } from "@aura3d/engine";
    import { createWebGL2GpuTimingBackend, createCpuFallbackGpuTimingBackend } from "@aura3d/engine/rendering";
    ${sharedHarness()}
    async function runProductionPathBenchmark(canvas, definition) {
      const built = scene().background(definition.background).camera(camera.perspective({
        position: definition.camera.position,
        target: definition.camera.target,
        fov: definition.camera.fovYDegrees
      }));
      built.add(lights.directional({
        name: "benchmark key light",
        intensity: definition.directionalLight.intensity,
        color: definition.directionalLight.color
      }).position(...definition.directionalLight.position));
      built.add(lights.ambient({ name: "benchmark ambient", intensity: definition.ambientIntensity }));
      for (let index = 0; index < definition.objects.length; index += 1) {
        const object = definition.objects[index];
        built.add(primitives.box({
          name: "benchmark box " + (index + 1),
          material: material.pbr({
            color: object.color,
            roughness: object.roughness,
            metalness: object.metalness
          })
        }).position(object.x, object.y, object.z).scale([object.scale, object.scale, object.scale]));
      }
      const app = createAuraApp(canvas, {
        scene: built,
        // The loop is driven by the harness so both engines are stepped identically.
        autoStart: false,
        pixelRatio: definition.pixelRatio,
        resize: false
      });
      const gl = canvas.getContext("webgl2");
      const gpu = gl ? createWebGL2GpuTimingBackend(gl) : createCpuFallbackGpuTimingBackend("no webgl2 context on the benchmark canvas");
      const timed = await runTimedFrames({
        warmupFrames: definition.warmupFrames,
        measuredFrames: definition.measuredFrames,
        gpu: gpu.supported ? gpu : undefined,
        drawFrame: () => app.step(1 / 60)
      });
      const diagnostics = app.diagnostics();
      const result = {
        ...timed,
        gpuTimerQueryUnavailableReason: gpu.supported ? null : (gpu.unavailableReason || "GPU timer query unsupported"),
        browserReportedMemoryMb: browserReportedMemoryMb(),
        drawnObjectCount: diagnostics.drawCalls,
        nonBlankPixels: countNonBlankPixels(canvas),
        realWebGL2: diagnostics.backend === "webgl2" || diagnostics.backend === "webgpu"
      };
      app.dispose();
      return result;
    }
    globalThis.A3D_production_path_benchmark = { runProductionPathBenchmark };
  `;
}

/** The Three.js bundle. Imports `three` from the published package, same as any developer would. */
function threejsBundleSource(): string {
  return `
    import * as THREE from "three";
    ${sharedHarness()}
    async function runProductionPathBenchmark(canvas, definition) {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(definition.pixelRatio);
      renderer.setSize(canvas.width, canvas.height, false);
      renderer.setClearColor(new THREE.Color(definition.background), 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        definition.camera.fovYDegrees,
        canvas.width / canvas.height,
        definition.camera.near,
        definition.camera.far
      );
      camera.position.set(...definition.camera.position);
      camera.lookAt(new THREE.Vector3(...definition.camera.target));
      const key = new THREE.DirectionalLight(new THREE.Color(definition.directionalLight.color), definition.directionalLight.intensity);
      key.position.set(...definition.directionalLight.position);
      scene.add(key);
      scene.add(new THREE.AmbientLight(0xffffff, definition.ambientIntensity));
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      /*
       * One Mesh per object with its own Material, deliberately.
       *
       * Three.js could draw this as a single InstancedMesh and win by a wide margin, and Aura3D
       * could be asked for instancing too. Neither is done here: the comparison is per-object
       * submission, which is the path a developer writes first, and it is the same path in both.
       * An instanced scenario is a separate measurement, not a way to make one side look good.
       */
      for (const object of definition.objects) {
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
          color: new THREE.Color(object.color),
          roughness: object.roughness,
          metalness: object.metalness
        }));
        mesh.position.set(object.x, object.y, object.z);
        mesh.scale.setScalar(object.scale);
        scene.add(mesh);
      }
      const gl = renderer.getContext();
      const extension = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      const pending = [];
      const gpu = extension ? {
        supported: true,
        begin() {
          const query = gl.createQuery();
          if (query) gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
          return { query };
        },
        end(token) {
          if (!token.query) return;
          gl.endQuery(extension.TIME_ELAPSED_EXT);
          pending.push(token);
        },
        collectAvailable() {
          const out = [];
          for (let index = pending.length - 1; index >= 0; index -= 1) {
            const token = pending[index];
            const available = gl.getQueryParameter(token.query, gl.QUERY_RESULT_AVAILABLE);
            const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
            if (disjoint) { pending.splice(index, 1); continue; }
            if (!available) continue;
            pending.splice(index, 1);
            out.push({ durationMs: gl.getQueryParameter(token.query, gl.QUERY_RESULT) / 1e6 });
          }
          return out;
        }
      } : undefined;
      const timed = await runTimedFrames({
        warmupFrames: definition.warmupFrames,
        measuredFrames: definition.measuredFrames,
        gpu,
        drawFrame: () => renderer.render(scene, camera)
      });
      const result = {
        ...timed,
        gpuTimerQueryUnavailableReason: extension ? null : "EXT_disjoint_timer_query_webgl2 unavailable in this browser session",
        browserReportedMemoryMb: browserReportedMemoryMb(),
        drawnObjectCount: renderer.info.render.calls,
        nonBlankPixels: countNonBlankPixels(canvas),
        realWebGL2: renderer.getContext() instanceof WebGL2RenderingContext
      };
      renderer.dispose();
      return result;
    }
    globalThis.A3D_production_path_benchmark = { runProductionPathBenchmark };
  `;
}

async function buildBundle(engine: Engine): Promise<string> {
  const result = await build({
    stdin: {
      contents: engine === "aura3d" ? aura3dBundleSource() : threejsBundleSource(),
      resolveDir: process.cwd(),
      sourcefile: `${engine}-production-path-benchmark.ts`,
      loader: "ts"
    },
    bundle: true,
    platform: "browser",
    /*
     * ESM, not IIFE.
     *
     * `agent-api/index.ts:1655` resolves its bundled humanoid fixture with
     * `new URL("./assets/humanoid-fixture.glb", import.meta.url)` at module scope. esbuild warns that
     * `import.meta` is empty under `iife`, and the result is a module that throws
     * `Failed to construct 'URL': Invalid URL` before a single export is reachable — the whole public
     * entry point fails to initialise. The bundle is therefore ESM and is served from a real origin
     * rather than injected into `about:blank`, which is also closer to how a developer ships it.
     */
    format: "esm",
    target: "es2022",
    write: false,
    minify: true,
    sourcemap: false,
    logLevel: "warning",
    // FfmpegFrameEncoder probes Node builtins behind a dynamic import; a browser bundler treats them
    // as external, so this reflects what a browser consumer actually pays.
    external: ["node:child_process", "node:fs/promises", "node:os", "node:path", "node:fs", "node:crypto", "node:url"]
  });
  const output = result.outputFiles[0]?.text;
  if (!output) throw new Error(`Unable to build the ${engine} production-path benchmark bundle.`);
  return output;
}

/* ------------------------------------------------------------------------------------------- */
/* Measurement                                                                                  */
/* ------------------------------------------------------------------------------------------- */

/**
 * Serve one bundle from a throwaway localhost origin.
 *
 * Required, not cosmetic: the public entry point resolves a bundled asset URL against
 * `import.meta.url` during module evaluation, which cannot work on `about:blank`.
 */
async function serveBundle(bundle: string, background: string): Promise<{ readonly origin: string; readonly close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    if (request.url === "/bundle.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(bundle);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:${background}"><script type="module" src="/bundle.js"></script></body></html>`);
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose()))
  };
}

async function measure(
  browser: Browser,
  engine: Engine,
  bundle: string,
  definition: BenchmarkSceneDefinition,
  session: number
): Promise<SessionMeasurement> {
  const host = await serveBundle(bundle, definition.background);
  const page = await browser.newPage({
    viewport: { width: definition.canvas.width, height: definition.canvas.height },
    deviceScaleFactor: definition.pixelRatio
  });
  page.setDefaultTimeout(180_000);
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  try {
    await page.goto(`${host.origin}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as Record<string, unknown>).A3D_production_path_benchmark), undefined, { timeout: 60_000 });
    const report = await page.evaluate<BrowserFrameReport, { readonly engine: Engine; readonly definition: BenchmarkSceneDefinition }>(
      async ({ engine, definition }) => {
        const canvas = document.createElement("canvas");
        canvas.width = definition.canvas.width;
        canvas.height = definition.canvas.height;
        canvas.style.width = `${definition.canvas.width}px`;
        canvas.style.height = `${definition.canvas.height}px`;
        document.body.replaceChildren(canvas);
        const namespace = (window as unknown as Record<string, { readonly runProductionPathBenchmark?: (canvas: HTMLCanvasElement, definition: BenchmarkSceneDefinition) => Promise<BrowserFrameReport> }>).A3D_production_path_benchmark;
        const run = namespace?.runProductionPathBenchmark;
        if (!run) throw new Error(`Missing browser entry for ${engine}: A3D_production_path_benchmark.runProductionPathBenchmark`);
        return run(canvas, definition);
      },
      { engine, definition }
    );
    if (consoleErrors.length > 0) {
      throw new Error(`${engine} session ${session} raised page errors: ${consoleErrors.join(" | ")}`);
    }
    const cpu = stats(report.cpuFrameSubmissionSamples);
    return {
      session,
      engine,
      cpuFrameSubmissionMs: cpu,
      rafIntervalMs: stats(report.rafIntervalSamples),
      gpuTimerQueryMs: report.gpuTimerQuerySamples.length > 0 ? stats(report.gpuTimerQuerySamples) : null,
      gpuTimerQueryUnavailableReason: report.gpuTimerQuerySamples.length > 0 ? null : (report.gpuTimerQueryUnavailableReason ?? "no GPU timer query samples were returned"),
      firstFrameCompileMs: round(report.firstFrameCompileMs),
      steadyStateFrameMs: cpu.median,
      wallClockFrameMs: report.measuredFrames > 0 ? round(report.wallClockTotalMs / report.measuredFrames) : 0,
      browserReportedMemoryMb: report.browserReportedMemoryMb,
      drawnObjectCount: report.drawnObjectCount,
      nonBlankPixels: report.nonBlankPixels,
      realWebGL2: report.realWebGL2
    };
  } finally {
    await page.close().catch(() => undefined);
    await host.close().catch(() => undefined);
  }
}

function summarize(engine: Engine, bundleBytes: number, sessions: readonly SessionMeasurement[]): EngineSummary {
  const medians = sessions.map((session) => session.steadyStateFrameMs);
  const gpuSamples = sessions.flatMap((session) => (session.gpuTimerQueryMs ? [session.gpuTimerQueryMs.median] : []));
  return {
    engine,
    bundleBytes,
    steadyStateFrameMs: stats(medians).median,
    steadyStateFrameMsPerSession: medians,
    steadyStateVarianceMs: stats(medians).stddev,
    cpuFrameSubmissionMs: stats(sessions.flatMap((session) => [session.cpuFrameSubmissionMs.median])),
    rafIntervalMs: stats(sessions.flatMap((session) => [session.rafIntervalMs.median])),
    gpuTimerQueryMs: gpuSamples.length > 0 ? stats(gpuSamples) : null,
    gpuTimerQueryUnavailableReason: gpuSamples.length > 0 ? null : (sessions[0]?.gpuTimerQueryUnavailableReason ?? "unknown"),
    firstFrameCompileMs: stats(sessions.map((session) => session.firstFrameCompileMs)).median,
    wallClockFrameMs: stats(sessions.map((session) => session.wallClockFrameMs)).median,
    browserReportedMemoryMb: sessions[0]?.browserReportedMemoryMb ?? null,
    sessions
  };
}

async function runBenchmark(): Promise<void> {
  /*
   * `@aura3d/engine` resolves to dist/, not to packages/engine/src, so bundling the public entry point
   * measures the last build. Refuse to measure a stale one: doing so once reported a working
   * anisotropic-GGX implementation as producing byte-identical output.
   */
  requireFreshDist();
  const definition = PRODUCTION_PATH_BENCHMARK_SCENE;
  const bundles = new Map<Engine, string>();
  for (const engine of ["aura3d", "threejs"] as const) {
    bundles.set(engine, await buildBundle(engine));
  }
  const browser = await chromium.launch(launchOptions());
  const environment = await captureEnvironment(browser);
  try {
    const results = new Map<Engine, SessionMeasurement[]>([["aura3d", []], ["threejs", []]]);
    for (let session = 1; session <= SESSIONS; session += 1) {
      for (const engine of ["aura3d", "threejs"] as const) {
        results.get(engine)!.push(await measure(browser, engine, bundles.get(engine)!, definition, session));
      }
    }
    const aura3d = summarize("aura3d", Buffer.byteLength(bundles.get("aura3d")!), results.get("aura3d")!);
    const threejs = summarize("threejs", Buffer.byteLength(bundles.get("threejs")!), results.get("threejs")!);
    writeBenchmarkReport(definition, environment, aura3d, threejs);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/**
 * Same browser selection as `playwright.config.ts`: prefer installed Chrome so the measurement runs
 * on the real GPU. Playwright's bundled Chromium falls back to SwiftShader, a software rasterizer —
 * a legitimate environment to report, but it must be *labelled*, because a software-rasterized frame
 * time says nothing about GPU-bound behaviour.
 */
function launchOptions(): { readonly headless: true; readonly executablePath?: string; readonly args: string[] } {
  const configured = process.env.A3D_WEBGPU_BROWSER_EXECUTABLE;
  const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath = configured || (process.env.A3D_DISABLE_SYSTEM_WEBGPU_BROWSER === "true" ? undefined : existsSync(macChrome) ? macChrome : undefined);
  return {
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"]
  };
}

interface Environment {
  readonly browserVersion: string;
  readonly userAgent: string;
  readonly gpuVendor: string;
  readonly gpuRenderer: string;
  /**
   * True when the reported renderer is a software rasterizer (SwiftShader / llvmpipe / ANGLE
   * software). Reported rather than treated as a failure — but a claim built on a software-rasterized
   * measurement must say so, which is why this is a first-class field rather than something a reader
   * has to infer from the renderer string.
   */
  readonly softwareRasterizer: boolean;
  readonly platform: string;
  readonly headless: true;
  readonly nodeVersion: string;
  readonly os: string;
}

async function captureEnvironment(browser: Browser): Promise<Environment> {
  const page = await browser.newPage();
  try {
    const details = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        gpuVendor: gl && info ? String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL)) : "unavailable",
        gpuRenderer: gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unavailable"
      };
    });
    return {
      browserVersion: browser.version(),
      headless: true,
      nodeVersion: process.version,
      os: `${process.platform} ${process.arch}`,
      softwareRasterizer: /swiftshader|llvmpipe|software/i.test(details.gpuRenderer),
      ...details
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

function writeBenchmarkReport(
  definition: BenchmarkSceneDefinition,
  environment: Environment,
  aura3d: EngineSummary,
  threejs: EngineSummary
): void {
  const checks = gateChecks(definition, aura3d, threejs);
  const failures = checks.filter((check) => !check.pass);
  const report = {
    schema: "a3d-production-path-benchmark",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    rule: "R1 — both engines are bundled from a public entry point (`@aura3d/engine`, `three`) and draw the same scene on the same real WebGL2 device. No value is labelled GPU time unless it came from EXT_disjoint_timer_query_webgl2.",
    interpretationCaveat: environment.softwareRasterizer
      ? `Measured on a software rasterizer (${environment.gpuRenderer}). These numbers compare CPU-side submission cost between the two engines on identical content, which is a valid comparison, but they are not evidence about GPU-bound behaviour. Any claim derived from this report must state the rasterizer.`
      : `Measured on ${environment.gpuRenderer}.`,
    measurementTaxonomy: {
      cpuFrameSubmissionMs: "CPU time inside the engine's own draw call. Submission, not completion.",
      rafIntervalMs: "Wall-clock interval between requestAnimationFrame callbacks. Includes compositing and vsync.",
      gpuTimerQueryMs: "EXT_disjoint_timer_query_webgl2 only, disjoint states discarded. null with a reason when unsupported.",
      firstFrameCompileMs: "First frame, including shader compilation and pipeline creation. Excluded from steady state.",
      steadyStateFrameMs: "Median cpuFrameSubmissionMs after warmup. The headline number.",
      wallClockFrameMs: "Measured-window wall clock divided by frame count.",
      browserReportedMemoryMb: "performance.memory.usedJSHeapSize when the browser exposes it."
    },
    methodology: {
      warmupFrames: definition.warmupFrames,
      measuredFrames: definition.measuredFrames,
      sessions: SESSIONS,
      pixelRatioPinnedTo: definition.pixelRatio,
      identicalCanvas: definition.canvas,
      identicalCameraAndContent: true,
      instancingUsed: false,
      instancingNote: "One mesh per object in both engines. Three.js could win this scene with InstancedMesh and Aura3D could be asked for instancing; that is a separate scenario, not a way to shape this one."
    },
    scene: definition,
    environment,
    aura3d,
    threejs,
    comparison: {
      steadyStateFrameMsRatioAura3dOverThreejs: threejs.steadyStateFrameMs > 0 ? round(aura3d.steadyStateFrameMs / threejs.steadyStateFrameMs) : null,
      bundleBytesRatioAura3dOverThreejs: threejs.bundleBytes > 0 ? round(aura3d.bundleBytes / threejs.bundleBytes) : null,
      note: "A ratio is reported, not a verdict. Interpretation belongs in the parity report under R1 lineage."
    },
    checks,
    failures: failures.map((check) => `${check.id}: ${check.detail}`)
  };
  mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
  writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`aura3d  steadyStateFrameMs=${aura3d.steadyStateFrameMs} drawCalls=${aura3d.sessions[0]?.drawnObjectCount} gpuTimerQueryMs=${aura3d.gpuTimerQueryMs?.median ?? "null"}`);
  console.log(`threejs steadyStateFrameMs=${threejs.steadyStateFrameMs} drawCalls=${threejs.sessions[0]?.drawnObjectCount} gpuTimerQueryMs=${threejs.gpuTimerQueryMs?.median ?? "null"}`);
  console.log(`report: ${REPORT_PATH}`);
  if (failures.length > 0) {
    console.error(report.failures.join("\n"));
    process.exitCode = 1;
  }
}

/* ------------------------------------------------------------------------------------------- */
/* Gate                                                                                         */
/* ------------------------------------------------------------------------------------------- */

interface GateCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

function gateChecks(definition: BenchmarkSceneDefinition, aura3d: EngineSummary, threejs: EngineSummary): readonly GateCheck[] {
  const checks: GateCheck[] = [];
  const add = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
  for (const summary of [aura3d, threejs]) {
    add(`${summary.engine}:real-device`, summary.sessions.every((session) => session.realWebGL2), `${summary.engine} must render on a real WebGL2/WebGPU device, not a mock or a 2D fallback.`);
    add(`${summary.engine}:drew-something`, summary.sessions.every((session) => session.nonBlankPixels > 1_000), `${summary.engine} must produce a non-blank frame; a fast blank frame is not a measurement.`);
    add(`${summary.engine}:sessions`, summary.sessions.length >= 3, `${summary.engine} needs ≥ 3 independent sessions so variance is reportable.`);
    add(`${summary.engine}:samples`, summary.sessions.every((session) => session.cpuFrameSubmissionMs.sampleCount >= definition.measuredFrames * 0.8), `${summary.engine} must contribute at least 80% of the requested measured frames per session.`);
    add(`${summary.engine}:steady-state`, summary.steadyStateFrameMs > 0, `${summary.engine} steady-state frame time must be a measured positive value.`);
  }
  add(
    "draw-calls-comparable",
    (aura3d.sessions[0]?.drawnObjectCount ?? 0) > 0 && (threejs.sessions[0]?.drawnObjectCount ?? 0) > 0,
    "Both engines must report a non-zero draw-call count, so the scene was actually submitted per object in each."
  );
  return checks;
}

function gateOnly(): void {
  const path = resolve(REPORT_PATH);
  if (!existsSync(path)) {
    console.error(`large-scene performance is UNPROVEN: ${REPORT_PATH} is absent. Run \`pnpm bench:production-path\`.`);
    process.exitCode = 1;
    return;
  }
  const report = JSON.parse(readFileSync(path, "utf8")) as { readonly pass?: boolean; readonly failures?: readonly string[] };
  if (report.pass !== true) {
    console.error(`production-path benchmark did not pass:\n${(report.failures ?? []).join("\n")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`production-path benchmark report is present and passing: ${REPORT_PATH}`);
}

if (process.argv.includes("--gate-only")) {
  gateOnly();
} else {
  await runBenchmark();
}
