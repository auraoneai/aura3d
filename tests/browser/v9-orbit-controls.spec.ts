import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const SCREENSHOT_PATH = "tests/reports/v9/orbit-controls/orbit-controls.png";

test.describe("V9 OrbitControls route parity evidence", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("public OrbitControls route responds to rotate, pan, and wheel interactions", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !/\/favicon\.ico$/.test(response.url())) {
        pageErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    const response = await page.goto(`${server.origin}/apps/v8-controls-orbit/`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await page.waitForFunction(() => {
      const runtime = window.__g3dV8OrbitControls as { readonly status?: string; readonly drawCalls?: number } | undefined;
      return (runtime?.status === "ready" || runtime?.status === "running") && (runtime.drawCalls ?? 0) > 0;
    }, undefined, { timeout: 20_000 });

    const before = await readRuntime(page);
    const box = await page.locator("#viewport").boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.56, { steps: 6 });
    await page.mouse.up();
    await page.mouse.wheel(0, 240);
    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.52);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up("Shift");

    await page.waitForFunction(() => {
      const runtime = window.__g3dV8OrbitControls as {
        readonly rotateSamples?: number;
        readonly panSamples?: number;
        readonly wheelSamples?: number;
      } | undefined;
      return (runtime?.rotateSamples ?? 0) > 0 && (runtime?.panSamples ?? 0) > 0 && (runtime?.wheelSamples ?? 0) > 0;
    }, undefined, { timeout: 10_000 });
    const after = await readRuntime(page);

    expect(after.controls).toBe("public-input-OrbitControls");
    expect(after.renderer).toBe("g3d-webgl2");
    expect(after.rotateSamples).toBeGreaterThan(0);
    expect(after.panSamples).toBeGreaterThan(0);
    expect(after.wheelSamples).toBeGreaterThan(0);
    expect(after.azimuth).not.toBeCloseTo(before.azimuth, 4);
    expect(after.distance).toBeGreaterThan(before.distance);
    expect(after.target[0]).not.toBeCloseTo(before.target[0], 4);
    mkdirSync(dirname(resolve(SCREENSHOT_PATH)), { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
    expect(pageErrors).toEqual([]);
  });
});

async function readRuntime(page: import("@playwright/test").Page): Promise<{
  readonly controls: string;
  readonly renderer: string;
  readonly distance: number;
  readonly polar: number;
  readonly azimuth: number;
  readonly target: readonly [number, number, number];
  readonly rotateSamples: number;
  readonly panSamples: number;
  readonly wheelSamples: number;
}> {
  return page.evaluate(() => {
    const runtime = window.__g3dV8OrbitControls as {
      readonly controls?: string;
      readonly renderer?: string;
      readonly distance?: number;
      readonly polar?: number;
      readonly azimuth?: number;
      readonly target?: readonly [number, number, number];
      readonly rotateSamples?: number;
      readonly panSamples?: number;
      readonly wheelSamples?: number;
    } | undefined;
    return {
      controls: runtime?.controls ?? "",
      renderer: runtime?.renderer ?? "",
      distance: runtime?.distance ?? 0,
      polar: runtime?.polar ?? 0,
      azimuth: runtime?.azimuth ?? 0,
      target: runtime?.target ?? [0, 0, 0],
      rotateSamples: runtime?.rotateSamples ?? 0,
      panSamples: runtime?.panSamples ?? 0,
      wheelSamples: runtime?.wheelSamples ?? 0
    };
  });
}
