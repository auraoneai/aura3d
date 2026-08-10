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
    const commandPerformance = await measureRepeatedFramePerformance(page);
    await page.locator("#aura-stage").screenshot({ path: resolve(REPORT_DIRECTORY, "command-canvas.png") });

    await page.locator("[data-district='core']").click();
    await page.waitForFunction(() => {
      const evidence = window.__AURA3D_SHOWCASE_SMART_CITY_CONTROL__;
      return evidence?.interactionState.selectedBuildingId === "core-tower-3"
        && evidence.diagnostics?.buildingFocus?.cameraFocused === true
        && evidence.diagnostics?.buildingFocus?.invariants?.passes === true;
    });
    const focusedBuilding = await page.evaluate(() => {
      const evidence = window.__AURA3D_SHOWCASE_SMART_CITY_CONTROL__!;
      return {
        selectedBuildingId: evidence.interactionState.selectedBuildingId,
        focus: evidence.diagnostics.buildingFocus,
        cameraMode: evidence.interactionState.cameraMode
      };
    });
    await page.locator("#aura-stage").screenshot({ path: resolve(REPORT_DIRECTORY, "focused-building-canvas.png") });

    await page.locator("[data-camera='flythrough']").click();
    await waitForOptimizationEvidence(page, "flythrough");
    const flythrough = await readEvidence(page);
    const flythroughPerformance = await measureRepeatedFramePerformance(page);
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
    expect(focusedBuilding).toMatchObject({
      selectedBuildingId: "core-tower-3",
      cameraMode: "command",
      focus: {
        targetId: "core-tower-3",
        cameraFocused: true,
        invariants: { passes: true }
      }
    });
    for (const sample of [...commandPerformance, ...flythroughPerformance]) {
      expect(sample.frames).toBe(45);
      expect(sample.p50Ms).toBeLessThan(35);
      expect(sample.p95Ms).toBeLessThan(80);
    }
    expect(pageErrors).toEqual([]);

    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({
      schema: "aura3d.smart-city-optimization/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      viewport: VIEWPORT,
      command,
      commandPerformance,
      focusedBuilding,
      flythrough,
      flythroughPerformance,
      assertions: {
        publicRoute: true,
        productionRuntime: true,
        nativeInstancing: true,
        distanceLodTransition: true,
        frustumCulling: true,
        selectedBuildingFocus: true,
        repeatedLargeScenePerformance: true,
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

async function measureRepeatedFramePerformance(page: import("@playwright/test").Page): Promise<readonly {
  readonly frames: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}[]> {
  return await page.evaluate(async () => {
    const rounds = [];
    for (let round = 0; round < 3; round += 1) {
      const samples: number[] = [];
      let previous = await new Promise<number>((resolveFrame) => requestAnimationFrame(resolveFrame));
      for (let frame = 0; frame < 45; frame += 1) {
        const current = await new Promise<number>((resolveFrame) => requestAnimationFrame(resolveFrame));
        samples.push(current - previous);
        previous = current;
      }
      samples.sort((left, right) => left - right);
      rounds.push({
        frames: samples.length,
        p50Ms: Number(samples[Math.floor(samples.length * 0.5)]!.toFixed(3)),
        p95Ms: Number(samples[Math.floor(samples.length * 0.95)]!.toFixed(3)),
        maxMs: Number(samples[samples.length - 1]!.toFixed(3))
      });
    }
    return rounds;
  });
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
