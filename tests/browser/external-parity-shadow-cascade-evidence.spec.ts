import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Cascaded / PCF directional-shadow browser evidence for FS-501.
 *
 * The shadow-map readiness audit reads three evidence rows —
 * `directional-shadow-map-feature`, `cascaded-shadow-map-browser-evidence`, and
 * `pcf-soft-shadow-browser-evidence` — from a validation whose original producer drove the
 * deleted `examples/_quarantine/shadow-lab` route. Those rows could therefore not be earned
 * by any renderer work. This spec republishes them from a mounted route that exists.
 *
 * The route measures, rather than declares, each claim: the shadow feature from a
 * lit-versus-shadowed per-pixel footprint on the receiver, cascades from the pipeline's own
 * monotonic split partition, and PCF softness from penumbra luminance steps across the
 * shadow edge.
 *
 * This spec additionally carries a negative control that the route cannot carry itself: a
 * shadow-enabled frame with *no caster at all*. That control is what exposed the PCF
 * shadow-acne defect fixed in `ShaderLibrary.ts`, where a receiver darkened by mean RGB-sum
 * 15.3 with nothing above it. Without the control, that self-shadowing was
 * indistinguishable from a real shadow in the aggregate numbers.
 */
const reportPath = "tests/reports/external-parity-shadow-cascade-browser.json";
const screenshotPath = "tests/reports/external-gallery/postprocess/shadow-cascade-evidence.png";

test.describe("ExternalParity cascaded PCF shadow browser evidence", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("proves a directional cascaded PCF shadow map from measured receiver pixels", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/apps/shadow-cascade-evidence/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Boolean((window as unknown as Record<string, unknown>).__AURA3D_SHADOW_CASCADE_EVIDENCE__),
      undefined,
      { timeout: 120_000 }
    );

    const evidence = await page.evaluate(
      () => (window as unknown as Record<string, ShadowCascadeEvidence>).__AURA3D_SHADOW_CASCADE_EVIDENCE__
    );

    // Negative control: same lighting and same receiver, shadows enabled, caster removed.
    // Any darkening here is the receiver shadowing itself, not a rendered occluder.
    const acneControl = await measureCasterFreeAcne(page);

    mkdirSync(dirname(resolve(screenshotPath)), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });

    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      schema: "a3d-external-parity-shadow-cascade-browser/1.0",
      generatedAt: new Date().toISOString(),
      route: "apps/shadow-cascade-evidence",
      screenshot: screenshotPath,
      claimBoundary: evidence?.claimBoundary,
      republishedEvidenceRows: [
        "directional-shadow-map-feature",
        "cascaded-shadow-map-browser-evidence",
        "pcf-soft-shadow-browser-evidence",
        "lit-vs-shadowed-pixel-readback"
      ],
      status: evidence?.status,
      checks: evidence?.checks,
      metrics: evidence?.metrics,
      acneControl,
      errors
    }, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(evidence?.status).toBe("ready");

    const metrics = evidence!.metrics;
    const checks = evidence!.checks;

    // A real projected shadow is deep where it lands and covers a non-trivial share of the
    // receiver. Requiring both rules out a faint global shift and a single-pixel artifact.
    expect(metrics.shadowDeltaRgb).toBeGreaterThan(30);
    expect(metrics.shadowFootprintFraction).toBeGreaterThan(0.02);
    expect(metrics.shadowFootprintPixels).toBeGreaterThan(500);
    expect(checks.shadowFeature).toBe(true);
    expect(checks.projectedShadowDarker).toBe(true);

    // Cascades must be a real partition, not a count.
    expect(metrics.cascadeCount).toBeGreaterThanOrEqual(3);
    expect(checks.cascadesRendered).toBe(true);
    for (const [index, cascade] of metrics.cascadeSplits.entries()) {
      expect(cascade.far).toBeGreaterThan(cascade.near);
      if (index > 0) expect(cascade.near).toBeGreaterThanOrEqual(metrics.cascadeSplits[index - 1]!.near);
    }

    // PCF softness: an unfiltered comparison yields ~2 luminance levels across the edge.
    expect(metrics.pcfSamples).toBeGreaterThanOrEqual(9);
    expect(metrics.penumbraSteps).toBeGreaterThanOrEqual(4);
    expect(checks.pcfPenumbra).toBe(true);

    // The shadow must be a localized footprint rather than a whole-receiver wash. Before the
    // slope-bias fix the footprint mean (16.3) and the whole-region mean (15.9) were nearly
    // identical, which is exactly the signature of acne rather than a projected shadow.
    expect(metrics.shadowDeltaRgb).toBeGreaterThan(metrics.receiverRegionDeltaRgb * 5);

    // Acne control. The pre-fix renderer measured 15.31 here.
    expect(acneControl.meanDarkening).toBeLessThan(3);
    expect(acneControl.comparedPixels).toBeGreaterThan(5_000);
  });
});

interface ShadowCascadeEvidence {
  readonly status: "ready" | "error";
  readonly checks: {
    readonly shadowFeature: boolean;
    readonly cascadesRendered: boolean;
    readonly pcfPenumbra: boolean;
    readonly projectedShadowDarker: boolean;
  };
  readonly metrics: {
    readonly cascadeCount: number;
    readonly pcfSamples: number;
    readonly shadowDeltaRgb: number;
    readonly receiverRegionDeltaRgb: number;
    readonly shadowFootprintFraction: number;
    readonly shadowFootprintPixels: number;
    readonly receiverPixels: number;
    readonly penumbraSteps: number;
    readonly cascadeSplits: readonly { readonly index: number; readonly near: number; readonly far: number; readonly mapSize: number }[];
    readonly drawCalls: number;
  };
  readonly claimBoundary: string;
}

interface AcneControl {
  readonly meanDarkening: number;
  readonly comparedPixels: number;
  readonly description: string;
}

/**
 * Renders the receiver plane alone, twice, with shadows off and on, under a fixed camera so
 * the two frames are pixel-comparable. With no occluder present a correct renderer produces
 * an essentially identical frame.
 */
async function measureCasterFreeAcne(page: Page): Promise<AcneControl> {
  return page.evaluate(async () => {
    const rendering = await import("/packages/rendering/src/index.ts") as typeof import("../../packages/rendering/src");
    const sceneModule = await import("/packages/scene/src/index.ts") as typeof import("../../packages/scene/src");
    const { Geometry, PBRMaterial, Renderer } = rendering;
    const width = 520;
    const height = 390;

    const floor = new PBRMaterial({
      name: "acne-control-receiver",
      baseColor: [0.62, 0.64, 0.68, 1],
      metallic: 0,
      roughness: 0.82,
      environmentIntensity: 0.1
    });

    const scaleTranslate = (scale: readonly number[], translate: readonly number[]): Float32Array => new Float32Array([
      scale[0]!, 0, 0, 0,
      0, scale[1]!, 0, 0,
      0, 0, scale[2]!, 0,
      translate[0]!, translate[1]!, translate[2]!, 1
    ]);

    const renderFrame = async (castShadow: boolean): Promise<Uint8Array> => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.style.display = "none";
      document.body.append(canvas);
      const renderer = await Renderer.create({
        canvas,
        width,
        height,
        backend: "webgl2",
        preserveDrawingBuffer: true,
        clearColor: [0.03, 0.04, 0.06, 1],
        requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets"]
      });
      const light = new sceneModule.DirectionalLight("acne-control-key");
      light.castsShadow = castShadow;
      light.intensity = 3.1;
      renderer.render({
        renderItems: [{
          label: "acne-control-receiver-plane",
          geometry: Geometry.litCube(1),
          material: floor,
          modelMatrix: scaleTranslate([6.4, 0.08, 5.2], [0, -0.6, 0])
        }],
        collectedLights: [{
          kind: "directional",
          color: [1, 0.97, 0.9],
          intensity: 3.1,
          position: [5.1, 3, 2.2],
          direction: [-0.86, -0.52, -0.34],
          range: 0,
          spotAngle: 0,
          penumbra: 0,
          castsShadow: castShadow,
          layerMask: 0xffffffff,
          source: light
        }],
        shadow: castShadow ? { size: 1024, pcfSamples: 16, pcfRadius: 1.5, strength: 0.72, filter: "pcf" } : false,
        // A fixed camera, because auto-framing a different item set would move the camera
        // and make the two frames incomparable.
        camera: { position: [4.6, 3.4, 5.4], target: [0, -0.3, 0], fovDegrees: 45, near: 0.1, far: 80 }
      });
      const pixels = renderer.device.readPixels(0, 0, width, height);
      renderer.dispose();
      canvas.remove();
      return pixels;
    };

    const withoutShadow = await renderFrame(false);
    const withShadow = await renderFrame(true);

    let darkeningSum = 0;
    let comparedPixels = 0;
    for (let index = 0; index < withoutShadow.length; index += 4) {
      const litRgb = (withoutShadow[index] ?? 0) + (withoutShadow[index + 1] ?? 0) + (withoutShadow[index + 2] ?? 0);
      const shadowedRgb = (withShadow[index] ?? 0) + (withShadow[index + 1] ?? 0) + (withShadow[index + 2] ?? 0);
      if (litRgb <= 45 || shadowedRgb <= 45) continue;
      comparedPixels += 1;
      darkeningSum += litRgb - shadowedRgb;
    }

    return {
      meanDarkening: Number((darkeningSum / Math.max(1, comparedPixels)).toFixed(3)),
      comparedPixels,
      description: "Receiver plane only, no caster, shadows enabled versus disabled under a fixed camera. Any darkening is receiver self-shadowing (acne)."
    };
  });
}

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}
