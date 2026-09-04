import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT = "tests/reports/root-textured-c1/c1-probe.json";

interface C1TexturedMaterial {
  readonly nodeName: string;
  readonly levelName: string;
  readonly status: string;
  readonly slots: readonly string[];
  readonly pixelBacked: boolean;
  readonly warnings: readonly string[];
}

interface C1Capture {
  readonly id: string;
  readonly texturedMaterials: readonly C1TexturedMaterial[];
  readonly warnings: readonly string[];
  readonly drawCalls: number;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

interface C1Window extends Window {
  readonly __AURA3D_C1_RUNNER__?: {
    renderVariant(id: string): Promise<C1Capture>;
  };
  readonly __AURA3D_C1_ERROR__?: string;
}

/** C1 root textured PBR: asset-ref maps upgrade to TexturedPBRMaterial with deltas; uv1 selector proven; procedural warned. */
test("root textured C1 upgrades with pixel deltas and honest fallbacks", async ({ page }) => {
  test.setTimeout(300_000);
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/root-textured-c1-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const harnessWindow = window as C1Window;
      return Boolean(harnessWindow.__AURA3D_C1_RUNNER__ || harnessWindow.__AURA3D_C1_ERROR__);
    }, undefined, { timeout: 90_000 });
    const harnessError = await page.evaluate(() => (window as C1Window).__AURA3D_C1_ERROR__);
    if (harnessError) throw new Error(harnessError);

    const render = (id: string): Promise<C1Capture> =>
      page.evaluate((variant) =>
        (window as C1Window).__AURA3D_C1_RUNNER__!.renderVariant(variant), id);

    const baseline = await render("baseline");
    expect(baseline.drawCalls).toBeGreaterThan(0);

    // Textured: all three slots bound, pixel-backed, real delta vs scalar.
    const textured = await render("textured");
    const subject = textured.texturedMaterials.find((entry) => entry.nodeName === "c1 subject box");
    expect(subject).toBeDefined();
    expect(subject!.status).toBe("textured");
    expect(subject!.pixelBacked).toBe(true);
    expect(subject!.slots).toEqual(expect.arrayContaining(["baseColor", "normal", "metallicRoughness"]));
    const texturedDelta = pixelDelta(textured, baseline);
    expect(texturedDelta.changedFraction).toBeGreaterThan(0.02);
    await page.screenshot({ path: resolve("tests/reports/root-textured-c1/c1-textured.png") });

    // uv1 selector: same maps on the tiling unwrap must sample differently.
    const uv1 = await render("uv1");
    const uv1Delta = pixelDelta(uv1, textured);
    expect(uv1Delta.changedFraction).toBeGreaterThan(0.02);
    await page.screenshot({ path: resolve("tests/reports/root-textured-c1/c1-uv1.png") });

    // Procedural: scalar retained, explicit warning, still draws.
    const procedural = await render("procedural");
    expect(procedural.drawCalls).toBeGreaterThan(0);
    expect(procedural.warnings.join(" ")).toContain("procedural texture");
    const proceduralSubject = procedural.texturedMaterials.find((entry) => entry.nodeName === "c1 subject box");
    expect(proceduralSubject?.pixelBacked ?? false).toBe(false);

    // Full maps: occlusion + emissive slots bound, pixel-backed, real delta vs textured.
    const fullmaps = await render("fullmaps");
    const fullmapsSubject = fullmaps.texturedMaterials.find((entry) => entry.nodeName === "c1 subject box");
    expect(fullmapsSubject).toBeDefined();
    expect(fullmapsSubject!.status).toBe("textured");
    expect(fullmapsSubject!.pixelBacked).toBe(true);
    expect(fullmapsSubject!.slots).toEqual(expect.arrayContaining(["baseColor", "normal", "metallicRoughness", "occlusion", "emissive"]));
    const fullmapsDelta = pixelDelta(fullmaps, textured);
    expect(fullmapsDelta.changedFraction).toBeGreaterThan(0.02);
    await page.screenshot({ path: resolve("tests/reports/root-textured-c1/c1-fullmaps.png") });

    // Transform: baseColor 0.5x scale resamples the checker (larger cells, no wrap), real delta vs textured.
    const xform = await render("xform");
    const xformSubject = xform.texturedMaterials.find((entry) => entry.nodeName === "c1 subject box");
    expect(xformSubject).toBeDefined();
    expect(xformSubject!.status).toBe("textured");
    expect(xformSubject!.pixelBacked).toBe(true);
    const xformDelta = pixelDelta(xform, textured);
    expect(xformDelta.changedFraction).toBeGreaterThan(0.02);
    await page.screenshot({ path: resolve("tests/reports/root-textured-c1/c1-xform.png") });

    writeJson(REPORT, {
      generatedAt: new Date().toISOString(),
      baseline: { ...baseline, pixels: `[${baseline.pixels.length} channels]` },
      textured: { ...textured, pixels: `[${textured.pixels.length} channels]` },
      texturedDelta,
      uv1Delta,
      fullmapsDelta,
      xformDelta
    });
  } finally {
    await server.close();
  }
});

function pixelDelta(a: C1Capture, b: C1Capture): { changedFraction: number; meanAbsoluteDelta: number } {
  expect(a.width).toBe(b.width);
  expect(a.height).toBe(b.height);
  const total = a.width * a.height;
  let changed = 0;
  let absoluteDelta = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const delta =
      Math.abs((a.pixels[offset] ?? 0) - (b.pixels[offset] ?? 0)) +
      Math.abs((a.pixels[offset + 1] ?? 0) - (b.pixels[offset + 1] ?? 0)) +
      Math.abs((a.pixels[offset + 2] ?? 0) - (b.pixels[offset + 2] ?? 0));
    absoluteDelta += delta;
    if (delta > 12) changed += 1;
  }
  return { changedFraction: changed / total, meanAbsoluteDelta: absoluteDelta / total };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}
