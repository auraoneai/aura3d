import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT = "tests/reports/root-effects-a3/a3-probe.json";

interface A3Capture {
  readonly id: string;
  readonly actualPasses: readonly string[];
  readonly requestedPasses: readonly string[];
  readonly pixelBacked: boolean;
  readonly executionMode: string;
  readonly warnings: readonly string[];
  readonly drawCalls: number;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

interface A3Window extends Window {
  readonly __AURA3D_A3_RUNNER__?: {
    renderVariant(id: string): Promise<A3Capture>;
  };
  readonly __AURA3D_A3_ERROR__?: string;
}

const PIXEL_BACKED: Record<string, string> = {
  "color-grade": "color-grade",
  outline: "outline",
  fxaa: "fxaa",
  ssr: "ssr",
  dof: "depth-of-field"
};

/** A3 root effects: every submittable pass executes pixel-backed with an on/off delta; withheld intents warn and keep drawing. */
test("root A3 effects execute with pixel deltas and honest withholding", async ({ page }) => {
  test.setTimeout(300_000);
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/root-effects-a3-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const harnessWindow = window as A3Window;
      return Boolean(harnessWindow.__AURA3D_A3_RUNNER__ || harnessWindow.__AURA3D_A3_ERROR__);
    }, undefined, { timeout: 90_000 });
    const harnessError = await page.evaluate(() => (window as A3Window).__AURA3D_A3_ERROR__);
    if (harnessError) throw new Error(harnessError);

    const render = (id: string): Promise<A3Capture> =>
      page.evaluate((variant) =>
        (window as A3Window).__AURA3D_A3_RUNNER__!.renderVariant(variant), id);

    const baseline = await render("baseline");
    expect(baseline.drawCalls).toBeGreaterThan(0);

    const deltas: Record<string, { changedFraction: number; meanAbsoluteDelta: number }> = {};
    for (const [variant, pass] of Object.entries(PIXEL_BACKED)) {
      const capture = await render(variant);
      expect(capture.actualPasses).toContain(pass);
      expect(capture.pixelBacked).toBe(true);
      expect(capture.executionMode).toBe("renderer-owned-fused-ldr-native");
      const delta = pixelDelta(capture, baseline);
      expect(delta.changedFraction).toBeGreaterThan(0.002);
      deltas[variant] = delta;
      await page.screenshot({ path: resolve(`tests/reports/root-effects-a3/a3-${variant}.png`) });
    }

    // Withheld intents: still draw, warn explicitly, submit nothing doomed.
    for (const [variant, warning] of [["motion-blur", "motion-blur is recorded but withheld"], ["taa", "taa\" is recorded but withheld"]] as const) {
      const capture = await render(variant);
      expect(capture.drawCalls).toBeGreaterThan(0);
      expect(capture.warnings.join(" ")).toContain(warning);
      expect(capture.actualPasses).not.toContain(variant === "taa" ? "taa" : "motion-blur");
      deltas[variant] = pixelDelta(capture, baseline);
    }

    writeJson(REPORT, {
      generatedAt: new Date().toISOString(),
      baseline: { ...baseline, pixels: `[${baseline.pixels.length} channels]` },
      deltas
    });
    await page.screenshot({ path: resolve("tests/reports/root-effects-a3/a3-final.png") });
  } finally {
    await server.close();
  }
});

function pixelDelta(a: A3Capture, b: A3Capture): { changedFraction: number; meanAbsoluteDelta: number } {
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
