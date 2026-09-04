import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT = "tests/reports/texture-pipeline-c3/c3-probe.json";

interface C3TexturedMaterial {
  readonly nodeName: string;
  readonly levelName: string;
  readonly status: string;
  readonly slots: readonly string[];
  readonly pixelBacked: boolean;
  readonly warnings: readonly string[];
}

interface C3Capture {
  readonly id: string;
  readonly texturedMaterials: readonly C3TexturedMaterial[];
  readonly samplerAnisotropyUploads: number;
  readonly maxTextureAnisotropy: number;
  readonly warnings: readonly string[];
  readonly drawCalls: number;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

interface C3Window extends Window {
  readonly __AURA3D_C3_RUNNER__?: {
    renderVariant(id: string): Promise<C3Capture>;
  };
  readonly __AURA3D_C3_ERROR__?: string;
}

/** C3 texture pipeline: disciplined color spaces render pixel-backed; the 8x sampler request lands on GPU sampler objects. */
test("texture pipeline C3 disciplined maps and sampler anisotropy reach the GPU", async ({ page }) => {
  test.setTimeout(300_000);
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/texture-pipeline-c3-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const harnessWindow = window as C3Window;
      return Boolean(harnessWindow.__AURA3D_C3_RUNNER__ || harnessWindow.__AURA3D_C3_ERROR__);
    }, undefined, { timeout: 90_000 });
    const harnessError = await page.evaluate(() => (window as C3Window).__AURA3D_C3_ERROR__);
    if (harnessError) throw new Error(harnessError);

    const render = (id: string): Promise<C3Capture> =>
      page.evaluate((variant) =>
        (window as C3Window).__AURA3D_C3_RUNNER__!.renderVariant(variant), id);

    const scalar = await render("scalar");
    expect(scalar.drawCalls).toBeGreaterThan(0);

    // Disciplined: all five slots bound through the sRGB + linear upload
    // paths, pixel-backed, real delta vs the scalar baseline.
    const disciplined = await render("disciplined");
    const subject = disciplined.texturedMaterials.find((entry) => entry.nodeName === "c3 subject box");
    expect(subject).toBeDefined();
    expect(subject!.status).toBe("textured");
    expect(subject!.pixelBacked).toBe(true);
    expect(subject!.slots).toEqual(expect.arrayContaining(["baseColor", "normal", "metallicRoughness", "occlusion", "emissive"]));
    const disciplinedDelta = pixelDelta(disciplined, scalar);
    expect(disciplinedDelta.changedFraction).toBeGreaterThan(0.02);
    await page.screenshot({ path: resolve("tests/reports/texture-pipeline-c3/c3-disciplined.png") });

    // Anisotropy control: the 8x request must land on GPU sampler objects
    // (upload telemetry), while the 1x request issues none. When the device
    // reports no anisotropy support both fold to zero uploads.
    const aniso1 = await render("aniso1");
    const anisoSubject = aniso1.texturedMaterials.find((entry) => entry.nodeName === "c3 subject box");
    expect(anisoSubject?.pixelBacked).toBe(true);
    expect(disciplined.maxTextureAnisotropy).toBeGreaterThanOrEqual(1);
    expect(aniso1.maxTextureAnisotropy).toBe(disciplined.maxTextureAnisotropy);
    if (disciplined.maxTextureAnisotropy > 1) {
      expect(disciplined.samplerAnisotropyUploads).toBeGreaterThanOrEqual(1);
      expect(aniso1.samplerAnisotropyUploads).toBe(0);
    } else {
      expect(disciplined.samplerAnisotropyUploads).toBe(0);
      expect(aniso1.samplerAnisotropyUploads).toBe(0);
    }
    await page.screenshot({ path: resolve("tests/reports/texture-pipeline-c3/c3-aniso1.png") });

    writeJson(REPORT, {
      generatedAt: new Date().toISOString(),
      scalar: { ...scalar, pixels: `[${scalar.pixels.length} channels]` },
      disciplined: { ...disciplined, pixels: `[${disciplined.pixels.length} channels]` },
      aniso1: { ...aniso1, pixels: `[${aniso1.pixels.length} channels]` },
      disciplinedDelta
    });
  } finally {
    await server.close();
  }
});

function pixelDelta(a: C3Capture, b: C3Capture): { changedFraction: number; meanAbsoluteDelta: number } {
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
