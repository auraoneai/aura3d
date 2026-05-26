import { chromium, test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readV6PngStats, type V6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";

interface WowRoute {
  readonly slug: string;
  readonly label: string;
  readonly path: string;
}

interface WowRuntimeRecord {
  readonly appId?: string;
  readonly status?: string;
  readonly title?: string;
  readonly subtitle?: string;
  readonly asset?: string;
  readonly environment?: string;
  readonly attribution?: string;
  readonly clip?: string;
  readonly frameCount?: number;
  readonly frames?: number;
  readonly drawCalls?: number;
  readonly fps?: number;
  readonly averageFrameMs?: number;
  readonly meshes?: number;
  readonly primitives?: number;
  readonly materials?: number;
  readonly textures?: number;
  readonly animations?: number;
  readonly renderWidth?: number;
  readonly renderHeight?: number;
  readonly renderSize?: string;
  readonly loadMs?: number;
  readonly renderer?: string;
  readonly timings?: Readonly<Record<string, number>>;
  readonly error?: string;
}

interface WowRouteState {
  readonly runtimeKey: string | null;
  readonly status: string;
  readonly runtime: WowRuntimeRecord;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly canvas: {
    readonly clientWidth: number;
    readonly clientHeight: number;
    readonly backingWidth: number;
    readonly backingHeight: number;
    readonly devicePixelRatio: number;
    readonly backingScaleX: number;
    readonly backingScaleY: number;
  };
}

interface WowRouteReport {
  readonly slug: string;
  readonly label: string;
  readonly path: string;
  readonly href: string;
  readonly runtimeKey: string | null;
  readonly runtime: WowRuntimeRecord;
  readonly screenshot: string;
  readonly screenshotSha256: string;
  readonly screenshotStats: V6PngStats;
  readonly motionScreenshot: string;
  readonly motionScreenshotSha256: string;
  readonly canvas: WowRouteState["canvas"];
  readonly motion: {
    readonly required: true;
    readonly sampleMs: number;
    readonly beforeFrameCount: number;
    readonly afterFrameCount: number;
    readonly frameCountDelta: number;
    readonly screenshotChanged: boolean;
    readonly pass: boolean;
  };
  readonly failures: readonly string[];
}

const CURRENT_WOW_ROUTES: readonly WowRoute[] = [
  { slug: "wow-tokyo-keyframes", label: "Tokyo Keyframes", path: "/apps/wow-tokyo-keyframes/" },
  { slug: "wow-kira-ik-room", label: "Robot Expressive Room", path: "/apps/wow-kira-ik-room/" },
  { slug: "wow-neon-city", label: "Neon City", path: "/apps/wow-neon-city/" },
  { slug: "wow-orbital-fleet", label: "Orbital Fleet", path: "/apps/wow-orbital-fleet/" },
  { slug: "wow-crystal-cavern", label: "Crystal Cavern", path: "/apps/wow-crystal-cavern/" },
  { slug: "wow-robot-parade", label: "Robot Parade", path: "/apps/wow-robot-parade/" },
  { slug: "wow-particle-vortex", label: "Particle Vortex", path: "/apps/wow-particle-vortex/" },
  { slug: "wow-ocean-temple", label: "Ocean Temple", path: "/apps/wow-ocean-temple/" },
  { slug: "wow-physics-arena", label: "Physics Arena", path: "/apps/wow-physics-arena/" },
  { slug: "wow-material-cathedral", label: "Material Cathedral", path: "/apps/wow-material-cathedral/" },
  { slug: "wow-astral-garden", label: "Astral Garden", path: "/apps/wow-astral-garden/" },
  { slug: "wow-quantum-stage", label: "Quantum Stage", path: "/apps/wow-quantum-stage/" }
];

const REPORT_DIR = "tests/reports/wow-showcase";
const SCREENSHOT_DIR = `${REPORT_DIR}/screenshots`;
const MOTION_SAMPLE_MS = 800;

test.describe("authored WOW showcase screenshots", () => {
  let server: ViteDevServer;

  test.beforeAll(async () => {
    server = await startViteDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("visible authored WOW routes render current assets with screenshot, DPR, and motion evidence", async () => {
    test.setTimeout(900_000);
    const browser = await chromium.launch({ headless: true });
    const results: WowRouteReport[] = [];
    try {
      for (const route of CURRENT_WOW_ROUTES) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.25 });
        try {
          const result = await captureWowRoute(page, route, server.origin);
          results.push(result);
          writeWowRouteHealthReport(server.origin, results);
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }

    const failures = writeWowRouteHealthReport(server.origin, results);

    expect(results.map((result) => result.path)).toEqual(CURRENT_WOW_ROUTES.map((route) => route.path));
    expect(failures, failures.join("\n")).toEqual([]);
  });
});

async function captureWowRoute(page: Page, route: WowRoute, origin: string): Promise<WowRouteReport> {
  const href = `${origin}${route.path}`;
  const failures: string[] = [];
  const errors = collectPageErrors(page);
  const screenshotPath = `${SCREENSHOT_DIR}/${route.slug}.png`;
  const motionPath = `${SCREENSHOT_DIR}/${route.slug}-motion.png`;

  await page.goto(href, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch((error: unknown) => {
    failures.push(`navigation failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  await page.waitForFunction(() => {
    const state = readWindowWowState();
    return state?.status === "error" || Boolean(state && state.frameCount >= 3 && state.drawCalls > 0);

    function readWindowWowState(): { readonly status: string; readonly frameCount: number; readonly drawCalls: number } | null {
      const source = pickRuntime();
      if (!source) return null;
      const frameCount = typeof source.frameCount === "number"
        ? source.frameCount
        : typeof source.frames === "number" ? source.frames : 0;
      const drawCalls = typeof source.drawCalls === "number" ? source.drawCalls : 0;
      return {
        status: typeof source.status === "string" ? source.status : "unknown",
        frameCount,
        drawCalls
      };
    }

    function pickRuntime(): { readonly status?: unknown; readonly frameCount?: unknown; readonly frames?: unknown; readonly drawCalls?: unknown } | null {
      const globals = window as unknown as Record<string, unknown>;
      const direct = [globals.__a3dWowRuntime, globals.__a3dWowGltfRuntime]
        .find((value) => isRuntime(value));
      if (direct) return direct;
      const appRuntime = Object.entries(globals)
        .find(([key, value]) => /^__a3dwow/i.test(key) && isRuntime(value));
      return appRuntime ? appRuntime[1] as { readonly status?: unknown; readonly frameCount?: unknown; readonly frames?: unknown; readonly drawCalls?: unknown } : null;
    }

    function isRuntime(value: unknown): value is { readonly status?: unknown } {
      return typeof value === "object" && value !== null && "status" in value;
    }
  }, undefined, { timeout: 90_000 }).catch((error: unknown) => {
    failures.push(`runtime did not reach first drawn frames: ${error instanceof Error ? error.message : String(error)}`);
  });

  const before = await readWowRouteState(page).catch((error: unknown) => {
    failures.push(`runtime state read failed before screenshot: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  const canvas = page.locator("canvas#viewport").first();
  await canvas.screenshot({ path: screenshotPath }).catch((error: unknown) => {
    failures.push(`canvas screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  const screenshotStats = readScreenshotStats(screenshotPath);
  const screenshotSha256 = existsSync(screenshotPath) ? hashFile(screenshotPath) : "";

  await page.waitForTimeout(MOTION_SAMPLE_MS);
  const after = await readWowRouteState(page).catch((error: unknown) => {
    failures.push(`runtime state read failed after motion sample: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  await canvas.screenshot({ path: motionPath }).catch((error: unknown) => {
    failures.push(`motion screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  const motionSha256 = existsSync(motionPath) ? hashFile(motionPath) : "";

  const state = after ?? before;
  if (!state) {
    failures.push("route did not expose a WOW runtime state");
  } else {
    if (state.status === "error") failures.push(`runtime reached error: ${state.runtime.error ?? "(no error text)"}`);
    if (state.status !== "ready" && state.status !== "running") failures.push(`runtime status ${state.status} was not ready/running`);
    if (state.drawCalls <= 0) failures.push(`runtime reported ${state.drawCalls} draw calls`);
    if (state.frameCount < 3) failures.push(`runtime reported only ${state.frameCount} frame(s)`);
    if (state.renderWidth < 1000 || state.renderHeight < 700) {
      failures.push(`runtime render size ${state.renderWidth}x${state.renderHeight} is below route-health minimum`);
    }
    if (state.canvas.backingScaleX < 1.18 || state.canvas.backingScaleY < 1.18) {
      failures.push(`canvas backing scale ${state.canvas.backingScaleX}x${state.canvas.backingScaleY} is below expected DPR evidence`);
    }
  }
  if (errors.consoleErrors.length > 0) failures.push(`browser console emitted ${errors.consoleErrors.length} error(s)`);
  if (errors.pageErrors.length > 0) failures.push(`page emitted ${errors.pageErrors.length} error(s)`);
  if (errors.responseErrors.length > 0) failures.push(`route emitted ${errors.responseErrors.length} failed response(s)`);
  if (!passesScreenshotThresholds(screenshotStats)) {
    failures.push(`canvas screenshot failed blank-route thresholds: ${JSON.stringify(screenshotStats)}`);
  }

  const beforeFrameCount = before?.frameCount ?? 0;
  const afterFrameCount = after?.frameCount ?? beforeFrameCount;
  const motion = {
    required: true as const,
    sampleMs: MOTION_SAMPLE_MS,
    beforeFrameCount,
    afterFrameCount,
    frameCountDelta: afterFrameCount - beforeFrameCount,
    screenshotChanged: screenshotSha256 !== motionSha256,
    pass: afterFrameCount > beforeFrameCount && screenshotSha256 !== motionSha256
  };
  if (!motion.pass) {
    failures.push(`motion evidence failed: frame delta ${motion.frameCountDelta}, screenshotChanged=${motion.screenshotChanged}`);
  }

  return {
    slug: route.slug,
    label: route.label,
    path: route.path,
    href,
    runtimeKey: state?.runtimeKey ?? null,
    runtime: state?.runtime ?? {},
    screenshot: screenshotPath,
    screenshotSha256,
    screenshotStats,
    motionScreenshot: motionPath,
    motionScreenshotSha256: motionSha256,
    canvas: state?.canvas ?? {
      clientWidth: 0,
      clientHeight: 0,
      backingWidth: 0,
      backingHeight: 0,
      devicePixelRatio: 0,
      backingScaleX: 0,
      backingScaleY: 0
    },
    motion,
    failures
  };
}

function writeWowRouteHealthReport(origin: string, results: readonly WowRouteReport[]): readonly string[] {
  const failures = results.flatMap((result) => result.failures.map((failure) => `${result.path}: ${failure}`));
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(`${REPORT_DIR}/route-health.json`, `${JSON.stringify({
    schema: "a3d-wow-showcase-route-health/v1",
    generatedAt: new Date().toISOString(),
    origin,
    routeCount: results.length,
    routes: results,
    pass: results.length === CURRENT_WOW_ROUTES.length && failures.length === 0,
    failures
  }, null, 2)}\n`);
  return failures;
}

function collectPageErrors(page: Page): {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly responseErrors: string[];
} {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const responseErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text === "Failed to load resource: the server responded with a status of 404 (Not Found)") return;
    consoleErrors.push(text);
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && !/\/(?:favicon\.ico|apple-touch-icon)/.test(response.url())) {
      responseErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  return { consoleErrors, pageErrors, responseErrors };
}

async function readWowRouteState(page: Page): Promise<WowRouteState> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas#viewport");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("WOW route did not expose canvas#viewport.");
    }
    const runtimeEntry = pickRuntimeEntry();
    if (!runtimeEntry) {
      throw new Error("WOW route did not expose a supported runtime global.");
    }
    const [runtimeKey, runtime] = runtimeEntry;
    const frameCount = typeof runtime.frameCount === "number"
      ? runtime.frameCount
      : typeof runtime.frames === "number" ? runtime.frames : 0;
    const renderSize = typeof runtime.renderSize === "string"
      ? runtime.renderSize.match(/^(\d+)x(\d+)$/)
      : null;
    const renderWidth = typeof runtime.renderWidth === "number"
      ? runtime.renderWidth
      : renderSize ? Number(renderSize[1]) : canvas.width;
    const renderHeight = typeof runtime.renderHeight === "number"
      ? runtime.renderHeight
      : renderSize ? Number(renderSize[2]) : canvas.height;
    const backingScaleX = canvas.width / Math.max(1, canvas.clientWidth);
    const backingScaleY = canvas.height / Math.max(1, canvas.clientHeight);
    return {
      runtimeKey,
      status: typeof runtime.status === "string" ? runtime.status : "unknown",
      runtime: runtime as WowRuntimeRecord,
      frameCount,
      drawCalls: typeof runtime.drawCalls === "number" ? runtime.drawCalls : 0,
      renderWidth,
      renderHeight,
      canvas: {
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        devicePixelRatio: window.devicePixelRatio,
        backingScaleX: Number(backingScaleX.toFixed(4)),
        backingScaleY: Number(backingScaleY.toFixed(4))
      }
    };

    function pickRuntimeEntry(): readonly [string, Partial<WowRuntimeRecord>] | null {
      const globals = window as unknown as Record<string, unknown>;
      const preferredKeys = ["__a3dWowRuntime", "__a3dWowGltfRuntime"];
      for (const key of preferredKeys) {
        const value = globals[key];
        if (isRuntime(value)) return [key, value];
      }
      for (const [key, value] of Object.entries(globals)) {
        if (/^__a3dwow/i.test(key) && isRuntime(value)) return [key, value];
      }
      return null;
    }

    function isRuntime(value: unknown): value is Partial<WowRuntimeRecord> {
      return typeof value === "object" && value !== null && "status" in value;
    }
  });
}

function passesScreenshotThresholds(stats: V6PngStats): boolean {
  const minNonBlackPixels = Math.floor(stats.width * stats.height * 0.04);
  return stats.width >= 1000
    && stats.height >= 700
    && stats.nonBlackPixels >= minNonBlackPixels
    && stats.uniqueColorBuckets >= 18
    && stats.localContrast >= 3
    && stats.detailEdgeDensity >= 0.0005;
}

function emptyPngStats(): V6PngStats {
  return {
    width: 0,
    height: 0,
    nonTransparentPixels: 0,
    nonBlackPixels: 0,
    uniqueColorBuckets: 0,
    averageLuma: 0,
    foregroundPixels: 0,
    foregroundCoverage: 0,
    largestForegroundComponentPixels: 0,
    largestForegroundComponentCoverage: 0,
    centerForegroundCoverage: 0,
    foregroundBoundsCoverage: 0,
    detailEdgeDensity: 0,
    localContrast: 0
  };
}

function readScreenshotStats(path: string): V6PngStats {
  return existsSync(path) && statSync(path).size > 0 ? readV6PngStats(path) : emptyPngStats();
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

interface ViteDevServer {
  readonly origin: string;
  close(): Promise<void>;
}

async function startViteDevServer(): Promise<ViteDevServer> {
  if (process.env.A3D_WOW_BASE_URL) {
    return { origin: process.env.A3D_WOW_BASE_URL.replace(/\/$/, ""), close: async () => {} };
  }
  const requestedPort = Number(process.env.A3D_WOW_PORT ?? 5191);
  const child = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(requestedPort)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const origin = await waitForViteReady(child);
  return {
    origin,
    close: () => closeVite(child)
  };
}

function waitForViteReady(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for Vite test server.\n${output}`));
    }, 30_000);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timeout);
        cleanup();
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    };
    const onExit = (code: number | null): void => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error(`Vite test server exited with code ${code}.\n${output}`));
    };
    const cleanup = (): void => {
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
  });
}

function closeVite(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 2_000).unref();
  });
}
