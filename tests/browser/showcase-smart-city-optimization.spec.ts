import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_DIRECTORY = resolve("tests/reports/2.0-smart-city-optimization");
const VIEWPORT = { width: 1440, height: 900 } as const;

test("proves the public Smart City route changes LOD and performs native frustum culling", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(REPORT_DIRECTORY, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize(VIEWPORT);
    await page.goto(`${server.origin}/apps/showcase-smart-city-control/`);
    await waitForOptimizationEvidence(page, "command");
    const command = await readEvidence(page);
    await page.locator("#aura-stage").screenshot({ path: resolve(REPORT_DIRECTORY, "command-canvas.png") });

    await page.locator("[data-camera='flythrough']").click();
    await waitForOptimizationEvidence(page, "flythrough");
    const flythrough = await readEvidence(page);
    await page.locator("#aura-stage").screenshot({ path: resolve(REPORT_DIRECTORY, "flythrough-canvas.png") });

    expect(command.runtime.backend).toBe("production-runtime");
    expect(flythrough.runtime.backend).toBe("production-runtime");
    expect(command.runtime.nativeInstancedSubmissions).toBeGreaterThan(0);
    expect(flythrough.runtime.nativeInstancedSubmissions).toBeGreaterThan(0);
    expect(command.runtime.frustumTestedObjects).toBeGreaterThan(0);
    expect(flythrough.runtime.frustumTestedObjects).toBeGreaterThan(0);
    expect(flythrough.runtime.culledObjects).toBeGreaterThan(0);
    expect(flythrough.runtime.visibleObjects).toBeLessThan(flythrough.runtime.submittedObjects);
    expect(command.lod).toMatchObject({ nodeName: "core communications tower distance LOD" });
    expect(flythrough.lod).toMatchObject({ nodeName: "core communications tower distance LOD" });
    expect(command.lod.levelIndex).not.toBe(flythrough.lod.levelIndex);
    expect(pageErrors).toEqual([]);

    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({
      schema: "aura3d.smart-city-optimization/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      viewport: VIEWPORT,
      command,
      flythrough,
      assertions: {
        publicRoute: true,
        productionRuntime: true,
        nativeInstancing: true,
        distanceLodTransition: true,
        frustumCulling: true,
        gpuOcclusionCullingClaimed: false
      },
      pageErrors
    }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

async function waitForOptimizationEvidence(page: import("@playwright/test").Page, cameraMode: "command" | "street" | "flythrough"): Promise<void> {
  await page.waitForFunction((mode) => {
    const evidence = window.__AURA3D_SHOWCASE_SMART_CITY_CONTROL__;
    const runtime = evidence?.diagnostics?.rendererRuntime;
    return evidence?.status === "ready"
      && evidence.interactionState.cameraMode === mode
      && evidence.frameCount > 1
      && runtime?.backend === "production-runtime"
      && runtime.lodSelections?.length > 0
      && runtime.frustumTestedObjects > 0;
  }, cameraMode, { timeout: 90_000 });
}

async function readEvidence(page: import("@playwright/test").Page): Promise<{
  readonly cameraMode: string;
  readonly runtime: {
    readonly backend: string;
    readonly nativeInstancedSubmissions: number;
    readonly submittedObjects: number;
    readonly visibleObjects: number;
    readonly culledObjects: number;
    readonly frustumTestedObjects: number;
  };
  readonly lod: { readonly nodeName: string; readonly levelIndex: number; readonly levelName: string };
}> {
  return await page.evaluate(() => {
    const evidence = window.__AURA3D_SHOWCASE_SMART_CITY_CONTROL__!;
    const runtime = evidence.diagnostics.rendererRuntime;
    return {
      cameraMode: evidence.interactionState.cameraMode,
      runtime: {
        backend: runtime.backend,
        nativeInstancedSubmissions: runtime.nativeInstancedSubmissions,
        submittedObjects: runtime.submittedObjects,
        visibleObjects: runtime.visibleObjects,
        culledObjects: runtime.culledObjects,
        frustumTestedObjects: runtime.frustumTestedObjects
      },
      lod: runtime.lodSelections[0]
    };
  });
}
