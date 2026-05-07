import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../browser/example-dev-server";

type ProductStateName =
  | "__GALILEO3D_PRODUCT_DEMO__"
  | "__GALILEO3D_ARCHITECTURE_DEMO__"
  | "__GALILEO3D_GAME_DEMO__";

type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PixelMatcher = "blue" | "cyan" | "gold" | "green" | "pink" | "rendered" | "steel" | "white";

type PixelCheck = {
  name: string;
  region: Region;
  matcher: PixelMatcher;
  minimumPixels: number;
};

type ProductDemo = {
  id: "product-configurator" | "architecture-viewer" | "game-slice";
  stateName: ProductStateName;
  canvasSelector: string;
  stableState: string;
  interaction: (page: Page, demo: ProductDemo) => Promise<void>;
  expectedAfterInteraction: (state: Record<string, any>) => boolean;
  pixelChecks: readonly PixelCheck[];
};

type PixelBuffer = {
  width: number;
  height: number;
  data: readonly number[];
};

type DiffResult = {
  checkedPixels: number;
  changedPixels: number;
  changedRatio: number;
  meanDelta: number;
  maxDelta: number;
  tolerance: number;
  passed: boolean;
};

type ProductVisualReport = {
  ok: boolean;
  generatedAt: string;
  releaseRunId: string;
  suite: string;
  environment: {
    platform: string;
    osRelease: string;
    arch: string;
    cpuModel: string;
    cpuCount: number;
    totalMemoryBytes: number;
    ci: boolean;
  };
  screenshotDiffPolicy: {
    tolerance: number;
    maxStableChangedRatio: number;
    minInteractionChangedRatio: number;
    artifactRetention: string;
  };
  demos: Array<{
    id: ProductDemo["id"];
    stableState: string;
    renderer: unknown;
    drawCalls: unknown;
    canvas: { width: number; height: number };
    nonBlank: boolean;
    pixelChecks: Array<{ name: string; matcher: PixelMatcher; matchingPixels: number; minimumPixels: number; passed: boolean }>;
    stableDiff: DiffResult;
    interactionDiff: DiffResult;
    afterInteractionState: Record<string, unknown>;
    passed: boolean;
  }>;
  violations: Array<{ demo: string; message: string }>;
};

const productDemos: readonly ProductDemo[] = [
  {
    id: "product-configurator",
    stateName: "__GALILEO3D_PRODUCT_DEMO__",
    canvasSelector: "[data-testid='product-configurator-canvas']",
    stableState: "graphite-default",
    interaction: async (page, demo) => {
      await page.locator(demo.canvasSelector).click({ position: { x: 320, y: 280 } });
      await page.waitForFunction(() => (globalThis as Record<string, any>).__GALILEO3D_PRODUCT_DEMO__?.activeVariant === "copper");
    },
    expectedAfterInteraction: (state) => state.activeVariant === "copper" && state.interactions === 1,
    pixelChecks: [
      { name: "configurator-rendered-product", region: { x: 0, y: 0, width: 640, height: 640 }, matcher: "rendered", minimumPixels: 700 },
      { name: "configurator-steel-highlight", region: { x: 0, y: 0, width: 640, height: 640 }, matcher: "steel", minimumPixels: 700 },
    ],
  },
  {
    id: "architecture-viewer",
    stateName: "__GALILEO3D_ARCHITECTURE_DEMO__",
    canvasSelector: "[data-testid='architecture-viewer-canvas']",
    stableState: "atrium-default",
    interaction: async (page, demo) => {
      await page.locator(demo.canvasSelector).click({ position: { x: 220, y: 240 } });
      await page.waitForFunction(() => (globalThis as Record<string, any>).__GALILEO3D_ARCHITECTURE_DEMO__?.selectedZone === "gallery");
    },
    expectedAfterInteraction: (state) => state.selectedZone === "gallery" && state.measurements?.areaSqm === 310,
    pixelChecks: [
      { name: "architecture-rendered-masses", region: { x: 0, y: 0, width: 640, height: 640 }, matcher: "rendered", minimumPixels: 1_400 },
      { name: "architecture-lit-surfaces", region: { x: 0, y: 0, width: 640, height: 640 }, matcher: "steel", minimumPixels: 1_000 },
    ],
  },
  {
    id: "game-slice",
    stateName: "__GALILEO3D_GAME_DEMO__",
    canvasSelector: "[data-testid='game-slice-canvas']",
    stableState: "idle-runtime",
    interaction: async (page, demo) => {
      await page.locator(demo.canvasSelector).click({ position: { x: 220, y: 260 } });
      await page.waitForFunction(() => ((globalThis as Record<string, any>).__GALILEO3D_GAME_DEMO__?.interactions ?? 0) >= 1);
    },
    expectedAfterInteraction: (state) => Number(state.interactions ?? 0) >= 1 && Number(state.metrics?.physicsBodies ?? 0) >= 2,
    pixelChecks: [
      { name: "game-rendered-scene", region: { x: 0, y: 0, width: 640, height: 640 }, matcher: "rendered", minimumPixels: 15_000 },
      { name: "particle-sparks", region: { x: 0, y: 0, width: 640, height: 640 }, matcher: "pink", minimumPixels: 120 },
    ],
  },
] as const;

const report: ProductVisualReport = {
  ok: true,
  generatedAt: new Date().toISOString(),
  releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-product-visual-run",
  suite: "v2-product-demo-visual-screenshot-diff",
  environment: {
    platform: platform(),
    osRelease: release(),
    arch: process.arch,
    cpuModel: cpus()[0]?.model ?? "unknown",
    cpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    ci: process.env.CI === "true",
  },
  screenshotDiffPolicy: {
    tolerance: platform() === "darwin" || platform() === "win32" ? 8 : 6,
    maxStableChangedRatio: process.env.CI === "true" ? 0.045 : 0.03,
    minInteractionChangedRatio: 0.001,
    artifactRetention: "Retain tests/reports/product-visual.json, tests/reports/product-demo-validation.json, and Playwright test-results for CI visual artifact review.",
  },
  demos: [],
  violations: [],
};

test.describe("v2 product demo visual screenshot diffs", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    report.ok = report.violations.length === 0 && report.demos.every((demo) => demo.passed);
    const reportPath = resolve("tests/reports/product-visual.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  for (const demo of productDemos) {
    test(`${demo.id} product demo has stable visual evidence`, async ({ page }) => {
      await openReadyProductDemo(page, server, demo);
      const state = await readDemoState(page, demo.stateName);
      const first = await readCanvasPixels(page, demo.canvasSelector);
      await page.waitForTimeout(120);
      const stable = await readCanvasPixels(page, demo.canvasSelector);
      const nonBlank = canvasIsNonBlank(first);
      const stableDiff = compareBuffers(first, stable, report.screenshotDiffPolicy.tolerance);
      stableDiff.passed = stableDiff.changedRatio <= report.screenshotDiffPolicy.maxStableChangedRatio;

      const pixelChecks = [];
      for (const check of demo.pixelChecks) {
        const matchingPixels = countMatchingPixels(first, check.region, check.matcher);
        pixelChecks.push({
          name: check.name,
          matcher: check.matcher,
          matchingPixels,
          minimumPixels: check.minimumPixels,
          passed: matchingPixels >= check.minimumPixels,
        });
      }

      await demo.interaction(page, demo);
      await page.waitForTimeout(120);
      const afterInteractionPixels = await readCanvasPixels(page, demo.canvasSelector);
      const interactionDiff = compareBuffers(stable, afterInteractionPixels, report.screenshotDiffPolicy.tolerance);
      const afterInteractionState = await readDemoState(page, demo.stateName);
      interactionDiff.passed =
        interactionDiff.changedRatio >= report.screenshotDiffPolicy.minInteractionChangedRatio ||
        interactionDiff.meanDelta > 0 ||
        demo.expectedAfterInteraction(afterInteractionState);

      const passed =
        nonBlank &&
        stableDiff.passed &&
        pixelChecks.every((check) => check.passed) &&
        state.status === "ready" &&
        state.renderer === "webgl2" &&
        state.metrics?.rendererBacked === true &&
        Number(state.diagnostics?.drawCalls ?? 0) > 0 &&
        demo.expectedAfterInteraction(afterInteractionState);

      const entry = {
        id: demo.id,
        stableState: demo.stableState,
        renderer: state.renderer,
        drawCalls: state.diagnostics?.drawCalls,
        canvas: { width: first.width, height: first.height },
        nonBlank,
        pixelChecks,
        stableDiff,
        interactionDiff,
        afterInteractionState,
        passed,
      };
      report.demos.push(entry);
      if (!passed) {
        report.violations.push({ demo: demo.id, message: JSON.stringify(entry) });
      }

      expect(nonBlank).toBe(true);
      expect(stableDiff.passed, `${demo.id} stable diff ${JSON.stringify(stableDiff)}`).toBe(true);
      expect(pixelChecks.filter((check) => !check.passed), `${demo.id} pixel checks`).toEqual([]);
      expect(demo.expectedAfterInteraction(afterInteractionState)).toBe(true);
    });
  }
});

async function openReadyProductDemo(page: Page, server: ExampleDevServer, demo: ProductDemo): Promise<void> {
  await page.goto(`${server.origin}/examples/${demo.id}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    (stateName) => {
      const state = (globalThis as Record<string, any>)[stateName];
      return state?.status === "ready" || state?.status === "error";
    },
    demo.stateName,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(250);
}

async function readDemoState(page: Page, stateName: ProductStateName): Promise<Record<string, any>> {
  return page.evaluate((name) => {
    const state = (globalThis as Record<string, any>)[name];
    if (!state) throw new Error(`Missing product demo state ${name}.`);
    if (state.status !== "ready") {
      throw new Error(`Product demo ${name} did not reach ready: ${state.error ?? "missing error detail"}`);
    }
    return state;
  }, stateName);
}

async function readCanvasPixels(page: Page, selector: string): Promise<PixelBuffer> {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    if (!canvas) throw new Error(`Missing canvas ${canvasSelector}.`);
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) throw new Error(`Missing WebGL context for ${canvasSelector}.`);
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return { width: canvas.width, height: canvas.height, data: Array.from(data) };
  }, selector);
}

function canvasIsNonBlank(buffer: PixelBuffer): boolean {
  for (let index = 0; index < buffer.data.length; index += 4) {
    if (buffer.data[index] > 8 || buffer.data[index + 1] > 8 || buffer.data[index + 2] > 8 || buffer.data[index + 3] > 8) {
      return true;
    }
  }
  return false;
}

function compareBuffers(before: PixelBuffer, after: PixelBuffer, tolerance: number): DiffResult {
  if (before.width !== after.width || before.height !== after.height || before.data.length !== after.data.length) {
    throw new Error("Cannot compare canvas buffers with different dimensions.");
  }

  let changedPixels = 0;
  let totalDelta = 0;
  let maxDelta = 0;
  const checkedPixels = before.data.length / 4;
  for (let index = 0; index < before.data.length; index += 4) {
    const delta =
      Math.abs(before.data[index] - after.data[index]) +
      Math.abs(before.data[index + 1] - after.data[index + 1]) +
      Math.abs(before.data[index + 2] - after.data[index + 2]) +
      Math.abs(before.data[index + 3] - after.data[index + 3]);
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > tolerance) changedPixels += 1;
  }

  return {
    checkedPixels,
    changedPixels,
    changedRatio: Number((changedPixels / checkedPixels).toFixed(6)),
    meanDelta: Number((totalDelta / checkedPixels).toFixed(4)),
    maxDelta,
    tolerance,
    passed: false,
  };
}

function countMatchingPixels(buffer: PixelBuffer, region: Region, matcher: PixelMatcher): number {
  const xStart = Math.max(0, Math.floor(region.x));
  const yStart = Math.max(0, Math.floor(region.y));
  const xEnd = Math.min(buffer.width, Math.ceil(region.x + region.width));
  const yEnd = Math.min(buffer.height, Math.ceil(region.y + region.height));
  let matching = 0;

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const sourceY = buffer.height - y - 1;
      const index = (sourceY * buffer.width + x) * 4;
      const r = buffer.data[index];
      const g = buffer.data[index + 1];
      const b = buffer.data[index + 2];
      if (matchesColor(r, g, b, matcher)) matching += 1;
    }
  }

  return matching;
}

function matchesColor(r: number, g: number, b: number, matcher: PixelMatcher): boolean {
  return (
    (matcher === "blue" && b > 130 && g > 80 && r < 170) ||
    (matcher === "cyan" && b > 145 && g > 115 && r < 110) ||
    (matcher === "gold" && r > 170 && g > 110 && b < 95) ||
    (matcher === "green" && g > 120 && r < 180 && b < 210) ||
    (matcher === "pink" && r > 150 && b > 80 && g < 180) ||
    (matcher === "rendered" && (r > 8 || g > 8 || b > 8)) ||
    (matcher === "steel" && r > 35 && g > 45 && b > 55 && b >= r && b >= g) ||
    (matcher === "white" && r > 190 && g > 190 && b > 190)
  );
}
