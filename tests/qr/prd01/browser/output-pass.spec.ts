import { test, expect } from "@playwright/test";
import { centerRgb, maxAbsDiff, nonFavicon, openTool, shot, shotPair, type QrTools } from "./specHelpers";

// PRD-01 §17.1 S10 / §15 Phase 4 (row 01-S10), flag on (`a3d-qr=core`).
//  Engine (`createAuraApp` + C-05 output surface) vs three r185:
//   - prd01-tonemap-exposure-ramp, aces/agx/neutral × exposure 0.5/1/2:
//     per-swatch ΔE2000 ≤ 2, mean ≤ 1;
//   - an unlit quad with emissive 4.0 under none/aces/agx/neutral: ±1;
//   - background `#336699` (aces): toneMapped false → (51,102,153) ±1;
//     toneMapped true → three ACES of linear(#336699) ±1; an additive
//     emissive 4.0 quad over it → encode(ACES(linear(#336699) + 4.0)) ±1;
//   - `setOutput({ exposure: 2 })` doubles the linear value (operator linear);
//   - zero overlay: `{ applied: true }` and bit-identical to no overlay.
//  Device (C-05 OutputPass conformance on a WebGL2Device):
//   - dither: longest equal-code run ≥ 150 px off, ≤ 16 px on, 64-px block
//     means within 0.5/255 of the ideal encode;
//   - single sRGB encode on the 50 % grey card (linear 0.214 → 128 ± 1);
//   - exposure ramp monotonic; emissive 4.0 vs three ±1; zero overlay
//     bit-identical.

const FLAGS = "core";

interface OutputPassReport {
  readonly dither: { readonly longestRunOff: number; readonly longestRunOn: number; readonly maxBlockMeanError255: number; readonly distinctCodesOff: number } | null;
  readonly greyCard: readonly number[];
  readonly exposureRamp: readonly { readonly toneMapping: string; readonly codes: readonly number[]; readonly monotonic: boolean }[];
  readonly emissive4: readonly { readonly toneMapping: string; readonly aura: readonly number[]; readonly three: readonly number[]; readonly maxDiff: number }[];
  readonly overlayZeroIdentical: boolean | null;
  readonly overlayZeroDiffPixels: number;
  readonly errors: readonly string[];
}

interface OutputSceneReport {
  readonly setOutputPresent: boolean;
  readonly overlayResult: unknown;
  readonly output: unknown;
  readonly errors: readonly string[];
}

interface ReadyPayload {
  readonly errors: readonly string[];
}

test.describe("C-05 OutputPass device conformance", () => {
  let device: OutputPassReport;
  const pageErrors: string[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    const page = await browser.newPage({ baseURL: testInfo.project.use.baseURL });
    device = await openTool<OutputPassReport>(page, `tools=output-pass&a3d-qr=${FLAGS}`, pageErrors);
    await page.close();
  });

  test("tool ran without errors", () => {
    expect(device.errors).toEqual([]);
    expect(nonFavicon(pageErrors)).toEqual([]);
  });

  test("dither: banding detectable off, broken up on, unbiased", () => {
    expect(device.dither).not.toBeNull();
    const d = device.dither!;
    test.info().annotations.push({ type: "metric", description: JSON.stringify(d) });
    expect(d.longestRunOff).toBeGreaterThanOrEqual(150);
    expect(d.longestRunOn).toBeLessThanOrEqual(16);
    expect(d.maxBlockMeanError255).toBeLessThanOrEqual(0.5);
  });

  test("single sRGB encode: 50 % grey card linear 0.214 → 128 ± 1", () => {
    test.info().annotations.push({ type: "metric", description: `greyCard=${device.greyCard.join(",")}` });
    expect(device.greyCard).toHaveLength(3);
    expect(maxAbsDiff(device.greyCard, [128, 128, 128])).toBeLessThanOrEqual(1);
  });

  test("exposure ramp is monotonic for aces/agx/neutral", () => {
    expect(device.exposureRamp.map((r) => r.toneMapping)).toEqual(["aces", "agx", "neutral"]);
    for (const row of device.exposureRamp) {
      test.info().annotations.push({ type: "metric", description: `${row.toneMapping} codes=${row.codes.join(",")}` });
      expect(row.monotonic).toBe(true);
    }
  });

  test("emissive 4.0 vs three r185 per operator ±1", () => {
    expect(device.emissive4.map((r) => r.toneMapping)).toEqual(["none", "aces", "agx", "neutral"]);
    for (const row of device.emissive4) {
      test.info().annotations.push({ type: "metric", description: `${row.toneMapping} aura=${row.aura.join(",")} three=${row.three.join(",")}` });
      expect(row.maxDiff).toBeLessThanOrEqual(1);
    }
  });

  test("zero overlay is bit-identical to no overlay", () => {
    test.info().annotations.push({ type: "metric", description: `diffPixels=${device.overlayZeroDiffPixels}` });
    expect(device.overlayZeroIdentical).toBe(true);
  });
});

for (const tm of ["aces", "agx", "neutral"]) {
  for (const exp of ["0.5", "1", "2"]) {
    test(`prd01-tonemap-exposure-ramp ${tm} × ${exp}: swatch ΔE2000 ≤ 2, mean ≤ 1`, async ({ page }) => {
      const pageErrors: string[] = [];
      const captures: string[] = [];
      for (const engine of ["aura3d", "three"]) {
        await openTool(page, `engine=${engine}&scene=prd01-tonemap-exposure-ramp&tm=${tm}&exp=${exp}&a3d-qr=${FLAGS}`, pageErrors);
        const payload = (await page.evaluate(() => window.__QR_READY__)) as ReadyPayload;
        expect(payload.errors).toEqual([]);
        captures.push(await shot(page, 0, 0, 1280, 720));
      }
      const stats = await page.evaluate(async ([a, b]) => {
        const tools = (window as unknown as { __QR_TOOLS__: QrTools }).__QR_TOOLS__;
        const aura = await tools.decodePng(a!);
        const three = await tools.decodePng(b!);
        const bg: [number, number, number] = [three.data[0]!, three.data[1]!, three.data[2]!];
        return tools.metrics.swatchDeltaE(aura, three, bg);
      }, captures);
      test.info().annotations.push({ type: "metric", description: `${tm}×${exp} swatches=${stats.swatches} max=${stats.max.toFixed(3)} mean=${stats.mean.toFixed(3)} per=${stats.perSwatch.map((v) => v.toFixed(2)).join(",")}` });
      expect(stats.swatches).toBeGreaterThanOrEqual(5);
      expect(stats.max).toBeLessThanOrEqual(2);
      expect(stats.mean).toBeLessThanOrEqual(1);
      expect(nonFavicon(pageErrors)).toEqual([]);
    });
  }
}

for (const tm of ["none", "aces", "agx", "neutral"]) {
  test(`engine: unlit emissive 4.0 under ${tm} matches three ±1`, async ({ page }) => {
    const pageErrors: string[] = [];
    const report = await openTool<OutputSceneReport>(page, `tools=output-scene&case=emissive4&tm=${tm}&a3d-qr=${FLAGS}`, pageErrors);
    expect(report.errors).toEqual([]);
    expect(report.setOutputPresent).toBe(true);
    const { aura, three } = await shotPair(page);
    const a = await centerRgb(page, aura);
    const b = await centerRgb(page, three);
    test.info().annotations.push({ type: "metric", description: `${tm} aura=${a.join(",")} three=${b.join(",")}` });
    expect(maxAbsDiff(a, b)).toBeLessThanOrEqual(1);
    expect(nonFavicon(pageErrors)).toEqual([]);
  });
}

test("engine: #336699 background with toneMapped false reads (51,102,153) ±1", async ({ page }) => {
  const pageErrors: string[] = [];
  const report = await openTool<OutputSceneReport>(page, `tools=output-scene&case=bg&toneMapped=0&a3d-qr=${FLAGS}`, pageErrors);
  expect(report.errors).toEqual([]);
  const a = await centerRgb(page, (await shotPair(page)).aura);
  test.info().annotations.push({ type: "metric", description: `aura=${a.join(",")}` });
  expect(maxAbsDiff(a, [51, 102, 153])).toBeLessThanOrEqual(1);
  expect(nonFavicon(pageErrors)).toEqual([]);
});

for (const variant of [
  { name: "toneMapped true equals three ACES(linear(#336699))", query: "toneMapped=1" },
  { name: "additive emissive 4.0 over toneMapped:false background equals encode(ACES(bg + 4.0))", query: "toneMapped=0&additive=1" }
]) {
  test(`engine: #336699 ${variant.name} ±1`, async ({ page }) => {
    const pageErrors: string[] = [];
    const report = await openTool<OutputSceneReport>(page, `tools=output-scene&case=bg&${variant.query}&a3d-qr=${FLAGS}`, pageErrors);
    expect(report.errors).toEqual([]);
    const { aura, three } = await shotPair(page);
    const a = await centerRgb(page, aura);
    const b = await centerRgb(page, three);
    test.info().annotations.push({ type: "metric", description: `aura=${a.join(",")} three=${b.join(",")}` });
    expect(maxAbsDiff(a, b)).toBeLessThanOrEqual(1);
    expect(nonFavicon(pageErrors)).toEqual([]);
  });
}

test("engine: setOutput({ exposure: 2 }) doubles the linear value (operator linear)", async ({ page }) => {
  const pageErrors: string[] = [];
  const codes: number[][] = [];
  for (const exp of ["1", "2"]) {
    const report = await openTool<OutputSceneReport>(page, `tools=output-scene&case=exposure&tm=linear&exp=${exp}&a3d-qr=${FLAGS}`, pageErrors);
    expect(report.errors).toEqual([]);
    expect(report.setOutputPresent).toBe(true);
    codes.push(await centerRgb(page, (await shotPair(page)).aura));
  }
  const decode = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const encode = (v: number) => Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
  const expected = codes[0]!.map((c) => encode(Math.min(1, 2 * decode(c))));
  test.info().annotations.push({ type: "metric", description: `exp1=${codes[0]!.join(",")} exp2=${codes[1]!.join(",")} expected=${expected.join(",")}` });
  expect(codes[0]![1]!).toBeGreaterThan(20);
  expect(maxAbsDiff(codes[1]!, expected)).toBeLessThanOrEqual(1);
  expect(nonFavicon(pageErrors)).toEqual([]);
});

test("engine: zero overlay applies in-shader and is bit-identical to no overlay", async ({ page }) => {
  const pageErrors: string[] = [];
  const report = await openTool<OutputSceneReport>(page, `tools=output-scene&case=overlay&a3d-qr=${FLAGS}`, pageErrors);
  expect(report.errors).toEqual([]);
  const before = (await shotPair(page)).aura;
  await page.evaluate(() => (window as unknown as { __QR_SPEC_APPLY__: () => Promise<void> }).__QR_SPEC_APPLY__());
  const after = (await shotPair(page)).aura;
  const overlayResult = await page.evaluate(() => (window as unknown as { __QR_SPEC__: { overlayResult: unknown } }).__QR_SPEC__.overlayResult);
  const diff = await page.evaluate(async ([a, b]) => {
    const tools = (window as unknown as { __QR_TOOLS__: QrTools }).__QR_TOOLS__;
    return tools.metrics.meanAbsDiff(await tools.decodePng(a!), await tools.decodePng(b!));
  }, [before, after]);
  test.info().annotations.push({ type: "metric", description: `overlay=${JSON.stringify(overlayResult)} mad=${diff.mad} max=${diff.maxDiff}` });
  expect(overlayResult).toMatchObject({ applied: true });
  expect(diff.maxDiff).toBe(0);
  expect(nonFavicon(pageErrors)).toEqual([]);
});
