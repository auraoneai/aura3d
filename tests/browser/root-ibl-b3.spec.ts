import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT = "tests/reports/root-ibl-b3/b3-probe.json";

interface B3Environment {
  readonly preset: string | undefined;
  readonly iblPixelBacked: boolean;
  readonly hdriStatus: string;
  readonly dualProbe?: boolean;
}

interface B3Capture {
  readonly id: string;
  readonly environment: B3Environment;
  readonly warnings: readonly string[];
  readonly drawCalls: number;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

interface B3Window extends Window {
  readonly __AURA3D_B3_RUNNER__?: {
    renderVariant(id: string): Promise<B3Capture>;
  };
  readonly __AURA3D_B3_ERROR__?: string;
}

/** B3 root HDRI: authored .hdr resolves through the HDR chain with deltas; fallback stays procedural with a warning. */
test("root HDRI B3 resolves with pixel deltas and honest fallback", async ({ page }) => {
  test.setTimeout(300_000);
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/root-ibl-b3-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const harnessWindow = window as B3Window;
      return Boolean(harnessWindow.__AURA3D_B3_RUNNER__ || harnessWindow.__AURA3D_B3_ERROR__);
    }, undefined, { timeout: 90_000 });
    const harnessError = await page.evaluate(() => (window as B3Window).__AURA3D_B3_ERROR__);
    if (harnessError) throw new Error(harnessError);

    const render = (id: string): Promise<B3Capture> =>
      page.evaluate((variant) =>
        (window as B3Window).__AURA3D_B3_RUNNER__!.renderVariant(variant), id);

    const baseline = await render("baseline");
    expect(baseline.drawCalls).toBeGreaterThan(0);
    expect(baseline.environment.preset).toBe("studio");
    expect(baseline.environment.iblPixelBacked).toBe(false);

    // HDRI: chain resolves, pixel-backed, real delta vs procedural studio.
    const hdri = await render("hdri");
    expect(hdri.environment.preset).toBe("hdri");
    expect(hdri.environment.hdriStatus).toBe("ready");
    expect(hdri.environment.iblPixelBacked).toBe(true);
    const hdriDelta = pixelDelta(hdri, baseline);
    expect(hdriDelta.changedFraction).toBeGreaterThan(0.02);
    await page.screenshot({ path: resolve("tests/reports/root-ibl-b3/b3-hdri.png") });

    // Fallback: missing HDRI keeps the procedural fallback, warns, still draws.
    const fallback = await render("hdriFallback");
    expect(fallback.drawCalls).toBeGreaterThan(0);
    expect(fallback.environment.iblPixelBacked).toBe(false);
    expect(fallback.environment.hdriStatus).toBe("fallback");
    expect(fallback.warnings.join(" ")).toContain("HDRI upgrade failed");

    // Dual probe: kloppenheim reflections over studio illumination.
    const dualProbe = await render("dualProbe");
    expect(dualProbe.environment.iblPixelBacked).toBe(true);
    expect(dualProbe.environment.dualProbe).toBe(true);
    const dualDelta = pixelDelta(dualProbe, hdri);
    expect(dualDelta.changedFraction).toBeGreaterThan(0.02);
    await page.screenshot({ path: resolve("tests/reports/root-ibl-b3/b3-dual-probe.png") });

    // envMapIntensity: zero response on the subject with the same HDRI.
    const envDim = await render("envDim");
    expect(envDim.environment.iblPixelBacked).toBe(true);
    const envDimDelta = pixelDelta(envDim, hdri);
    expect(envDimDelta.changedFraction).toBeGreaterThan(0.02);
    await page.screenshot({ path: resolve("tests/reports/root-ibl-b3/b3-env-dim.png") });

    writeJson(REPORT, {
      generatedAt: new Date().toISOString(),
      baseline: { ...baseline, pixels: `[${baseline.pixels.length} channels]` },
      hdri: { ...hdri, pixels: `[${hdri.pixels.length} channels]` },
      hdriDelta,
      fallback: { ...fallback, pixels: `[${fallback.pixels.length} channels]` },
      dualProbe: { ...dualProbe, pixels: `[${dualProbe.pixels.length} channels]` },
      dualDelta,
      envDim: { ...envDim, pixels: `[${envDim.pixels.length} channels]` },
      envDimDelta
    });
  } finally {
    await server.close();
  }
});

function pixelDelta(a: B3Capture, b: B3Capture): { changedFraction: number; meanAbsoluteDelta: number } {
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
