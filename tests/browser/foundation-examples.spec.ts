import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportDir = resolve("tests/reports/foundation-examples");
const captures: ExampleCapture[] = [];

const examples = [
  { id: "foundation-asset-viewer", path: "/examples/foundation-asset-viewer/index.html", minItems: 1 },
  { id: "foundation-material-studio", path: "/examples/foundation-material-studio/index.html", minItems: 3 },
  { id: "foundation-product-configurator", path: "/examples/foundation-product-configurator/index.html", minItems: 1 },
  { id: "foundation-interactive-scene", path: "/examples/foundation-interactive-scene/index.html", minItems: 2, dynamic: true },
  { id: "foundation-game-slice", path: "/examples/foundation-game-slice/index.html", minItems: 2, dynamic: true }
] as const;

test.describe("V3 V3 examples", () => {
  test.setTimeout(160_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(reportDir, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    writeFileSync(join(reportDir, "manifest.json"), `${JSON.stringify({
      schema: "g3d-v3-examples-browser/v1",
      generatedAt: new Date().toISOString(),
      examples: examples.map((example) => example.id),
      captures,
      pass: captures.length >= examples.length && captures.every((capture) => capture.bytes > 10_000 && capture.drawCalls > 0 && capture.lastError === null)
    }, null, 2)}\n`);
  });

  for (const example of examples) {
    test(`${example.id} renders through public workflow APIs`, async ({ page }) => {
      await page.goto(`${server.origin}${example.path}`, { waitUntil: "domcontentloaded" });
      await expect.poll(() => readExampleState(page).then((state) => state?.status), { timeout: 40_000 }).toBe("ready");
      if (example.dynamic) {
        await expect.poll(() => readExampleState(page).then((state) => state?.frameCount ?? 0), { timeout: 40_000 }).toBeGreaterThan(8);
      }
      const state = await readExampleState(page);
      expect(state?.workflowKind).toBeTruthy();
      expect(state?.featureChecklist.length ?? 0).toBeGreaterThanOrEqual(5);
      expect(state?.renderedItems ?? 0).toBeGreaterThanOrEqual(example.minItems);
      expect(state?.drawCalls ?? 0).toBeGreaterThan(0);
      expect(state?.lastError).toBeNull();
      await captureExample(page, example.id);
    });
  }

  test("example index promotes only the current V3 examples", async ({ page }) => {
    await page.goto(`${server.origin}/examples/index.html`, { waitUntil: "domcontentloaded" });
    const links = await page.locator("nav a").evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")));
    expect(links).toEqual([
      "./foundation-asset-viewer/",
      "./foundation-material-studio/",
      "./foundation-product-configurator/",
      "./foundation-interactive-scene/",
      "./foundation-game-slice/"
    ]);
    await expect(page.getByText("Product Viewer V1")).toHaveCount(0);
    await expect(page.getByText("Rendering Showcase V1")).toHaveCount(0);
  });
});

async function readExampleState(page: import("@playwright/test").Page): Promise<ExampleState | undefined> {
  return page.evaluate(() => {
    const state = (window as any).__G3D_V3_EXAMPLE__?.captureState?.() ?? (window as any).__G3D_V3_EXAMPLE__;
    if (!state) return undefined;
    return {
      id: state.id,
      status: state.status,
      workflowKind: state.workflowKind,
      featureChecklist: state.featureChecklist ?? [],
      drawCalls: state.drawCalls ?? 0,
      frameCount: state.frameCount ?? 0,
      renderedItems: state.renderedItems ?? 0,
      lastError: state.lastError ?? null
    };
  });
}

async function captureExample(page: import("@playwright/test").Page, id: string): Promise<void> {
  const path = join(reportDir, `${id}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.locator(`[data-testid='${id}-canvas']`).screenshot({ path });
  const state = await readExampleState(page);
  const bytes = statSync(path).size;
  expect(bytes).toBeGreaterThan(10_000);
  captures.push({
    id,
    path: path.replace(`${process.cwd()}/`, ""),
    bytes,
    drawCalls: state?.drawCalls ?? 0,
    frameCount: state?.frameCount ?? 0,
    renderedItems: state?.renderedItems ?? 0,
    lastError: state?.lastError ?? null
  });
}

interface ExampleState {
  readonly id: string;
  readonly status: string;
  readonly workflowKind?: string;
  readonly featureChecklist: readonly string[];
  readonly drawCalls: number;
  readonly frameCount: number;
  readonly renderedItems: number;
  readonly lastError: string | null;
}

interface ExampleCapture {
  readonly id: string;
  readonly path: string;
  readonly bytes: number;
  readonly drawCalls: number;
  readonly frameCount: number;
  readonly renderedItems: number;
  readonly lastError: string | null;
}
