import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT = "tests/reports/animation-complete/resource-lifecycle.json";

test("repeated imported animation load/play/stop/dispose leaves no renderer or mixer resources", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/animation-resource-lifecycle-harness.html`);
    await page.waitForFunction(() => window.__AURA3D_ANIMATION_LIFECYCLE__?.status !== undefined, undefined, { timeout: 90_000 });
    const result = await page.evaluate(() => window.__AURA3D_ANIMATION_LIFECYCLE__);
    expect(result, result?.error).toMatchObject({ status: "ready" });
    if (!result || result.status !== "ready") return;
    expect(result.cycles).toHaveLength(3);
    for (const cycle of result.cycles) {
      expect(cycle.update.tracksApplied).toBeGreaterThan(0);
      expect(cycle.update.skinningPalettesUpdated).toBeGreaterThan(0);
      expect(cycle.rendered).toMatchObject({ backend: "webgl2" });
      expect(cycle.rendered.drawCalls).toBeGreaterThan(0);
      expect(cycle.beforeStop.activeClipNames).toContain(cycle.clipName);
      expect(cycle.beforeStop.mixerActionCount).toBeGreaterThan(0);
      expect(cycle.afterStop.activeClipNames).toEqual([]);
      expect(cycle.bindingAfterDispose.actionCount).toBe(0);
      expect(cycle.bindingAfterDispose.mixer).toMatchObject({ actionCount: 0, layers: [], values: {} });
      expect(cycle.resourcesBeforeDispose.buffers).toBeGreaterThan(0);
      expect(cycle.resourcesAfterDispose).toMatchObject({ buffers: 0, shaders: 0, textures: 0, renderTargets: 0, bufferBytes: 0, textureBytes: 0, approximateGpuMemoryBytes: 0 });
    }
    expect(errors).toEqual([]);
    writeJson(REPORT, { ...result, generatedAt: new Date().toISOString() });
  } finally { await server.close(); }
});

function writeJson(path: string, value: unknown): void { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`); }
