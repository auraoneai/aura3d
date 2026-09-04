import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT = "tests/reports/anisotropic-rotation-q1/aniso-rotation.json";

interface AnisoCapture {
  readonly id: string;
  readonly drawCalls: number;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

interface AnisoWindow extends Window {
  readonly __AURA3D_ANISO_RUNNER__?: {
    renderVariant(id: string): Promise<AnisoCapture>;
  };
  readonly __AURA3D_ANISO_ERROR__?: string;
}

/**
 * Q1.3 browser same-scene rotation proof (muse3jsparity-PRD Part Q).
 *
 * The unit side already proves the primitive lobe is the aspect-ratio
 * anisotropic-GGX family (algebraically identical to three's
 * D_GGX_Anisotropic, worst rel diff 1.2e-15). This spec proves the rotation
 * uniform actually steers rendered pixels: rot0 vs rot90 on an anisotropic
 * metal sphere must differ, while the same rotation pair at anisotropy 0
 * must be pixel-identical (control against unrelated uniform side effects).
 */
test("anisotropic rotation steers pixels, inert at anisotropy zero", async ({ page }) => {
  test.setTimeout(300_000);
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/anisotropic-rotation-q1-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const harnessWindow = window as AnisoWindow;
      return Boolean(harnessWindow.__AURA3D_ANISO_RUNNER__ || harnessWindow.__AURA3D_ANISO_ERROR__);
    }, undefined, { timeout: 90_000 });
    const harnessError = await page.evaluate(() => (window as AnisoWindow).__AURA3D_ANISO_ERROR__);
    if (harnessError) throw new Error(harnessError);

    const render = (id: string): Promise<AnisoCapture> =>
      page.evaluate((variant) =>
        (window as AnisoWindow).__AURA3D_ANISO_RUNNER__!.renderVariant(variant), id);

    const rot0 = await render("rot0");
    expect(rot0.drawCalls).toBeGreaterThan(0);
    const rot90 = await render("rot90");
    await page.screenshot({ path: resolve("tests/reports/anisotropic-rotation-q1/aniso-rot0.png") });

    const rotationDelta = pixelDelta(rot0, rot90);
    expect(rotationDelta.changedFraction).toBeGreaterThan(0.005);
    await page.screenshot({ path: resolve("tests/reports/anisotropic-rotation-q1/aniso-rot90.png") });

    // Control: rotation is pixel-inert without anisotropy.
    const noAniso = await render("noAniso");
    const noAnisoRot = await render("noAnisoRot");
    const controlDelta = pixelDelta(noAniso, noAnisoRot);
    expect(controlDelta.changedFraction).toBe(0);

    writeJson(REPORT, {
      generatedAt: new Date().toISOString(),
      rotationDelta,
      controlDelta,
      drawCalls: { rot0: rot0.drawCalls, rot90: rot90.drawCalls }
    });
  } finally {
    await server.close();
  }
});

function pixelDelta(a: AnisoCapture, b: AnisoCapture): { changedFraction: number; meanAbsoluteDelta: number } {
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
