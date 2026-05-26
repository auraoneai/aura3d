import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportDir = resolve("tests/reports/foundation-app-suite");
const captures: AppSuiteCapture[] = [];

const apps = [
  {
    id: "asset-lab",
    path: "/apps/asset-lab/index.html",
    alternateScenario: "material-spheres",
    minItems: 1
  },
  {
    id: "material-lab",
    path: "/apps/material-lab/index.html",
    alternateScenario: "metals",
    minItems: 3
  },
  {
    id: "scene-lab",
    path: "/apps/scene-lab/index.html",
    alternateScenario: "dramatic",
    minItems: 3
  },
  {
    id: "game-lab",
    path: "/apps/game-lab/index.html",
    alternateScenario: "input-ready",
    minItems: 2,
    dynamic: true
  }
] as const;

test.describe("V3 real app suite", () => {
  test.setTimeout(160_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(reportDir, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    writeFileSync(join(reportDir, "manifest.json"), `${JSON.stringify({
      schema: "a3d-v3-app-suite-browser/v1",
      generatedAt: new Date().toISOString(),
      apps: apps.map((app) => app.id),
      captures,
      pass: captures.length >= apps.length * 2 && captures.every((capture) => capture.bytes > 10_000 && capture.drawCalls > 0 && capture.lastError === null)
    }, null, 2)}\n`);
  });

  for (const app of apps) {
    test(`${app.id} renders a real workflow-backed application`, async ({ page }) => {
      await page.goto(`${server.origin}${app.path}`, { waitUntil: "domcontentloaded" });
      await expect.poll(() => readState(page).then((state) => state?.status), { timeout: 40_000 }).toBe("ready");
      if (app.dynamic) {
        await expect.poll(() => readState(page).then((state) => state?.frameCount ?? 0), { timeout: 40_000 }).toBeGreaterThan(6);
      }
      const initial = await readState(page);
      expect(initial?.workflowKind).toBeTruthy();
      expect(initial?.featureChecklist.length ?? 0).toBeGreaterThanOrEqual(5);
      expect(initial?.renderedItems ?? 0).toBeGreaterThanOrEqual(app.minItems);
      expect(initial?.drawCalls ?? 0).toBeGreaterThan(0);
      expect(initial?.lastError).toBeNull();
      await captureApp(page, app.id, "default");

      await page.evaluate(async (scenarioId) => {
        await (window as any).__A3D_V3_APP__?.loadScenario?.(scenarioId);
      }, app.alternateScenario);
      await expect.poll(() => readState(page).then((state) => state?.selectedScenarioId), { timeout: 40_000 }).toBe(app.alternateScenario);
      await expect.poll(() => readState(page).then((state) => state?.status), { timeout: 40_000 }).toBe("ready");
      const updated = await readState(page);
      expect(updated?.drawCalls ?? 0).toBeGreaterThan(0);
      expect(updated?.lastError).toBeNull();
      await captureApp(page, app.id, app.alternateScenario);
    });
  }
});

async function readState(page: import("@playwright/test").Page): Promise<AppState | undefined> {
  return page.evaluate(() => {
    const state = (window as any).__A3D_V3_APP__?.captureState?.() ?? (window as any).__A3D_V3_APP__;
    if (!state) return undefined;
    return {
      appId: state.appId,
      status: state.status,
      selectedScenarioId: state.selectedScenarioId,
      workflowKind: state.workflowKind,
      featureChecklist: state.featureChecklist ?? [],
      frameCount: state.frameCount ?? 0,
      drawCalls: state.drawCalls ?? 0,
      renderedItems: state.renderedItems ?? 0,
      lastError: state.lastError ?? null
    };
  });
}

async function captureApp(page: import("@playwright/test").Page, appId: string, scenario: string): Promise<void> {
  const path = join(reportDir, `${appId}-${scenario}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.locator(`[data-testid='${appId}-canvas']`).screenshot({ path });
  const state = await readState(page);
  const bytes = statSync(path).size;
  expect(bytes).toBeGreaterThan(10_000);
  captures.push({
    appId,
    scenario,
    path: path.replace(`${process.cwd()}/`, ""),
    bytes,
    drawCalls: state?.drawCalls ?? 0,
    frameCount: state?.frameCount ?? 0,
    renderedItems: state?.renderedItems ?? 0,
    lastError: state?.lastError ?? null
  });
}

interface AppState {
  readonly appId: string;
  readonly status: string;
  readonly selectedScenarioId: string;
  readonly workflowKind?: string;
  readonly featureChecklist: readonly string[];
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly renderedItems: number;
  readonly lastError: string | null;
}

interface AppSuiteCapture {
  readonly appId: string;
  readonly scenario: string;
  readonly path: string;
  readonly bytes: number;
  readonly drawCalls: number;
  readonly frameCount: number;
  readonly renderedItems: number;
  readonly lastError: string | null;
}
