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
