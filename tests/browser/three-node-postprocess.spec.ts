import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readProductionPngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer } from "./example-dev-server";

const REPORT = "tests/reports/postprocessing/current-three-node.json";
const PNG = "tests/reports/postprocessing/current-three-node.png";

test("current Three.js r185 node RenderPipeline runs with TSL bloom", async ({ page }) => {
  test.setTimeout(120_000);
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/three-node-postprocess-harness.html`);
    await page.waitForFunction(() => window.__THREE_NODE_POSTPROCESS__?.status !== undefined, undefined, { timeout: 90_000 });
    const result = await page.evaluate(() => window.__THREE_NODE_POSTPROCESS__);
    expect(result, result?.error).toMatchObject({
      status: "ready", currentThreeRevision: "r185", renderer: "WebGPURenderer", backend: "WebGLBackend",
      actual: { webgpuRenderer: true, renderPipeline: true, nodeBloom: true, webgl2Backend: true }
    });
    if (!result || result.status !== "ready") return;
    expect(result.renderTargets.minimumTotal).toBeGreaterThanOrEqual(7);
    expect(result.frameCost.samples).toBeGreaterThanOrEqual(10);
    expect(result.pixels.nonBlackPixels).toBeGreaterThan(5_000);
    expect(result.pixels.haloPixels).toBeGreaterThan(1_000);
    writePng(PNG, result.dataUrl);
    const pixels = readProductionPngStats(resolve(PNG));
    expect(pixels.nonBlackPixels).toBeGreaterThan(5_000);
    const { dataUrl: _dataUrl, ...report } = result;
    writeJson(REPORT, { ...report, artifact: { path: PNG, size: statSync(resolve(PNG)).size, pixels }, generatedAt: new Date().toISOString() });
  } finally { await server.close(); }
});

function writePng(path: string, dataUrl: string): void { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64")); }
function writeJson(path: string, value: unknown): void { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`); }
