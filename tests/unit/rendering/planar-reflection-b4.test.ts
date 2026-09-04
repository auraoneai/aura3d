import { describe, expect, it } from "vitest";
import {
  createPlanarProjectionMatrix,
  GlassRefractionCapture,
  PlanarReflectionCapture,
} from "../../../packages/rendering/src/PlanarReflection";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";

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

describe("B4 PlanarReflectionCapture renderer binding", () => {
  it("owns a mirror render target and binds the oblique clip projection", () => {
    const device = new MockRenderDevice();
    const capture = new PlanarReflectionCapture(device, 0, { resolution: 8 });
    const frame = capture.computeFrame(EYE, TARGET, UP, projection());
    expect(frame.planeY).toBe(0);
    expect(frame.mirror.eye).toEqual([0, -1.6, 4.2]);
    // Oblique splice changes the projection along the clip plane normal
    // (y for a horizontal plane): elements [6]/[10]/[14] differ.
    const base = Array.from(projection());
    const oblique = Array.from(frame.oblique.projectionMatrix);
    expect(oblique[6]).not.toBe(base[6]);
    expect(oblique[10]).not.toBe(base[10]);
    expect(oblique[14]).not.toBe(base[14]);
    expect(frame.viewProjectionMatrix).toHaveLength(16);
    capture.dispose();
  });

  it("re-renders the mirror target per capture and reports pixel deltas", () => {
    const device = new MockRenderDevice();
    const capture = new PlanarReflectionCapture(device, 0, { resolution: 8 });
    const first = capture.capture(
      (frame) => device.writeRenderTargetPixels(frame.renderTarget, solidPixels(8, 200, 20, 20)),
      EYE, TARGET, UP, projection()
    );
    expect(first.revision).toBe(1);
    expect(first.capturedPixelCount).toBe(64);
    expect(first.binding.name).toBe("u_planarReflectionTexture");
    expect(first.texture.width).toBe(8);
    const second = capture.capture(
      (frame) => device.writeRenderTargetPixels(frame.renderTarget, solidPixels(8, 20, 200, 20)),
      EYE, TARGET, UP, projection()
    );
    expect(second.revision).toBe(2);
    expect(second.pixelHash).not.toBe(first.pixelHash);
    expect(second.changedPixelCount).toBe(64);
    capture.dispose();
  });

  it("serves a reflector material only after a live capture exists", () => {
    const device = new MockRenderDevice();
    const capture = new PlanarReflectionCapture(device, 0, { resolution: 8 });
    expect(() => capture.createReflectorMaterial()).toThrow(/no capture yet/i);
    capture.capture(
      (frame) => device.writeRenderTargetPixels(frame.renderTarget, solidPixels(8, 10, 10, 10)),
      EYE, TARGET, UP, projection()
    );
    const material = capture.createReflectorMaterial();
    expect(material.name).toContain("reflector-material");
    capture.dispose();
  });

  it("rejects invalid mirror configuration", () => {
    const device = new MockRenderDevice();
    expect(() => new PlanarReflectionCapture(device, Number.NaN)).toThrow(RangeError);
    expect(() => new PlanarReflectionCapture(device, 0, { resolution: 0 })).toThrow(RangeError);
    const capture = new PlanarReflectionCapture(device, 0, { resolution: 8 });
    expect(() => capture.computeFrame(EYE, TARGET, UP, new Float32Array(15))).toThrow(RangeError);
    capture.dispose();
    expect(() => capture.computeFrame(EYE, TARGET, UP, projection())).toThrow(/disposed/i);
  });
});

describe("B4 GlassRefractionCapture renderer binding", () => {
  it("tints scene color by thickness and blurs by roughness", () => {
    const device = new MockRenderDevice();
    const capture = new GlassRefractionCapture(device, { resolution: 8 });
    const scene = solidPixels(8, 200, 200, 200);
    const thin = capture.capture(
      (target) => device.writeRenderTargetPixels(target, scene),
      { thickness: 0.5, roughness: 0 }
    );
    expect(thin.params.transmittance).toBeLessThan(1);
    expect(thin.binding.name).toBe("u_glassRefractionTexture");
    expect(thin.tintedPixelCount).toBe(64);
    // Roughness 0 means no blur: output is the pure Beer-Lambert scale.
    const expected = Math.round(200 * thin.params.transmittance);
    expect(thin.texture.data?.[0]).toBe(expected);
    // Roughness 1 blurs an edge pattern that the sharp fetch preserves.
    const edge = solidPixels(8, 0, 0, 0);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 4; x < 8; x += 1) {
        const offset = (y * 8 + x) * 4;
        edge[offset] = 255; edge[offset + 1] = 255; edge[offset + 2] = 255;
      }
    }
    const sharp = capture.capture((target) => device.writeRenderTargetPixels(target, edge), {
      thickness: 0.5, roughness: 0,
    });
    const blurred = capture.capture((target) => device.writeRenderTargetPixels(target, edge), {
      thickness: 0.5, roughness: 1,
    });
    expect(blurred.params.blurRadiusTexels).toBeGreaterThan(0);
    expect(sharp.params.blurRadiusTexels).toBe(0);
    expect(blurred.pixelHash).not.toBe(sharp.pixelHash);
    capture.dispose();
  });

  it("rejects invalid glass parameters", () => {
    const device = new MockRenderDevice();
    const capture = new GlassRefractionCapture(device, { resolution: 8 });
    expect(() =>
      capture.capture(() => undefined, { thickness: -1, roughness: 0 })
    ).toThrow(RangeError);
    expect(() =>
      capture.capture(() => undefined, { thickness: 1, roughness: 2 })
    ).toThrow(RangeError);
    capture.dispose();
  });
});
