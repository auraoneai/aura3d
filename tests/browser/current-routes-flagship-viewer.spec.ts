import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { readProductionPngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

declare global {
  interface Window {
    __a3dFlagshipViewer?: {
      readonly status?: string;
      readonly error?: string;
      readonly screenshot?: { readonly mimeType: string; readonly width: number; readonly height: number; readonly byteLength: number };
      readonly snapshot?: {
        readonly asset?: { readonly id?: string; readonly name?: string; readonly primitiveCount?: number; readonly materialCount?: number };
        readonly environment?: { readonly id?: string; readonly exposure?: number; readonly rotation?: number };
        readonly controls?: { readonly roughnessScale?: number };
        readonly camera?: { readonly yawRadians?: number; readonly zoom?: number };
        readonly metrics?: { readonly frameCount?: number; readonly drawCalls?: number; readonly backend?: string };
        readonly screenshotCount?: number;
      };
    };
  }
}

test.describe("flagship viewer", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders first frame, drives controls, changes environment/exposure, and captures a screenshot report", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(`${server.origin}/apps/flagship-viewer/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const runtime = window.__a3dFlagshipViewer as {
          status?: string;
          snapshot?: { metrics?: { frameCount?: number; drawCalls?: number } };
        } | undefined;
        return (runtime?.status === "ready" || runtime?.status === "running") &&
          (runtime.snapshot?.metrics?.frameCount ?? 0) > 0 &&
          (runtime.snapshot?.metrics?.drawCalls ?? 0) > 0;
      },
      undefined,
      { timeout: 90_000 }
    );

    const firstFrame = await runtimeSnapshot(page);
    expect(firstFrame.status, firstFrame.error).toMatch(/ready|running/);
    expect(firstFrame.snapshot.asset.id).toBe("damaged-helmet");
    expect(firstFrame.snapshot.asset.primitiveCount).toBeGreaterThan(0);
    expect(firstFrame.snapshot.asset.materialCount).toBeGreaterThan(0);
    expect(firstFrame.snapshot.metrics.drawCalls).toBeGreaterThan(0);
    expect(firstFrame.snapshot.metrics.backend).toBe("webgl2");

    await page.locator("#orbit-right").click();
    await page.waitForFunction(
      (beforeYaw) => {
        const runtime = window.__a3dFlagshipViewer as { snapshot?: { camera?: { yawRadians?: number } } } | undefined;
        return (runtime?.snapshot?.camera?.yawRadians ?? 0) > beforeYaw;
      },
      firstFrame.snapshot.camera.yawRadians,
      { timeout: 10_000 }
    );
    const afterOrbit = await runtimeSnapshot(page);
    expect(afterOrbit.snapshot.camera.yawRadians).toBeGreaterThan(firstFrame.snapshot.camera.yawRadians);

    await setRange(page, "#exposure-control", "1.42");
    await page.waitForFunction(
      () => {
        const runtime = window.__a3dFlagshipViewer as { snapshot?: { environment?: { exposure?: number } } } | undefined;
        return Math.abs((runtime?.snapshot?.environment?.exposure ?? 0) - 1.42) < 0.02;
      },
      undefined,
      { timeout: 10_000 }
    );
    const afterExposure = await runtimeSnapshot(page);
    expect(afterExposure.snapshot.environment.exposure).toBeCloseTo(1.42, 1);

    await page.locator("#environment-picker").selectOption("venice-sunset");
    await page.waitForFunction(
      () => {
        const runtime = window.__a3dFlagshipViewer as { snapshot?: { environment?: { id?: string } } } | undefined;
        return runtime?.snapshot?.environment?.id === "venice-sunset";
      },
      undefined,
      { timeout: 30_000 }
    );
    const afterEnvironment = await runtimeSnapshot(page);
    expect(afterEnvironment.snapshot.environment.id).toBe("venice-sunset");
    expect(afterEnvironment.snapshot.environment.rotation).toBeCloseTo(0.62, 2);

    await setRange(page, "#roughness-control", "1.26");
    await page.waitForFunction(
      () => {
        const runtime = window.__a3dFlagshipViewer as { snapshot?: { controls?: { roughnessScale?: number } } } | undefined;
        return Math.abs((runtime?.snapshot?.controls?.roughnessScale ?? 0) - 1.26) < 0.02;
      },
      undefined,
      { timeout: 10_000 }
    );
    const afterMaterial = await runtimeSnapshot(page);
    expect(afterMaterial.snapshot.controls.roughnessScale).toBeCloseTo(1.26, 1);

    await page.locator("#screenshot-button").click();
    await page.waitForFunction(
      () => {
        const runtime = window.__a3dFlagshipViewer as {
          screenshot?: { byteLength?: number };
          snapshot?: { screenshotCount?: number };
        } | undefined;
        return (runtime?.snapshot?.screenshotCount ?? 0) > 0 && (runtime?.screenshot?.byteLength ?? 0) > 1000;
      },
      undefined,
      { timeout: 10_000 }
    );
    const afterScreenshot = await runtimeSnapshot(page);

    const reportDir = "tests/reports/flagship-viewer";
    const screenshotPath = `${reportDir}/flagship-viewer.png`;
    mkdirSync(resolve(reportDir), { recursive: true });
    await page.locator("#viewport").screenshot({ path: screenshotPath });
    const pngStats = readProductionPngStats(resolve(screenshotPath));
    expect(pngStats.nonBlackPixels).toBeGreaterThan(50_000);
    expect(pngStats.uniqueColorBuckets).toBeGreaterThan(24);
    expect(pngStats.localContrast).toBeGreaterThan(8);

    const report = {
      schema: "a3d-flagship-viewer",
      generatedAt: new Date().toISOString(),
      url: `${server.origin}/apps/flagship-viewer/`,
      screenshot: screenshotPath,
      firstFrame: firstFrame.snapshot,
      afterOrbit: afterOrbit.snapshot,
      afterExposure: afterExposure.snapshot,
      afterEnvironment: afterEnvironment.snapshot,
      afterMaterial: afterMaterial.snapshot,
      afterScreenshot: afterScreenshot.snapshot,
      pngStats,
      pageErrors,
      pass: pageErrors.length === 0
    };
    writeFileSync(resolve("tests/reports/flagship-viewer.json"), `${JSON.stringify(report, null, 2)}\n`);
    expect(pageErrors).toEqual([]);
  });
});

async function runtimeSnapshot(page: Page): Promise<{
  status: "loading" | "ready" | "running" | "error";
  error?: string;
  screenshot?: { mimeType: string; width: number; height: number; byteLength: number };
  snapshot: {
    status: "loading" | "ready" | "running" | "error";
    asset: {
      id: string;
      name: string;
      primitiveCount: number;
      materialCount: number;
    };
    environment: {
      id: string;
      exposure: number;
      rotation: number;
    };
    controls: {
      roughnessScale: number;
    };
    camera: {
      yawRadians: number;
      zoom: number;
    };
    metrics: {
      frameCount: number;
      drawCalls: number;
      backend: string;
    };
    screenshotCount: number;
  };
}> {
  return await page.evaluate(() => {
    const runtime = window.__a3dFlagshipViewer;
    if (!runtime?.snapshot) throw new Error("Missing flagship runtime snapshot.");
    return {
      status: runtime.status,
      ...(runtime.error ? { error: runtime.error } : {}),
      ...(runtime.screenshot ? { screenshot: runtime.screenshot } : {}),
      snapshot: runtime.snapshot
    };
  });
}

async function setRange(page: Page, selector: string, value: string): Promise<void> {
  await page.locator(selector).evaluate((element, nextValue) => {
    if (!(element instanceof HTMLInputElement)) throw new Error(`${element.id} is not an input`);
    element.value = String(nextValue);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(nextValue) }));
  }, value);
}
