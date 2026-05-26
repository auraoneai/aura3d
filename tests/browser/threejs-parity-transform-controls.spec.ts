import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const SCREENSHOT_PATH = "tests/reports/threejs-parity/transform-controls/transform-controls.png";

test.describe("V9 TransformControls route evidence", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("public TransformControls route applies translate, rotate, and scale to rendered geometry", async ({ page }) => {
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

    const response = await page.goto(`${server.origin}/apps/controls-transform/`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await page.waitForFunction(() => {
      const runtime = window.__a3dV8TransformControls as { readonly status?: string; readonly drawCalls?: number } | undefined;
      return (runtime?.status === "ready" || runtime?.status === "running") && (runtime.drawCalls ?? 0) > 0;
    }, undefined, { timeout: 20_000 });

    await page.locator("#translate-x").click();
    await page.locator("#translate-y").click();
    await page.locator("#rotate-y").click();
    await page.locator("#scale-up").click();
    await page.waitForFunction(() => {
      const runtime = window.__a3dV8TransformControls as {
        readonly translateSamples?: number;
        readonly rotateSamples?: number;
        readonly scaleSamples?: number;
      } | undefined;
      return (runtime?.translateSamples ?? 0) >= 2 && (runtime?.rotateSamples ?? 0) >= 1 && (runtime?.scaleSamples ?? 0) >= 1;
    }, undefined, { timeout: 10_000 });

    const runtime = await page.evaluate(() => window.__a3dV8TransformControls) as {
      readonly controls?: string;
      readonly renderer?: string;
      readonly attached?: boolean;
      readonly position?: readonly number[];
      readonly rotation?: readonly number[];
      readonly scale?: readonly number[];
    };
    expect(runtime.controls).toBe("public-controls-TransformControls");
    expect(runtime.renderer).toBe("a3d-webgl2");
    expect(runtime.attached).toBe(true);
    expect(runtime.position?.[0]).toBeCloseTo(0.25);
    expect(runtime.position?.[1]).toBeCloseTo(0.25);
    expect(runtime.rotation?.[1]).toBeCloseTo(0.25);
    expect(runtime.scale?.[0]).toBeCloseTo(1.15);
    mkdirSync(dirname(resolve(SCREENSHOT_PATH)), { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
    expect(pageErrors).toEqual([]);
  });
});
