import { describe, expect, it } from "vitest";
import {
  createAnaglyphCompositePlan,
  createAnaglyphPixelComposite,
  createParallaxBarrierInterleavePlan,
  createParallaxBarrierPixelComposite,
  createStereoEffectPlan
} from "../../../packages/rendering/src";

describe("StereoEffects", () => {
  it("creates a side-by-side stereo effect plan with public diagnostics", () => {
    const plan = createStereoEffectPlan({
      mode: "side-by-side",
      width: 1440,
      height: 720,
      eyeSeparation: 0.064,
      convergenceDistance: 4,
      parallaxStrength: 0.5
    });

    expect(plan.composition).toBe("dual-canvas");
    expect(plan.layout).toBe("side-by-side");
    expect(plan.eyeCount).toBe(2);
    expect(plan.parallaxSignal).toBeCloseTo(0.008);
  });

  it("describes anaglyph channel composition without route-local constants", () => {
    const plan = createStereoEffectPlan({
      mode: "anaglyph",
      width: 720,
      height: 720,
      eyeSeparation: 0.12,
      convergenceDistance: 5
    });

    expect(plan.composition).toBe("channel-composite");
    expect(plan.anaglyph).toEqual(createAnaglyphCompositePlan());
    expect(plan.anaglyph?.leftChannel).toBe("red");
    expect(plan.anaglyph?.rightChannels).toEqual(["green", "blue"]);
  });

  it("composites anaglyph pixels through package rendering code", () => {
    const leftPixels = new Uint8Array([
      200, 20, 10, 255, 80, 5, 5, 180,
      40, 10, 5, 255, 160, 30, 20, 255
    ]);
    const rightPixels = new Uint8Array([
      0, 100, 140, 255, 0, 60, 220, 255,
      0, 24, 96, 200, 0, 120, 180, 255
    ]);

    const composite = createAnaglyphPixelComposite({ width: 2, height: 2, leftPixels, rightPixels });

    expect(composite.composition).toBe("renderer-owned-anaglyph-pixels");
    expect(composite.leftChannel).toBe("red");
    expect(composite.rightChannels).toEqual(["green", "blue"]);
    expect(Array.from(composite.pixels.slice(0, 16))).toEqual([
      200, 100, 140, 255,
      80, 60, 220, 255,
      40, 24, 96, 255,
      160, 120, 180, 255
    ]);
    expect(() => createAnaglyphPixelComposite({ width: 2, height: 2, leftPixels: new Uint8Array(4), rightPixels })).toThrow(/width \* height \* 4/);
  });

  it("creates parallax barrier interleave masks and validates inputs", () => {
    const barrier = createParallaxBarrierInterleavePlan({ stripPitchPx: 10, dutyCycle: 0.4, rightOpacity: 0.7 });
    expect(barrier.stripPitchPx).toBe(10);
    expect(barrier.axis).toBe("x");
    expect(barrier.leftMaskImage).toContain("90deg");
    expect(barrier.leftMaskImage).toContain("black 0 4px");
    expect(barrier.rightMaskImage).toContain("transparent 0 4px");
    expect(barrier.overlayBackground).toContain("10px");
    expect(barrier.rightOpacity).toBe(0.7);

    const rowBarrier = createParallaxBarrierInterleavePlan({ axis: "y", stripPitchPx: 2 });
    expect(rowBarrier.axis).toBe("y");
    expect(rowBarrier.leftMaskImage).toContain("0deg");
    expect(rowBarrier.rightMaskImage).toContain("0deg");

    expect(() => createParallaxBarrierInterleavePlan({ stripPitchPx: 0 })).toThrow(/stripPitchPx/);
    expect(() => createParallaxBarrierInterleavePlan({ dutyCycle: 1 })).toThrow(/dutyCycle/);
    expect(() => createParallaxBarrierInterleavePlan({ rightOpacity: 2 })).toThrow(/rightOpacity/);
    expect(() => createParallaxBarrierInterleavePlan({ axis: "z" as "x" })).toThrow(/axis/);
  });

  it("composites parallax barrier pixels through package rendering code", () => {
    const leftPixels = new Uint8Array([
      255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
      255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255
    ]);
    const rightPixels = new Uint8Array([
      0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255,
      0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255
    ]);

    const composite = createParallaxBarrierPixelComposite({
      width: 4,
      height: 2,
      leftPixels,
      rightPixels,
      stripPitchPx: 2,
      dutyCycle: 0.5
    });

    expect(composite.composition).toBe("renderer-owned-interleaved-pixels");
    expect(composite.axis).toBe("x");
    expect(composite.leftPixelCount).toBe(4);
    expect(composite.rightPixelCount).toBe(4);
    expect(Array.from(composite.pixels.slice(0, 16))).toEqual([
      255, 0, 0, 255,
      0, 0, 255, 255,
      255, 0, 0, 255,
      0, 0, 255, 255
    ]);
    expect(() => createParallaxBarrierPixelComposite({ width: 0, height: 1, leftPixels, rightPixels })).toThrow(/width/);
    expect(() => createParallaxBarrierPixelComposite({ width: 4, height: 2, leftPixels: leftPixels.slice(0, 4), rightPixels })).toThrow(/width \* height \* 4/);
  });

  it("matches Three.js parallax barrier row interleaving semantics", () => {
    const leftPixels = new Uint8Array(2 * 4 * 4);
    const rightPixels = new Uint8Array(2 * 4 * 4);
    for (let offset = 0; offset < leftPixels.length; offset += 4) {
      leftPixels[offset] = 255;
      leftPixels[offset + 3] = 255;
      rightPixels[offset + 2] = 255;
      rightPixels[offset + 3] = 255;
    }

    const composite = createParallaxBarrierPixelComposite({
      width: 2,
      height: 4,
      leftPixels,
      rightPixels,
      axis: "y",
      stripPitchPx: 2,
      dutyCycle: 0.5
    });

    expect(composite.axis).toBe("y");
    expect(composite.leftPixelCount).toBe(4);
    expect(composite.rightPixelCount).toBe(4);
    expect(Array.from(composite.pixels.slice(0, 8))).toEqual([
      255, 0, 0, 255,
      255, 0, 0, 255
    ]);
    expect(Array.from(composite.pixels.slice(8, 16))).toEqual([
      0, 0, 255, 255,
      0, 0, 255, 255
    ]);
    expect(Array.from(composite.pixels.slice(16, 24))).toEqual([
      255, 0, 0, 255,
      255, 0, 0, 255
    ]);
    expect(Array.from(composite.pixels.slice(24, 32))).toEqual([
      0, 0, 255, 255,
      0, 0, 255, 255
    ]);
  });
});
