import { describe, expect, it } from "vitest";
import {
  contactShadowPixels,
  createDepthTextureBinding
} from "../../../packages/rendering/src";

describe("V7 screen-space contact shadow postprocess", () => {
  it("darkens receiver pixels near closer depth casters without changing distant floor pixels", () => {
    const width = 5;
    const height = 5;
    const pixels = new Uint8Array(width * height * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 200;
      pixels[index + 1] = 200;
      pixels[index + 2] = 200;
      pixels[index + 3] = 255;
    }
    const depthData = new Float32Array(width * height).fill(0.72);
    depthData[1 * width + 2] = 0.46;
    const depth = createDepthTextureBinding({
      label: "screen-space-contact-depth",
      width,
      height,
      data: depthData
    });

    const result = contactShadowPixels(pixels, width, height, {
      depth,
      radius: 2,
      intensity: 1.2,
      thickness: 0.35,
      bias: 0.008,
      direction: [0, 1]
    });

    const receiverIndex = (2 * width + 2) * 4;
    const distantIndex = (4 * width + 0) * 4;
    expect(result.mode).toBe("screen-space-depth-contact");
    expect(result.contactPixels).toBeGreaterThan(0);
    expect(result.averageContactDarkening).toBeGreaterThan(0);
    expect(result.pixels[receiverIndex]).toBeLessThan(200);
    expect(Array.from(result.pixels.slice(distantIndex, distantIndex + 4))).toEqual([200, 200, 200, 255]);
  });

  it("rejects missing or incompatible depth data", () => {
    const pixels = new Uint8Array(4 * 4 * 4).fill(255);
    expect(() => contactShadowPixels(pixels, 4, 4, {})).toThrow(/Contact shadow requires a depth texture/);
    const depth = createDepthTextureBinding({
      label: "wrong-size-contact-depth",
      width: 2,
      height: 2,
      data: new Float32Array(4).fill(0.5)
    });
    expect(() => contactShadowPixels(pixels, 4, 4, { depth })).toThrow(/dimensions must match/);
  });

  it("rejects invalid contact shadow sampling direction", () => {
    const depth = createDepthTextureBinding({
      label: "zero-direction-contact-depth",
      width: 2,
      height: 2,
      data: new Float32Array(4).fill(0.5)
    });
    expect(() => contactShadowPixels(new Uint8Array(16).fill(255), 2, 2, {
      depth,
      direction: [0, 0]
    })).toThrow(/must not be zero length/);
  });
});
