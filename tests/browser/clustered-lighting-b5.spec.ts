import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type B5RigPreset = "cinematic-night" | "arena-showdown" | "product-hero";

interface RootVariantCapture {
  readonly id: string;
  readonly backend: string;
  readonly drawCalls: number;
  readonly renderSize: readonly number[];
  readonly pixels: {
    readonly width: number;
    readonly height: number;
    readonly nonBlackPixels: number;
    readonly colorBuckets: number;
    readonly meanLuma: number;
    readonly hash: string;
  };
}

interface RootVariantComparison {
  readonly variantA: string;
  readonly variantB: string;
  readonly pixelDelta: number;
  readonly changedPixelFraction: number;
}

interface ClusterFallbackEvidence {
  readonly requestedLights: number;
  readonly indexedLights: number;
  readonly droppedLights: number;
  readonly overBudgetClusters: number;
  readonly peakRequested: number;
  readonly fallbackPolicy: string;
  readonly requestedPerCluster: readonly number[];
  readonly indexedPerCluster: readonly number[];
  readonly warnings: readonly string[];
  readonly keptLightNames: readonly string[];
  readonly keptMaxDistance: number;
}

interface RigMountEvidence {
  readonly preset: string;
  readonly lightCount: number;
  readonly kinds: readonly string[];
  readonly rectAreaCount: number;
  readonly spotCount: number;
  readonly shadowCastingCount: number;
  readonly softboxCount: number;
  readonly mountedRootBuilders: readonly string[];
}

interface RectPrimitiveEvidence {
  readonly status: "ready" | "error";
  readonly drawCalls?: Record<string, number>;
  readonly offToOnChangedPixels?: number;
  readonly offToOnPixelDelta?: number;
  readonly narrowToWideChangedPixels?: number;
  readonly narrowToWidePixelDelta?: number;
  readonly hashes?: Record<string, string>;
  readonly claimBoundary?: string;
  readonly error?: string;
}

interface B5Window extends Window {
  readonly __AURA3D_CLUSTER_B5_RUNNER__?: {
    readonly presets: readonly B5RigPreset[];
    clusterFallback(): ClusterFallbackEvidence;
    rigMountInfo(preset: B5RigPreset): RigMountEvidence;
    renderRootVariant(id: string): Promise<RootVariantCapture>;
    compareRootVariants(variantA: string, variantB: string): RootVariantComparison;
    rectPrimitiveProof(): Promise<RectPrimitiveEvidence>;
  };
  readonly __AURA3D_CLUSTER_B5_ERROR__?: string;
}

const reportDir = "tests/reports/clustered-lighting-b5";
const evidencePath = `${reportDir}/b5-evidence.json`;

const evidenceBase: Record<string, unknown> = {
  schema: "aura3d-b5-clustered-lighting/1.0",
  lanes: ["clustered-over-budget", "rig-presets", "rect-emitter"],
  noLtc: "Rect-area shading is two-point Gauss-Legendre quadrature over the finite emitter; no LTC lookup-table identity is claimed."
};

test.describe("B5 clustered lighting + rigs + rect emitter", () => {
  test.setTimeout(150_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(resolve(reportDir), { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  async function openHarness(page: Page): Promise<readonly string[]> {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/clustered-lighting-b5-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(() => {
      const b5 = window as B5Window;
      return Boolean(b5.__AURA3D_CLUSTER_B5_RUNNER__ || b5.__AURA3D_CLUSTER_B5_ERROR__);
    }, undefined, { timeout: 60_000 });
    const harnessError = await page.evaluate(() => (window as B5Window).__AURA3D_CLUSTER_B5_ERROR__);
    if (harnessError) throw new Error(`B5 harness failed: ${harnessError}`);
    expect(pageErrors, "harness page errors").toEqual([]);
    return pageErrors;
  }

  test("over-budget clusters warn and keep the nearest 64 lights", async ({ page }) => {
    const pageErrors = await openHarness(page);
    const fallback = await page.evaluate(() =>
      (window as B5Window).__AURA3D_CLUSTER_B5_RUNNER__!.clusterFallback()
    );

    expect(fallback.requestedLights).toBe(70);
    expect(fallback.indexedLights).toBe(64);
    expect(fallback.droppedLights).toBe(6);
    expect(fallback.overBudgetClusters).toBe(1);
    expect(fallback.peakRequested).toBe(70);
    expect(fallback.fallbackPolicy).toBe("nearest-observer");
    expect(fallback.requestedPerCluster).toEqual([70]);
    expect(fallback.indexedPerCluster).toEqual([64]);
    expect(fallback.warnings).toHaveLength(1);
    expect(fallback.warnings[0]).toMatch(/light budget exceeded/);
    expect(fallback.warnings[0]).toMatch(/nearest 64/);
    // Nearest-N: the 6 farthest emitters (x = 64..69) are dropped.
    expect(fallback.keptLightNames).toHaveLength(64);
    expect(fallback.keptMaxDistance).toBe(63);
    expect(fallback.keptLightNames).not.toContain("b5-browser-point-69");
    writeEvidence("clusterFallback", { fallback, pageErrors });
  });

  test("64-light root scene renders", async ({ page }) => {
    const pageErrors = await openHarness(page);
    const capture = await page.evaluate(() =>
      (window as B5Window).__AURA3D_CLUSTER_B5_RUNNER__!.renderRootVariant("city64")
    );
    await page.locator("#b5-stage canvas").screenshot({ path: `${reportDir}/city64.png` });

    expect(capture.backend.length).toBeGreaterThan(0);
    expect(capture.drawCalls).toBeGreaterThan(0);
    expect(capture.pixels.nonBlackPixels).toBeGreaterThan(1000);
    expect(capture.pixels.colorBuckets).toBeGreaterThan(4);
    writeEvidence("city64", { capture, pageErrors });
  });

  const rigs: readonly B5RigPreset[] = ["cinematic-night", "arena-showdown", "product-hero"];

  for (const preset of rigs) {
    test(`rig preset ${preset} mounts from root with one call and changes pixels`, async ({ page }) => {
      const pageErrors = await openHarness(page);
      const mount = await page.evaluate((name: B5RigPreset) =>
        (window as B5Window).__AURA3D_CLUSTER_B5_RUNNER__!.rigMountInfo(name), preset);
      const variantId = `rig-${preset}`;
      const capture = await page.evaluate((id: string) =>
        (window as B5Window).__AURA3D_CLUSTER_B5_RUNNER__!.renderRootVariant(id), variantId);
      // Screenshot the rig scene itself, before the baseline swap below.
      await page.locator("#b5-stage canvas").screenshot({ path: `${reportDir}/${variantId}.png` });
      const baseline = await page.evaluate(() =>
        (window as B5Window).__AURA3D_CLUSTER_B5_RUNNER__!.renderRootVariant("rig-baseline"));
      const comparison = await page.evaluate(([variant, base]: readonly string[]) =>
        (window as B5Window).__AURA3D_CLUSTER_B5_RUNNER__!.compareRootVariants(variant, base),
        [variantId, "rig-baseline"] as const);

      expect(mount.preset).toBe(preset);
      expect(mount.lightCount).toBeGreaterThanOrEqual(4);
      expect(mount.kinds).toContain("rect-area");
      expect(mount.kinds).toContain("spot");
      expect(mount.mountedRootBuilders).toContain("lights.rect");
      expect(capture.drawCalls).toBeGreaterThan(0);
      expect(capture.pixels.nonBlackPixels).toBeGreaterThan(1000);
      expect(capture.pixels.hash).not.toBe(baseline.pixels.hash);
      expect(comparison.changedPixelFraction).toBeGreaterThan(0.01);
      writeEvidence(preset, { mount, capture, baseline: baseline.pixels.hash, comparison, pageErrors });
    });
  }

  test("root rect mount responds with a visible delta", async ({ page }) => {
    const pageErrors = await openHarness(page);
    const on = await page.evaluate(() =>
      (window as B5Window).__AURA3D_CLUSTER_B5_RUNNER__!.renderRootVariant("rect-on"));
    // Screenshot the rect-on scene itself, before the rect-off swap below.
    await page.locator("#b5-stage canvas").screenshot({ path: `${reportDir}/rect-on.png` });
    const off = await page.evaluate(() =>
      (window as B5Window).__AURA3D_CLUSTER_B5_RUNNER__!.renderRootVariant("rect-off"));
    const onOff = await page.evaluate(() =>
      (window as B5Window).__AURA3D_CLUSTER_B5_RUNNER__!.compareRootVariants("rect-on", "rect-off"));

    // Root rect nodes mount as bounded spot proxies (the proxy keeps position
    // and aim but not emitter size, so no narrow/wide pair is asserted here);
    // the delta proves the mount path responds. The true finite-emitter lobe
    // with size response is proven separately on primitives below with
    // no-LTC wording intact.
    expect(on.pixels.hash).not.toBe(off.pixels.hash);
    expect(onOff.pixelDelta).toBeGreaterThan(0.5);
    expect(onOff.changedPixelFraction).toBeGreaterThan(0.01);
    writeEvidence("rectRoot", { on, off, onOff, pageErrors });
  });

  test("rect-area specular lobe responds on primitives with a size delta", async ({ page }) => {
    const pageErrors = await openHarness(page);
    const proof = await page.evaluate(() =>
      (window as B5Window).__AURA3D_CLUSTER_B5_RUNNER__!.rectPrimitiveProof()
    );
    if (proof.status !== "ready") throw new Error(`Rect primitive proof failed: ${proof.error}`);
    for (const variant of ["off", "on", "narrow", "wide"] as const) {
      await page.locator(`#rect-${variant}`).screenshot({ path: `${reportDir}/rect-${variant}.png` });
    }

    expect(proof.drawCalls?.["on"]).toBe(1);
    expect(proof.hashes?.["on"]).not.toBe(proof.hashes?.["off"]);
    expect(proof.offToOnChangedPixels ?? 0).toBeGreaterThan(500);
    expect(proof.offToOnPixelDelta ?? 0).toBeGreaterThan(0.5);
    expect(proof.hashes?.["narrow"]).not.toBe(proof.hashes?.["wide"]);
    expect(proof.narrowToWideChangedPixels ?? 0).toBeGreaterThan(200);
    expect(proof.claimBoundary).toMatch(/no LTC/);
    writeEvidence("rectPrimitive", { ...proof, pageErrors });
  });
});

function writeEvidence(section: string, value: unknown): void {
  // Read-modify-write: each test records its own section so evidence survives
  // regardless of how the runner schedules tests in the file.
  const path = resolve(evidencePath);
  const current = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
    : { ...evidenceBase };
  current[section] = value;
  current["generatedAt"] = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`);
}
