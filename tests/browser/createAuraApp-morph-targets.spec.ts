import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const harnessSource = resolve(process.cwd(), "tests/browser/createAuraApp-morph-targets-harness.ts");

test.describe("createAuraApp morph target contract", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("harness imports only the root public API and generated typed assets", () => {
    const source = readFileSync(harnessSource, "utf8");
    expect(source).toContain('from "@aura3d/engine"');
    expect(source).toContain('from "../../src/aura-assets"');
    expect(source).not.toMatch(/from\s+["'](?:three|@aura3d\/rendering|@aura3d\/engine\/rendering|@aura3d\/engine\/production-runtime|@aura3d\/assets|@aura3d\/assets\/browser)/);
    expect(source).not.toContain("GLTFLoader");
    expect(source).not.toContain("unsafeModelUrl");
    expect(source).not.toMatch(/model\(\s*["'`]/);
  });

  test("drives named GLB morph targets through a root runtime node with pixel evidence", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-morph-targets-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_MORPH_TARGETS_CONTRACT__), undefined, { timeout: 25_000 });

    const baseline = await captureMorphState(page, { "target-0": 0 });
    const morphed = await captureMorphState(page, { "target-0": 1 });
    const neutral = await captureMorphState(page, { "target-0": 0 });
    const morphDiff = await diffScreenshots(page, baseline.screenshot, morphed.screenshot);
    const neutralDiff = await diffScreenshots(page, morphed.screenshot, neutral.screenshot);
    const evidence = morphed.evidence;

    expect(evidence?.imports).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
    expect(evidence?.renderer?.mode).toBe("production");
    expect(evidence?.renderer?.runtimeBackend).toBe("production-runtime");
    expect(evidence?.renderer?.fallbackUsed).toBe(false);
    expect(evidence?.renderer?.drawCalls).toBeGreaterThan(0);
    expect(evidence?.asset?.typedRef).toBe("assets.showcaseMorphExpression");
    expect(evidence?.asset?.assetId).toBe("showcaseMorphExpression");
    expect(evidence?.asset?.targetNames).toEqual(expect.arrayContaining(["target-0"]));
    expect(evidence?.asset?.morphRenderItemCount).toBeGreaterThan(0);
    expect(evidence?.asset?.activeMorphTargets?.["target-0"]).toBeCloseTo(1);
    expect(neutral.evidence?.asset?.activeMorphTargets?.["target-0"]).toBeCloseTo(0);
    expect(evidence?.asset?.missingMorphTargets).toEqual([]);
    expect(baseline.stats.nonBackgroundPixels).toBeGreaterThan(500);
    expect(baseline.stats.uniqueColorBuckets).toBeGreaterThan(4);
    expect(morphDiff.hashA).not.toBe(morphDiff.hashB);
    expect(neutralDiff.hashA).not.toBe(neutralDiff.hashB);
    expect(morphDiff.changedSubjectPixels).toBeGreaterThan(20);
    expect(neutralDiff.changedSubjectPixels).toBeGreaterThan(20);
    expect(evidence?.claims).toEqual(expect.arrayContaining([
      "root-createAuraApp-morph-targets",
      "typed-glb-production-bridge",
      "morph-target-pixel-change"
    ]));
    expect(errors).toEqual([]);
    writeJson("tests/reports/animation-complete/root-morph-targets.json", {
      evidence,
      baseline: { stats: baseline.stats },
      morphed: { stats: morphed.stats },
      neutral: { stats: neutral.stats },
      morphDiff,
      neutralDiff,
      pageErrors: errors,
      generatedAt: new Date().toISOString()
    });
  });
});

function writeJson(path: string, value: unknown): void { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`); }

async function captureMorphState(page: import("@playwright/test").Page, weights: Record<string, number>) {
  const evidence = await page.evaluate(async (nextWeights) => {
    const capture = (window as any).__AURA3D_MORPH_TARGETS_CAPTURE__;
    if (typeof capture !== "function") throw new Error("Morph target capture helper was not registered.");
    return await capture(nextWeights);
  }, weights);
  const canvas = page.locator("#stage canvas");
  await expect(canvas).toBeVisible();
  const screenshot = await canvas.screenshot();
  const stats = await screenshotStats(page, screenshot);
  return { evidence, screenshot, stats };
}

async function screenshotStats(page: import("@playwright/test").Page, screenshot: Buffer) {
  return await page.evaluate(async (base64) => {
    async function loadPixels(encoded: string) {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Screenshot decode context unavailable.");
      context.drawImage(image, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      let hash = 2166136261;
      for (let index = 0; index < imageData.data.length; index += 1) {
        hash ^= imageData.data[index] ?? 0;
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      return {
        width: canvas.width,
        height: canvas.height,
        hash: hash.toString(16).padStart(8, "0"),
        pixels: imageData.data
      };
    }
    const image = await loadPixels(base64);
    const buckets = new Set<string>();
    let nonBackgroundPixels = 0;
    for (let index = 0; index < image.pixels.length; index += 4) {
      const red = image.pixels[index] ?? 0;
      const green = image.pixels[index + 1] ?? 0;
      const blue = image.pixels[index + 2] ?? 0;
      const alpha = image.pixels[index + 3] ?? 0;
      if (alpha > 0 && (red > 18 || green > 18 || blue > 22)) {
        nonBackgroundPixels += 1;
        buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
      }
    }
    return {
      width: image.width,
      height: image.height,
      nonBackgroundPixels,
      uniqueColorBuckets: buckets.size,
      hash: image.hash
    };
  }, screenshot.toString("base64"));
}

async function diffScreenshots(page: import("@playwright/test").Page, a: Buffer, b: Buffer) {
  return await page.evaluate(async ({ first, second }) => {
    async function loadPixels(encoded: string) {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Screenshot decode context unavailable.");
      context.drawImage(image, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      let hash = 2166136261;
      for (let index = 0; index < imageData.data.length; index += 1) {
        hash ^= imageData.data[index] ?? 0;
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      return {
        hash: hash.toString(16).padStart(8, "0"),
        pixels: imageData.data
      };
    }
    const imageA = await loadPixels(first);
    const imageB = await loadPixels(second);
    const length = Math.min(imageA.pixels.length, imageB.pixels.length);
    let changedPixels = 0;
    let changedSubjectPixels = 0;
    let totalDelta = 0;
    let maxDelta = 0;
    for (let index = 0; index < length; index += 4) {
      const redDelta = Math.abs((imageA.pixels[index] ?? 0) - (imageB.pixels[index] ?? 0));
      const greenDelta = Math.abs((imageA.pixels[index + 1] ?? 0) - (imageB.pixels[index + 1] ?? 0));
      const blueDelta = Math.abs((imageA.pixels[index + 2] ?? 0) - (imageB.pixels[index + 2] ?? 0));
      const alphaDelta = Math.abs((imageA.pixels[index + 3] ?? 0) - (imageB.pixels[index + 3] ?? 0));
      const delta = redDelta + greenDelta + blueDelta + alphaDelta;
      if (delta > 8) changedPixels += 1;
      if (delta > 24) changedSubjectPixels += 1;
      totalDelta += delta;
      maxDelta = Math.max(maxDelta, delta);
    }
    return {
      changedPixels,
      changedSubjectPixels,
      meanDelta: totalDelta / Math.max(1, length / 4),
      maxDelta,
      hashA: imageA.hash,
      hashB: imageB.hash
    };
  }, {
    first: a.toString("base64"),
    second: b.toString("base64")
  });
}
