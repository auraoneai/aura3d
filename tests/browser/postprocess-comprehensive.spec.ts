import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readProductionPngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer } from "./example-dev-server";

const REPORT = "tests/reports/postprocessing/comprehensive-effects.json";

test("public composer proves every advertised effect on subject-region WebGL pixels", async ({ page }) => {
  test.setTimeout(120_000);
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/postprocess-comprehensive-harness.html`);
    await page.waitForFunction(() => window.__AURA3D_POSTPROCESS_COMPREHENSIVE__?.status !== undefined, undefined, { timeout: 90_000 });
    const result = await page.evaluate(() => window.__AURA3D_POSTPROCESS_COMPREHENSIVE__);
    expect(result, result?.status === "error" ? result.error : undefined).toMatchObject({
      status: "ready", renderer: "webgl2", width: 128, height: 96,
      assertions: { completeAdvertisedComposerCatalog: true, everyEffectHasSubjectPixels: true, reusableTwoTargetPingPong: true, actualWebglBackbuffer: true, domOrCssEffectImplementation: false }
    });
    if (!result || result.status !== "ready") return;
    expect(result.effects.map((entry) => entry.effect)).toEqual([
      "bloom", "tone-mapping", "tone-mapping-preset", "color-grade", "chromatic-aberration", "film-grain", "depth-of-field", "motion-blur", "ssao", "ssr", "taa", "outline", "fxaa"
    ]);
    expect(result.effects.every((entry) => entry.subjectChangedPixels >= 8 && entry.subjectMeanDelta > 0.05)).toBe(true);
    const artifactDir = "tests/reports/postprocessing/effects";
    const artifacts: Record<string, { path: string; size: number; pixels: ReturnType<typeof readProductionPngStats> }> = {};
    for (const entry of result.effects) {
      const path = `${artifactDir}/${entry.effect}.png`;
      writePng(path, entry.dataUrl);
      const pixels = readProductionPngStats(resolve(path));
      expect(pixels.nonBlackPixels).toBeGreaterThan(4_000);
      expect(pixels.uniqueColorBuckets).toBeGreaterThan(6);
      artifacts[entry.effect] = { path, size: statSync(resolve(path)).size, pixels };
    }
    const sourcePath = `${artifactDir}/off-source.png`;
    writePng(sourcePath, result.sourceDataUrl);
    const { sourceDataUrl: _source, effects, ...rest } = result;
    writeJson(REPORT, { ...rest, effects: effects.map(({ dataUrl: _dataUrl, ...entry }) => entry), artifacts: { source: sourcePath, on: artifacts }, generatedAt: new Date().toISOString() });
    assertNoDomCssEffectImplementation();
  } finally {
    await server.close();
  }
});

function assertNoDomCssEffectImplementation(): void {
  const sources = ["packages/rendering/src/postprocess/EffectComposer.ts", "packages/rendering/src/PostProcessPass.ts", "tests/browser/postprocess-comprehensive-harness.ts"];
  for (const path of sources) {
    const source = readFileSync(resolve(path), "utf8");
    expect(source).not.toMatch(/filter\s*:\s*(?:blur|drop-shadow|contrast|brightness)|box-shadow\s*:|text-shadow\s*:/i);
  }
}

function writePng(path: string, dataUrl: string): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}
