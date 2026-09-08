import { describe, expect, it } from "vitest";
import { WaterReflectionRefractionCapture } from "../../../packages/rendering/src/OceanSurface";
import {
  createPlanarProjectionMatrix,
  GlassRefractionCapture,
  PlanarReflectionCapture,
} from "../../../packages/rendering/src/PlanarReflection";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { createReflectionSurface } from "../../../packages/rendering/src/ReflectionSurfaces";

const EYE: readonly [number, number, number] = [0, 1.6, 4.2];
const TARGET: readonly [number, number, number] = [0, 0.4, 0];
const UP: readonly [number, number, number] = [0, 1, 0];

function projection(): Float32Array {
  return createPlanarProjectionMatrix(Math.PI / 3, 1, 0.05, 20);
}

function solidPixels(resolution: number, r: number, g: number, b: number): Uint8Array {
  const pixels = new Uint8Array(resolution * resolution * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
    pixels[offset + 3] = 255;
  }
  return pixels;
}

describe("B4 water reflection + depth-tinted refraction binding", () => {
  it("composites planar reflection with depth-tinted refraction", () => {
    const device = new MockRenderDevice();
    const capture = new WaterReflectionRefractionCapture(device, {
      resolution: 8, planeY: 0, depth: 2,
    });
    const result = capture.capture(
      (frame) => device.writeRenderTargetPixels(frame.reflectionTarget, solidPixels(8, 200, 40, 40)),
      (target) => device.writeRenderTargetPixels(target, solidPixels(8, 40, 40, 200)),
      EYE, TARGET, UP, projection()
    );
    expect(result.revision).toBe(1);
    expect(result.binding.name).toBe("u_waterReflectionRefractionTexture");
    expect(result.params.reflectionStrength).toBeGreaterThan(0.5);
    // Composite differs from raw refraction: reflection + depth tint are mixed in.
    expect(result.blendedPixelCount).toBe(64);
    const moved = capture.capture(
      (frame) => device.writeRenderTargetPixels(frame.reflectionTarget, solidPixels(8, 40, 200, 40)),
      (target) => device.writeRenderTargetPixels(target, solidPixels(8, 40, 40, 200)),
      EYE, TARGET, UP, projection()
    );
    expect(moved.revision).toBe(2);
    expect(moved.pixelHash).not.toBe(result.pixelHash);
    expect(moved.changedPixelCount).toBe(64);
    const material = capture.createWaterMaterial();
    expect(material.name).toContain("water-material");
    capture.dispose();
  });

  it("shallows favor refraction and deeps favor reflection", () => {
    const device = new MockRenderDevice();
    const shallow = new WaterReflectionRefractionCapture(device, { resolution: 4, depth: 0.1 });
    const deep = new WaterReflectionRefractionCapture(device, { resolution: 4, depth: 8 });
    const run = (capture: WaterReflectionRefractionCapture) =>
      capture.capture(
        (frame) => device.writeRenderTargetPixels(frame.reflectionTarget, solidPixels(4, 200, 40, 40)),
        (target) => device.writeRenderTargetPixels(target, solidPixels(4, 40, 40, 200)),
        EYE, TARGET, UP, projection()
      );
    const shallowResult = run(shallow);
    const deepResult = run(deep);
    expect(shallowResult.params.refractionStrength).toBeGreaterThan(deepResult.params.refractionStrength);
    expect(deepResult.params.reflectionStrength).toBeGreaterThan(shallowResult.params.reflectionStrength);
    shallow.dispose();
    deep.dispose();
  });
});

describe("B4 reflection surface status promotion", () => {
  function mirrorBinding() {
    const device = new MockRenderDevice();
    const capture = new PlanarReflectionCapture(device, 0, { resolution: 8 });
    const result = capture.capture(
      (frame) => device.writeRenderTargetPixels(frame.renderTarget, solidPixels(8, 200, 20, 20)),
      EYE, TARGET, UP, projection()
    );
    return { device, capture, result };
  }

  function glassBinding() {
    const device = new MockRenderDevice();
    const capture = new GlassRefractionCapture(device, { resolution: 8 });
    const result = capture.capture(
      (target) => device.writeRenderTargetPixels(target, solidPixels(8, 200, 200, 200)),
      { thickness: 2, roughness: 0.5 }
    );
    return { device, capture, result };
  }

  function waterBinding() {
    const device = new MockRenderDevice();
    const capture = new WaterReflectionRefractionCapture(device, { resolution: 8, planeY: 0 });
    const result = capture.capture(
      (frame) => device.writeRenderTargetPixels(frame.reflectionTarget, solidPixels(8, 200, 40, 40)),
      (target) => device.writeRenderTargetPixels(target, solidPixels(8, 40, 40, 200)),
      EYE, TARGET, UP, projection()
    );
    return { device, capture, result };
  }

  it("promotes planar-reflector and reflective-floor only with a mirror binding", () => {
    const unboundPlanar = createReflectionSurface({ id: "planar", kind: "planar-reflector" });
    expect(unboundPlanar.report.status).toBe("unsupported");
    const unboundFloor = createReflectionSurface({ id: "floor", kind: "reflective-floor" });
    expect(unboundFloor.report.status).toBe("helper");
    expect(unboundFloor.report.trueReflection).toBe(false);

    const { capture, result } = mirrorBinding();
    const planar = createReflectionSurface({ id: "planar", kind: "planar-reflector", mirror: result });
    expect(planar.report.status).toBe("implemented");
    expect(planar.report.trueReflection).toBe(true);
    expect(planar.report.unsupportedRequests).toEqual([]);
    expect(planar.mirror).toBe(result);
    expect(planar.item?.label).toContain("live mirror target");
    const floor = createReflectionSurface({ id: "floor", kind: "reflective-floor", mirror: result });
    expect(floor.report.status).toBe("implemented");
    expect(floor.report.trueReflection).toBe(true);
    expect(floor.item?.label).toContain("live mirror target");
    capture.dispose();
  });

  it("promotes glass and water only with their bindings and keeps SSR unsupported", () => {
    expect(createReflectionSurface({ id: "glass", kind: "refractor-glass" }).report.status).toBe("unsupported");
    expect(createReflectionSurface({ id: "water", kind: "water-refraction" }).report.status).toBe("unsupported");
    expect(createReflectionSurface({ id: "ssr", kind: "screen-space-reflection" }).report.status).toBe("unsupported");

    const glass = glassBinding();
    const glassSurface = createReflectionSurface({ id: "glass", kind: "refractor-glass", glass: glass.result });
    expect(glassSurface.report.status).toBe("implemented");
    expect(glassSurface.report.trueReflection).toBe(true);
    expect(glassSurface.glass).toBe(glass.result);
    glass.capture.dispose();

    const water = waterBinding();
    const waterSurface = createReflectionSurface({ id: "water", kind: "water-refraction", water: water.result });
    expect(waterSurface.report.status).toBe("implemented");
    expect(waterSurface.report.trueReflection).toBe(true);
    expect(waterSurface.water).toBe(water.result);
    water.capture.dispose();

    // No binding exists that can promote SSR: it stays unsupported by design.
    expect(createReflectionSurface({ id: "ssr", kind: "screen-space-reflection" }).report.trueReflection).toBe(false);
  });

  it("rejects a mirror binding on the wrong plane", () => {
    const { capture, result } = mirrorBinding();
    expect(() => createReflectionSurface({ id: "floor", kind: "reflective-floor", y: 2, mirror: result })).toThrow(
      /does not match the bound capture plane/
    );
    capture.dispose();
  });
});

import { ScreenSpaceReflectionPass, invertSsrProjection } from "../../../packages/rendering/src/ScreenSpaceReflectionPass";

describe("B4 native SSR resource ownership", () => {
  it("rejects a mock backend instead of promoting a descriptor to pixel-backed", () => {
    const device = new MockRenderDevice();
    const pass = new ScreenSpaceReflectionPass(device, { width: 8, height: 8 });
    const scene = device.createRenderTarget({ width: 8, height: 8, depth: "texture" });
    const normalMask = device.createRenderTarget({ width: 8, height: 8 });
    expect(() => pass.execute({ scene, normalMask, projection: projection(), frame: 1 })).toThrow(/native renderer/);
    expect(pass.result).toBeUndefined();
    expect(createReflectionSurface({ id: "ssr", kind: "screen-space-reflection", ssr: pass }).report.trueReflection).toBe(false);
    pass.dispose();
  });

  it("inverts the actual projection and rejects singular camera input", () => {
    const matrix = projection(), inverse = invertSsrProjection(matrix);
    for (let r = 0; r < 4; ++r) for (let c = 0; c < 4; ++c) {
      let value = 0;
      for (let k = 0; k < 4; ++k) value += matrix[k * 4 + r]! * inverse[c * 4 + k]!;
      expect(value).toBeCloseTo(Number(r === c), 5);
    }
    expect(() => invertSsrProjection(new Float32Array(16))).toThrow(/singular/);
  });
});

import { Renderer } from "../../../packages/rendering/src/Renderer";
import { bindRendererSsrProjection } from "../../../packages/rendering/src/RendererPostprocessPlan";

describe("native SSR uses the actual frame camera", () => {
  for (const asynchronous of [false, true]) it(`forwards the non-90-degree projection on ${asynchronous ? "async" : "sync"} frames`, async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    (renderer.device.info.capabilities as string[]).push("depth-textures");
    const expected = createPlanarProjectionMatrix(Math.PI / 5, 1.6, 0.3, 80);
    const received: Float32Array[] = [];
    renderer.device.presentLdrPostprocess = (_source, options) => {
      const ssr = options.passes.find(pass => pass.name === "ssr");
      if (ssr) received.push(ssr.options["projection"] as Float32Array);
    };
    const source = { renderItems: [], postprocess: { targetFormat: "rgba8" as const, sampleCount: 1, toneMapping: false as const, ssr: { intensity: 0.4, maxDistance: 8 } } };
    if (asynchronous) await renderer.renderAsync(source, { viewProjectionMatrix: expected });
    else renderer.render(source, { viewProjectionMatrix: expected });
    expect(received).toHaveLength(1);
    expect(Array.from(received[0]!)).toEqual(Array.from(expected));
    renderer.dispose();
  });

  it("preserves exact orthographic matrices and leaves CPU reference execution unchanged", () => {
    const matrix = Float32Array.from([0.3, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, -0.02, 0, -0.4, 0.2, -1.01, 1]);
    const bound = bindRendererSsrProjection({ ssr: { intensity: 0.4 } }, matrix);
    expect(Array.from((bound.ssr as unknown as { projection: Float32Array }).projection)).toEqual(Array.from(matrix));
    const cpu = { execution: "cpu-deterministic" as const, ssr: { intensity: 0.4 } };
    expect(bindRendererSsrProjection(cpu, matrix)).toBe(cpu);
  });
});
