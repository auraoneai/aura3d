import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer } from "../browser/example-dev-server";

type ProductStateName =
  | "__AURA3D_PRODUCT_DEMO__"
  | "__AURA3D_ARCHITECTURE_DEMO__"
  | "__AURA3D_GAME_DEMO__";

type ProductDemo = {
  id: "product-configurator" | "architecture-viewer" | "game-slice";
  stateName: ProductStateName;
  canvasSelector: string;
  interactions: (page: Page, canvasSelector: string) => Promise<void>;
  budget: {
    averageFrameMs: number;
    p95FrameMs: number;
    maxFrameMs: number;
    readyMs: number;
  };
};

type FrameSample = {
  frame: number;
  frameMs: number;
  drawCalls: number;
};

type ProductDemoBaseline = {
  id: ProductDemo["id"];
  readyMs: number;
  samples: readonly FrameSample[];
  averageFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  minFrameMs: number;
  drawCalls: number;
  interactions: number;
  rendererBacked: boolean;
  budget: ProductDemo["budget"];
  withinBudget: boolean;
  budgetReason: string;
};

const demos: readonly ProductDemo[] = [
  {
    id: "product-configurator",
    stateName: "__AURA3D_PRODUCT_DEMO__",
    canvasSelector: "[data-testid='product-configurator-canvas']",
    interactions: async (page, selector) => {
      await page.locator(selector).click({ position: { x: 320, y: 280 } });
      await page.getByRole("button", { name: "ceramic" }).click();
      await page.waitForFunction(() => (globalThis as Record<string, any>).__AURA3D_PRODUCT_DEMO__?.activeVariant === "ceramic");
    },
    budget: { averageFrameMs: 1_000, p95FrameMs: 1_500, maxFrameMs: 2_500, readyMs: 7_000 },
  },
  {
    id: "architecture-viewer",
    stateName: "__AURA3D_ARCHITECTURE_DEMO__",
    canvasSelector: "[data-testid='architecture-viewer-canvas']",
    interactions: async (page, selector) => {
      await page.locator(selector).click({ position: { x: 220, y: 240 } });
      await page.waitForFunction(() => (globalThis as Record<string, any>).__AURA3D_ARCHITECTURE_DEMO__?.selectedZone === "gallery");
    },
    budget: { averageFrameMs: 1_500, p95FrameMs: 2_500, maxFrameMs: 3_500, readyMs: 5_000 },
  },
  {
    id: "game-slice",
    stateName: "__AURA3D_GAME_DEMO__",
    canvasSelector: "[data-testid='game-slice-canvas']",
    interactions: async (page, selector) => {
      await page.locator(selector).focus();
      await page.keyboard.press("Space");
      await page.locator(selector).click({ position: { x: 220, y: 260 } });
      await page.waitForFunction(() => ((globalThis as Record<string, any>).__AURA3D_GAME_DEMO__?.interactions ?? 0) >= 1);
    },
    budget: { averageFrameMs: 1_000, p95FrameMs: 1_500, maxFrameMs: 2_500, readyMs: 5_000 },
  },
] as const;

async function main(): Promise<void> {
  const server = await startExampleDevServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const baselines: ProductDemoBaseline[] = [];
    for (const demo of demos) {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      try {
        baselines.push(await measureDemo(page, server.origin, demo));
      } finally {
        await page.close();
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      releaseRunId: process.env.A3D_RELEASE_RUN_ID ?? "standalone-product-performance-run",
      suite: "v2-product-demo-performance",
      environment: {
        node: process.version,
        platform: platform(),
        osRelease: release(),
        arch: process.arch,
        cpuModel: cpus()[0]?.model ?? "unknown",
        cpuCount: cpus().length,
        totalMemoryBytes: totalmem(),
        ci: process.env.CI === "true",
        browser: "chromium",
        viewport: { width: 800, height: 600 },
      },
      status: baselines.every((baseline) => baseline.withinBudget) ? "pass" : "fail",
      baselines,
    };

    const reportPath = resolve("tests/reports/product-performance.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "pass") {
      throw new Error(`Product demo performance budgets failed for ${baselines.filter((baseline) => !baseline.withinBudget).map((baseline) => baseline.id).join(", ")}`);
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function measureDemo(page: Page, origin: string, demo: ProductDemo): Promise<ProductDemoBaseline> {
  const start = performance.now();
  await page.goto(`${origin}/examples/${demo.id}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    (stateName) => {
      const state = (globalThis as Record<string, any>)[stateName];
      return state?.status === "ready" || state?.status === "error";
    },
    demo.stateName,
    { timeout: 10_000 },
  );
  const readyMs = Number((performance.now() - start).toFixed(3));
  await demo.interactions(page, demo.canvasSelector);
  await page.waitForTimeout(250);
  const samples = await collectFrameSamples(page, demo.stateName, 60);
  const frameMs = samples.map((sample) => sample.frameMs).sort((left, right) => left - right);
  const averageFrameMs = average(frameMs);
  const p95FrameMs = percentile(frameMs, 0.95);
  const maxFrameMs = frameMs.at(-1) ?? 0;
  const minFrameMs = frameMs[0] ?? 0;
  const state = await readDemoState(page, demo.stateName);
  const drawCalls = Number(state.diagnostics?.drawCalls ?? 0);
  const interactions = Number(state.interactions ?? 0);
  const rendererBacked = state.metrics?.rendererBacked === true;
  const withinBudget =
    readyMs <= demo.budget.readyMs &&
    averageFrameMs <= demo.budget.averageFrameMs &&
    p95FrameMs <= demo.budget.p95FrameMs &&
    maxFrameMs <= demo.budget.maxFrameMs &&
    drawCalls > 0 &&
    rendererBacked;

  return {
    id: demo.id,
    readyMs,
    samples,
    averageFrameMs,
    p95FrameMs,
    maxFrameMs: Number(maxFrameMs.toFixed(3)),
    minFrameMs: Number(minFrameMs.toFixed(3)),
    drawCalls,
    interactions,
    rendererBacked,
    budget: demo.budget,
    withinBudget,
    budgetReason: "Current product demos recreate render resources each frame; this baseline guards against gross browser regressions while requiring ready state, renderer-backed draw calls, and expected input interactions.",
  };
}

async function collectFrameSamples(page: Page, stateName: ProductStateName, frames: number): Promise<FrameSample[]> {
  return page.evaluate(
    async ({ name, count }) => {
      const samples = [];
      for (let frame = 0; frame < count; frame += 1) {
        await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
        const state = (globalThis as Record<string, any>)[name];
        if (!state || state.status !== "ready") {
          throw new Error(`Missing ready state ${name} while sampling product performance.`);
        }
        samples.push({
          frame,
          frameMs: Number(state.metrics?.frameMs ?? 0),
          drawCalls: Number(state.diagnostics?.drawCalls ?? state.metrics?.drawCalls ?? 0),
        });
      }
      return samples;
    },
    { name: stateName, count: frames },
  );
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

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1));
  return Number(values[index].toFixed(3));
}

await main();
