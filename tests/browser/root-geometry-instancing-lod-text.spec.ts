import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readProductionPngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer } from "./example-dev-server";

const REPORT = "tests/reports/geometry-instancing-lod-text/root-browser.json";

test("root API renders native instancing, distance LOD, mesh text, and custom geometry", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/root-geometry-instancing-lod-text-harness.html`);
    await page.waitForFunction(() => window.__AURA3D_ROOT_GEOMETRY__?.status !== undefined, undefined, { timeout: 90_000 });
    const result = await page.evaluate(() => window.__AURA3D_ROOT_GEOMETRY__);
    expect(result, result?.error).toMatchObject({ status: "ready", renderer: "root-createAuraApp-production-runtime", assertions: { rootOnlyImport: true, noDomTextRenderer: true } });
    if (!result || result.status !== "ready") return;
    expect(result.instancing.count).toBe(80);
    const instancingEvidence = JSON.stringify({
      initialDrawCalls: result.instancing.initialDrawCalls,
      updatedDrawCalls: result.instancing.updatedDrawCalls,
      nativeInitial: result.instancing.nativeInitial,
      nativeUpdated: result.instancing.nativeUpdated,
      initialBackend: result.instancing.initialBackend,
      updatedBackend: result.instancing.updatedBackend,
      initialWarnings: result.instancing.initialWarnings,
      updatedWarnings: result.instancing.updatedWarnings,
      initialErrors: result.instancing.initialErrors,
      updatedErrors: result.instancing.updatedErrors
    });
    expect(result.instancing.nativeInitial, instancingEvidence).toBeGreaterThan(0);
    expect(result.instancing.nativeUpdated).toBeGreaterThan(0);
    expect(result.instancing.initialDrawCalls).toBeLessThanOrEqual(2);
    expect(result.instancing.updatedDrawCalls).toBeLessThanOrEqual(2);
    expect(result.instancing.updateChangedPixels).toBeGreaterThan(500);
    expect(result.lod.near.center).not.toEqual(result.lod.far.center);
    expect(result.lod.changedPixels).toBeGreaterThan(1_000);
    expect(result.text.nonBlackPixels).toBeGreaterThan(5_000);
    expect(result.text.uniqueColors).toBeGreaterThan(20);
    expect(result.text.backend).toBe("production-runtime");
    expect(result.text.textMetadata).toMatchObject({ text: "AURA3D", glyphCount: 6, method: "extruded-bitmap-glyph-mesh" });
    expect(result.text.customKind).toBe("aura-custom-geometry");
    expect(result.lifecycle.disposedApps).toBe(result.lifecycle.createdApps);
    expect(errors).toEqual([]);
    assertRootOnlyHarness();
    const artifacts: Record<string, unknown> = {};
    for (const [name, dataUrl] of [["instances", result.instancing.dataUrl], ["lod-near", result.lod.near.dataUrl], ["lod-far", result.lod.far.dataUrl], ["text-custom", result.text.dataUrl]]) {
      const path = `tests/reports/geometry-instancing-lod-text/${name}.png`;
      writePng(path, dataUrl);
      artifacts[name] = { path, size: statSync(resolve(path)).size, pixels: readProductionPngStats(resolve(path)) };
    }
    const clean = structuredClone(result);
    delete clean.instancing.dataUrl; delete clean.lod.near.dataUrl; delete clean.lod.far.dataUrl; delete clean.lod.near.pixels; delete clean.lod.far.pixels; delete clean.text.dataUrl;
    writeJson(REPORT, { ...clean, artifacts, generatedAt: new Date().toISOString() });
  } finally { await server.close(); }
});

function assertRootOnlyHarness(): void { const source = readFileSync(resolve("tests/browser/root-geometry-instancing-lod-text-harness.ts"), "utf8"); expect(source).not.toMatch(/@aura3d\/(?:rendering|scene|engine\/)/); expect(source).not.toMatch(/from\s+["']three/); }
function writePng(path: string, dataUrl: string): void { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64")); }
function writeJson(path: string, value: unknown): void { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`); }
