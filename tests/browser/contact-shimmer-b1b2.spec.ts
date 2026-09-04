import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PART B1 shimmer stress + PART B2 contact pixel proofs (muse3jsparity-PRD).
 *
 * Unit-proven elsewhere: `computeShimmerScore` + `selectCascadeWithHysteresis`
 * (CascadeHysteresis), per-object contact telemetry + `resolveDepthAwareContactRadius`
 * (`tests/unit/rendering/contact-planar-instancing-b2b4d1.test.ts`, 6 tests).
 * This spec closes the open browser items:
 *
 *  (1) 60s moving-camera shimmer stress: a 60s @ 60fps = 3600-frame camera-depth
 *       path executed accelerated in-page through the SAME pure functions the
 *       renderer uses, plus a live moving-camera GPU render loop. Wall-clock is
 *       measured and reported; the 60s figure is simulated path time, not
 *       wall-clock (keeps runtime sane).
 *  (2) Caster-free negative control proving ~zero darkening (pixels + analytic).
 *  (3) Per-object contact frame-to-frame stability (maxFrameDelta bound).
 *  (4) Radius-hardens-with-distance browser probe delta.
 *
 * Wording stays bounded: this is a bounded receiver-contact approximation;
 * never "SSR" or "ray-traced". `shimmerScore` is deliberately NOT wired into
 * renderer diagnostics (no decorative fields); the score is computed from the
 * real selection math in-page and reported as test evidence.
 */
const reportDir = "tests/reports/contact-shimmer-b1b2";
const claimBoundary =
  "Bounded receiver-contact approximation (analytic capsule/plane occluders + " +
  "depth-aware radius + per-object telemetry) with hysteresis-stabilized cascade " +
  "selection; not SSR, not ray-traced, not a renderer contact-shadow pass.";

test.describe("contact shimmer B1 stress + B2 pixel proofs", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("B1: 60s moving-camera shimmer stress holds under the threshold", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/tests/browser/agent-api-visual-smoke-harness.html`, { waitUntil: "domcontentloaded" });
    const testStartedAt = Date.now();
    const stress = await page.evaluate(async () => {
      const rendering = await import("/packages/rendering/src/index.ts") as typeof import("../../packages/rendering/src");
      const wallStart = performance.now();
      const splits = [
        { index: 0, near: 0.1, far: 5 },
        { index: 1, near: 5, far: 15 },
        { index: 2, near: 15, far: 35 },
        { index: 3, near: 35, far: 80 },
      ] as const;
      // 60s @ 60fps simulated camera path. Phase A (0-30s) hovers +/-0.5 across
      // the cascade-1/2 boundary at 2Hz: raw selection flickers every crossing
      // while the 8%-span hysteresis band (0.8 world units) holds. Phase B
      // (30-60s) sweeps 2..38 twice, crossing every inner boundary.
      const FRAMES = 3600;
      const HALF = 1800;
      const depthAt = (frame: number): number =>
        frame < HALF
          ? 15 + 0.5 * Math.sin((2 * Math.PI * frame) / 30)
          : 20 + 18 * Math.sin((2 * Math.PI * (frame - HALF)) / HALF * 2);
      const runPath = (hysteresis: number | undefined) => {
        let previous: number | null = null;
        const samples: { cascadeIndex: number; depth: number }[] = [];
        for (let frame = 0; frame < FRAMES; frame += 1) {
          const depth = depthAt(frame);
          previous = rendering.selectCascadeWithHysteresis(
            hysteresis === undefined
              ? { depth, splits: splits as unknown as never, previousIndex: previous }
              : { depth, splits: splits as unknown as never, previousIndex: previous, hysteresis }
          );
          samples.push({ cascadeIndex: previous, depth });
        }
        return rendering.computeShimmerScore(samples, 80 - 0.1);
      };
      const withHysteresis = runPath(0.08);
      const raw = runPath(0);
      // Contact-gap retention: the innermost cascade keeps the tightest bias so
      // grounded receivers do not wash out; outer cascades relax with coverage.
      const bias = rendering.createCascadeBiasTable({ cascadeCount: 4 });
      const wallMs = performance.now() - wallStart;
      return {
        simulatedPathSeconds: 60,
        fps: 60,
        frames: FRAMES,
        withHysteresis,
        raw,
        bias: bias.map((entry) => ({ ...entry })),
        analyticWallMs: wallMs,
      };
    });
    const gpuLoop = await measureMovingCameraGpuLoop(page, 24);
    const contactGap = await measureSeatedCasterContactGap(page);
    const wallClockMs = Date.now() - testStartedAt;

    mkdirSync(resolve(reportDir), { recursive: true });
    writeFileSync(resolve(`${reportDir}/b1-stress.json`), `${JSON.stringify({
      schema: "a3d-contact-shimmer-b1b2/stress/1.0",
      generatedAt: new Date().toISOString(),
      claimBoundary,
      note: "60s is simulated camera-path time (3600 frames @ 60fps) executed accelerated in-page; wallClockMs is the measured test time.",
      stress,
      gpuLoop,
      contactGap,
      wallClockMs,
      errors,
    }, null, 2)}\n`);

    expect(errors).toEqual([]);
    // The path actually moved: depthJitter is the camera-energy witness.
    expect(stress.frames).toBe(3600);
    expect(stress.withHysteresis.frames).toBe(3600);
    expect(stress.withHysteresis.depthJitter).toBeGreaterThan(0.0005);
    // Shimmer holds under the threshold with hysteresis, ~10x better than raw.
    expect(stress.withHysteresis.score).toBeLessThan(0.02);
    expect(stress.withHysteresis.flipRate).toBeLessThan(stress.raw.flipRate);
    // Contact-gap retention: bias grows monotonically with cascade index so the
    // innermost cascade keeps the tightest contact.
    expect(stress.bias).toHaveLength(4);
    for (let index = 1; index < stress.bias.length; index += 1) {
      expect(stress.bias[index]!.baseBias).toBeGreaterThan(stress.bias[index - 1]!.baseBias);
    }
    expect(stress.bias[0]!.baseBias).toBeLessThanOrEqual(0.001);
    // Live GPU loop: every moving-camera frame rendered a real scene.
    expect(gpuLoop.renderedFrames).toBe(24);
    expect(gpuLoop.minNonBlackPixels).toBeGreaterThan(10_000);
    // Seated-caster contact gap retention vs threshold (pixels).
    expect(contactGap.darkenedReceiverPixels).toBeGreaterThan(200);
    expect(contactGap.contactGapPixels).toBeLessThanOrEqual(4);
  });

  test("B2: caster-free negative control shows ~zero darkening", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/tests/browser/agent-api-visual-smoke-harness.html`, { waitUntil: "domcontentloaded" });
    const control = await measureCasterFreeDarkening(page);
    const analytic = await page.evaluate(async () => {
      const rendering = await import("/packages/rendering/src/index.ts") as typeof import("../../packages/rendering/src");
      const sample = rendering.resolveContactDarkening(
        { objectId: "hero-boot", receiverPosition: [0, 0.05, 0], receiverNormal: [0, 1, 0] },
        []
      );
      return { contactDarkening: sample.contactDarkening, radius: sample.radius };
    });

    mkdirSync(resolve(reportDir), { recursive: true });
    writeFileSync(resolve(`${reportDir}/b2-negative-control.json`), `${JSON.stringify({
      schema: "a3d-contact-shimmer-b1b2/negative-control/1.0",
      generatedAt: new Date().toISOString(),
      claimBoundary,
      control,
      analytic,
      errors,
    }, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(control.comparedPixels).toBeGreaterThan(5_000);
    expect(control.meanDarkening).toBeLessThan(3);
    expect(analytic.contactDarkening).toBe(0);
  });

  test("B2: per-object contact telemetry is frame-stable within the bound", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/tests/browser/agent-api-visual-smoke-harness.html`, { waitUntil: "domcontentloaded" });
    const stability = await page.evaluate(async () => {
      const rendering = await import("/packages/rendering/src/index.ts") as typeof import("../../packages/rendering/src");
      const occluders = [
        { id: "leg", kind: "capsule", segmentA: [0, 0, 0] as const, segmentB: [0, 1, 0] as const, radius: 0.25 },
        { id: "ground", kind: "plane", planeNormal: [0, 1, 0] as const, planeOffset: 0 },
      ] as const;
      const solve = (id: string, x: number) =>
        rendering.resolveContactDarkening(
          { objectId: id, receiverPosition: [x, 0.05, 0], receiverNormal: [0, 1, 0] },
          occluders as unknown as never
        );
      // Identical frames: deterministic inputs must produce identical telemetry.
      const frame0 = rendering.createContactTelemetryFrame(0, [solve("boot-left", 0), solve("boot-right", 0.4)], null);
      const frame1 = rendering.createContactTelemetryFrame(1, [solve("boot-left", 0), solve("boot-right", 0.4)], frame0);
      // Sub-millimetre deterministic receiver drift over 120 frames (2s @ 60fps).
      let previous = frame1;
      let maxDriftDelta = 0;
      for (let frame = 2; frame < 122; frame += 1) {
        const dx = Math.sin(frame * 0.7) * 0.0008;
        const next = rendering.createContactTelemetryFrame(
          frame,
          [solve("boot-left", dx), solve("boot-right", 0.4 + dx)],
          previous
        );
        maxDriftDelta = Math.max(maxDriftDelta, next.maxFrameDelta);
        previous = next;
      }
      return {
        identicalMaxFrameDelta: frame1.maxFrameDelta,
        maxDriftDelta,
        driftedFrames: 120,
        darkeningLeft: frame0.samples[0]!.contactDarkening,
        darkeningRight: frame0.samples[1]!.contactDarkening,
      };
    });
    const determinism = await measureDoubleRenderDeterminism(page);

    mkdirSync(resolve(reportDir), { recursive: true });
    writeFileSync(resolve(`${reportDir}/b2-stability.json`), `${JSON.stringify({
      schema: "a3d-contact-shimmer-b1b2/stability/1.0",
      generatedAt: new Date().toISOString(),
      claimBoundary,
      maxFrameDeltaBound: 0.01,
      stability,
      determinism,
      errors,
    }, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(stability.identicalMaxFrameDelta).toBe(0);
    expect(stability.darkeningLeft).toBeGreaterThan(0);
    expect(stability.maxDriftDelta).toBeLessThanOrEqual(0.01);
    expect(determinism.differingBytes).toBe(0);
    expect(determinism.comparedBytes).toBeGreaterThan(100_000);
  });

  test("B2: contact radius hardens with caster distance", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/tests/browser/agent-api-visual-smoke-harness.html`, { waitUntil: "domcontentloaded" });
    const probe = await page.evaluate(async () => {
      const rendering = await import("/packages/rendering/src/index.ts") as typeof import("../../packages/rendering/src");
      const radiusNear = rendering.resolveDepthAwareContactRadius(0.5, 0.05, 2);
      const radiusMid = rendering.resolveDepthAwareContactRadius(0.5, 1.0, 2);
      const radiusFar = rendering.resolveDepthAwareContactRadius(0.5, 2.0, 2);
      const radiusClamped = rendering.resolveDepthAwareContactRadius(0.5, 100, 2);
      const occluder = [
        { id: "leg", kind: "capsule", segmentA: [0, 0, 0] as const, segmentB: [0, 1, 0] as const, radius: 0.25 },
      ] as const;
      const darkeningAt = (x: number) =>
        rendering.resolveContactDarkening(
          { objectId: "probe", receiverPosition: [x, 0.05, 0], receiverNormal: [0, 1, 0] },
          occluder as unknown as never
        ).contactDarkening;
      return {
        radiusNear,
        radiusMid,
        radiusFar,
        radiusClamped,
        nearFarDelta: radiusNear - radiusFar,
        darkening: [darkeningAt(0), darkeningAt(0.3), darkeningAt(0.6), darkeningAt(1.0), darkeningAt(5.0)],
      };
    });

    mkdirSync(resolve(reportDir), { recursive: true });
    writeFileSync(resolve(`${reportDir}/b2-radius-probe.json`), `${JSON.stringify({
      schema: "a3d-contact-shimmer-b1b2/radius-probe/1.0",
      generatedAt: new Date().toISOString(),
      claimBoundary,
      probe,
      errors,
    }, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(probe.radiusFar).toBeLessThan(probe.radiusNear);
    expect(probe.radiusMid).toBeLessThan(probe.radiusNear);
    expect(probe.radiusClamped).toBeCloseTo(0.175, 4);
    expect(probe.nearFarDelta).toBeGreaterThan(0.2);
    // Darkening falls monotonically to zero with caster distance.
    for (let index = 1; index < probe.darkening.length; index += 1) {
      expect(probe.darkening[index]!).toBeLessThanOrEqual(probe.darkening[index - 1]!);
    }
    expect(probe.darkening[0]!).toBeGreaterThan(0);
    expect(probe.darkening[probe.darkening.length - 1]!).toBe(0);
  });
});

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

interface GpuLoopResult {
  readonly renderedFrames: number;
  readonly minNonBlackPixels: number;
  readonly meanFrameMs: number;
  readonly maxFrameMs: number;
}

/** Live moving-camera GPU stress: N frames on one renderer, camera orbiting. */
async function measureMovingCameraGpuLoop(page: Page, frames: number): Promise<GpuLoopResult> {
  return page.evaluate(async (frameCount) => {
    const rendering = await import("/packages/rendering/src/index.ts") as typeof import("../../packages/rendering/src");
    const sceneModule = await import("/packages/scene/src/index.ts") as typeof import("../../packages/scene/src");
    const { Geometry, PBRMaterial, Renderer } = rendering;
    const width = 480;
    const height = 360;
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
      requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets"],
    });
    const floor = new PBRMaterial({
      name: "b1-stress-receiver",
      baseColor: [0.62, 0.64, 0.68, 1],
      metallic: 0,
      roughness: 0.82,
      environmentIntensity: 0.1,
    });
    const caster = new PBRMaterial({
      name: "b1-stress-caster",
      baseColor: [0.9, 0.08, 0.035, 1],
      metallic: 0,
      roughness: 0.55,
      environmentIntensity: 0.1,
    });
    const box = (scale: readonly number[], translate: readonly number[]): Float32Array => new Float32Array([
      scale[0]!, 0, 0, 0, 0, scale[1]!, 0, 0, 0, 0, scale[2]!, 0,
      translate[0]!, translate[1]!, translate[2]!, 1,
    ]);
    const light = new sceneModule.DirectionalLight("b1-stress-key");
    light.castsShadow = true;
    light.intensity = 3.1;
    let minNonBlackPixels = Number.POSITIVE_INFINITY;
    let totalMs = 0;
    let maxMs = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const angle = (frame / frameCount) * Math.PI * 2;
      const start = performance.now();
      renderer.render({
        renderItems: [
          {
            label: "b1-stress-receiver-plane",
            geometry: Geometry.litCube(1),
            material: floor,
            modelMatrix: box([6.4, 0.08, 5.2], [0, -0.6, 0]),
          },
          {
            label: "b1-stress-seated-caster",
            geometry: Geometry.litCube(1),
            material: caster,
            modelMatrix: box([0.75, 0.75, 0.75], [0, -0.185, 0]),
          },
        ],
        collectedLights: [{
          kind: "directional",
          color: [1, 0.97, 0.9],
          intensity: 3.1,
          position: [5.1, 3, 2.2],
          direction: [-0.86, -0.52, -0.34],
          range: 0,
          spotAngle: 0,
          penumbra: 0,
          castsShadow: true,
          layerMask: 0xffffffff,
          source: light,
        }],
        shadow: { size: 1024, bias: 0.0015, pcfSamples: 16, pcfRadius: 1.5, strength: 0.72, filter: "pcf" },
        camera: {
          position: [4.6 * Math.cos(angle * 0.5), 3.4, 5.4 * Math.sin(angle * 0.5) + 2],
          target: [0, -0.3, 0],
          fovDegrees: 45,
          near: 0.1,
          far: 80,
        },
      });
      const elapsed = performance.now() - start;
      totalMs += elapsed;
      maxMs = Math.max(maxMs, elapsed);
      const pixels = renderer.device.readPixels(0, 0, width, height);
      let nonBlack = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if ((pixels[index] ?? 0) + (pixels[index + 1] ?? 0) + (pixels[index + 2] ?? 0) > 30) nonBlack += 1;
      }
      minNonBlackPixels = Math.min(minNonBlackPixels, nonBlack);
    }
    renderer.dispose();
    canvas.remove();
    return {
      renderedFrames: frameCount,
      minNonBlackPixels,
      meanFrameMs: Number((totalMs / frameCount).toFixed(2)),
      maxFrameMs: Number(maxMs.toFixed(2)),
    };
  }, frames);
}

interface ContactGap {
  readonly contactGapPixels: number;
  readonly darkenedReceiverPixels: number;
  readonly casterPixels: number;
}

/** Seated red caster: gap between its silhouette and shadow-only darkening. */
async function measureSeatedCasterContactGap(page: Page): Promise<ContactGap> {
  return page.evaluate(async () => {
    const rendering = await import("/packages/rendering/src/index.ts") as typeof import("../../packages/rendering/src");
    const sceneModule = await import("/packages/scene/src/index.ts") as typeof import("../../packages/scene/src");
    const { Geometry, PBRMaterial, Renderer } = rendering;
    const width = 520;
    const height = 390;
    const box = (scale: readonly number[], translate: readonly number[]): Float32Array => new Float32Array([
      scale[0]!, 0, 0, 0, 0, scale[1]!, 0, 0, 0, 0, scale[2]!, 0,
      translate[0]!, translate[1]!, translate[2]!, 1,
    ]);
    const floor = new PBRMaterial({
      name: "b1-gap-receiver", baseColor: [0.62, 0.64, 0.68, 1], metallic: 0, roughness: 0.82, environmentIntensity: 0.1,
    });
    const caster = new PBRMaterial({
      name: "b1-gap-caster", baseColor: [0.9, 0.08, 0.035, 1], metallic: 0, roughness: 0.55, environmentIntensity: 0.1,
    });
    const renderFrame = async (castShadow: boolean): Promise<Uint8Array> => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.style.display = "none";
      document.body.append(canvas);
      const renderer = await Renderer.create({
        canvas, width, height, backend: "webgl2", preserveDrawingBuffer: true,
        clearColor: [0.03, 0.04, 0.06, 1],
        requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets"],
      });
      const light = new sceneModule.DirectionalLight("b1-gap-key");
      light.castsShadow = castShadow;
      light.intensity = 3.1;
      renderer.render({
        renderItems: [
          { label: "b1-gap-receiver-plane", geometry: Geometry.litCube(1), material: floor, modelMatrix: box([6.4, 0.08, 5.2], [0, -0.6, 0]) },
          { label: "b1-gap-seated-caster", geometry: Geometry.litCube(1), material: caster, modelMatrix: box([0.75, 0.75, 0.75], [0, -0.185, 0]) },
        ],
        collectedLights: [{
          kind: "directional", color: [1, 0.97, 0.9], intensity: 3.1,
          position: [5.1, 3, 2.2], direction: [-0.86, -0.52, -0.34],
          range: 0, spotAngle: 0, penumbra: 0, castsShadow: castShadow,
          layerMask: 0xffffffff, source: light,
        }],
        shadow: castShadow
          ? { size: 1024, bias: 0.0015, pcfSamples: 16, pcfRadius: 1.5, strength: 0.72, filter: "pcf" }
          : false,
        camera: { position: [4.6, 3.4, 5.4], target: [0, -0.3, 0], fovDegrees: 45, near: 0.1, far: 80 },
      });
      const pixels = renderer.device.readPixels(0, 0, width, height);
      renderer.dispose();
      canvas.remove();
      return pixels;
    };
    const lit = await renderFrame(false);
    const shadowed = await renderFrame(true);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let casterPixels = 0;
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const offset = pixel * 4;
      const r = lit[offset] ?? 0;
      const g = lit[offset + 1] ?? 0;
      const b = lit[offset + 2] ?? 0;
      if (r <= 70 || r <= g * 1.25 || r <= b * 1.25) continue;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      casterPixels += 1;
    }
    if (casterPixels === 0) throw new Error("Contact-gap probe could not locate the seated red caster");
    let contactGapPixels = Number.POSITIVE_INFINITY;
    let darkenedReceiverPixels = 0;
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const offset = pixel * 4;
      const litRgb = (lit[offset] ?? 0) + (lit[offset + 1] ?? 0) + (lit[offset + 2] ?? 0);
      const shadowedRgb = (shadowed[offset] ?? 0) + (shadowed[offset + 1] ?? 0) + (shadowed[offset + 2] ?? 0);
      if (litRgb <= 45 || shadowedRgb <= 45 || litRgb - shadowedRgb < 18) continue;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) continue;
      darkenedReceiverPixels += 1;
      const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
      const dy = y < minY ? minY - y : y > maxY ? y - maxY : 0;
      contactGapPixels = Math.min(contactGapPixels, Math.hypot(dx, dy));
    }
    return { contactGapPixels: Number(contactGapPixels.toFixed(3)), darkenedReceiverPixels, casterPixels };
  });
}

interface CasterFreeControl {
  readonly meanDarkening: number;
  readonly comparedPixels: number;
}

/** Receiver alone, shadows on vs off, fixed camera: any darkening is self-shadowing. */
async function measureCasterFreeDarkening(page: Page): Promise<CasterFreeControl> {
  return page.evaluate(async () => {
    const rendering = await import("/packages/rendering/src/index.ts") as typeof import("../../packages/rendering/src");
    const sceneModule = await import("/packages/scene/src/index.ts") as typeof import("../../packages/scene/src");
    const { Geometry, PBRMaterial, Renderer } = rendering;
    const width = 520;
    const height = 390;
    const floor = new PBRMaterial({
      name: "b2-negative-receiver", baseColor: [0.62, 0.64, 0.68, 1], metallic: 0, roughness: 0.82, environmentIntensity: 0.1,
    });
    const renderFrame = async (castShadow: boolean): Promise<Uint8Array> => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.style.display = "none";
      document.body.append(canvas);
      const renderer = await Renderer.create({
        canvas, width, height, backend: "webgl2", preserveDrawingBuffer: true,
        clearColor: [0.03, 0.04, 0.06, 1],
        requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets"],
      });
      const light = new sceneModule.DirectionalLight("b2-negative-key");
      light.castsShadow = castShadow;
      light.intensity = 3.1;
      renderer.render({
        renderItems: [{
          label: "b2-negative-receiver-plane",
          geometry: Geometry.litCube(1),
          material: floor,
          modelMatrix: new Float32Array([6.4, 0, 0, 0, 0, 0.08, 0, 0, 0, 0, 5.2, 0, 0, -0.6, 0, 1]),
        }],
        collectedLights: [{
          kind: "directional", color: [1, 0.97, 0.9], intensity: 3.1,
          position: [5.1, 3, 2.2], direction: [-0.86, -0.52, -0.34],
          range: 0, spotAngle: 0, penumbra: 0, castsShadow: castShadow,
          layerMask: 0xffffffff, source: light,
        }],
        shadow: castShadow ? { size: 1024, pcfSamples: 16, pcfRadius: 1.5, strength: 0.72, filter: "pcf" } : false,
        camera: { position: [4.6, 3.4, 5.4], target: [0, -0.3, 0], fovDegrees: 45, near: 0.1, far: 80 },
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
    };
  });
}

interface DeterminismResult {
  readonly differingBytes: number;
  readonly comparedBytes: number;
}

/** Same scene rendered twice must be byte-identical (pixel-level stability). */
async function measureDoubleRenderDeterminism(page: Page): Promise<DeterminismResult> {
  return page.evaluate(async () => {
    const rendering = await import("/packages/rendering/src/index.ts") as typeof import("../../packages/rendering/src");
    const sceneModule = await import("/packages/scene/src/index.ts") as typeof import("../../packages/scene/src");
    const { Geometry, PBRMaterial, Renderer } = rendering;
    const width = 480;
    const height = 360;
    const renderOnce = async (): Promise<Uint8Array> => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.style.display = "none";
      document.body.append(canvas);
      const renderer = await Renderer.create({
        canvas, width, height, backend: "webgl2", preserveDrawingBuffer: true,
        clearColor: [0.03, 0.04, 0.06, 1],
        requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets"],
      });
      const floor = new PBRMaterial({
        name: "b2-stable-receiver", baseColor: [0.62, 0.64, 0.68, 1], metallic: 0, roughness: 0.82, environmentIntensity: 0.1,
      });
      const light = new sceneModule.DirectionalLight("b2-stable-key");
      light.castsShadow = true;
      light.intensity = 3.1;
      renderer.render({
        renderItems: [{
          label: "b2-stable-receiver-plane",
          geometry: Geometry.litCube(1),
          material: floor,
          modelMatrix: new Float32Array([6.4, 0, 0, 0, 0, 0.08, 0, 0, 0, 0, 5.2, 0, 0, -0.6, 0, 1]),
        }],
        collectedLights: [{
          kind: "directional", color: [1, 0.97, 0.9], intensity: 3.1,
          position: [5.1, 3, 2.2], direction: [-0.86, -0.52, -0.34],
          range: 0, spotAngle: 0, penumbra: 0, castsShadow: true,
          layerMask: 0xffffffff, source: light,
        }],
        shadow: { size: 1024, pcfSamples: 16, pcfRadius: 1.5, strength: 0.72, filter: "pcf" },
        camera: { position: [4.6, 3.4, 5.4], target: [0, -0.3, 0], fovDegrees: 45, near: 0.1, far: 80 },
      });
      const pixels = renderer.device.readPixels(0, 0, width, height);
      renderer.dispose();
      canvas.remove();
      return pixels;
    };
    const first = await renderOnce();
    const second = await renderOnce();
    let differingBytes = 0;
    for (let index = 0; index < first.length; index += 1) {
      if (first[index] !== second[index]) differingBytes += 1;
    }
    return { differingBytes, comparedBytes: first.length };
  });
}
