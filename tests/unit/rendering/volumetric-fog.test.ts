import { describe, expect, it } from "vitest";
import { SHADER_CHUNKS } from "../../../packages/rendering/src/ShaderChunks";
import { volumetricLightPixels } from "../../../packages/rendering/src/PostProcessPass";
import type { CollectedLight } from "../../../packages/rendering/src/LightCollector";
import {
  resolveVolumetricFog,
  resolveVolumetricQuality,
  selectVolumetricLight,
  volumetricLightDirection,
} from "../../../packages/rendering/src/VolumetricFog";

function light(
  kind: CollectedLight["kind"],
  intensity: number,
  direction: readonly [number, number, number] = [0, -1, 0],
): CollectedLight {
  return {
    kind,
    color: [1, 0.96, 0.9],
    intensity,
    position: [0, 4, 0],
    direction,
    range: 20,
    spotAngle: 0.6,
    penumbra: 0.4,
    castsShadow: false,
    layerMask: 1,
  } as unknown as CollectedLight;
}

describe("resolveVolumetricQuality — A5 quality scaler", () => {
  it("returns null when quality is off so the caller keeps exp2 fog", () => {
    expect(resolveVolumetricQuality(3840, 2160, "off")).toBeNull();
  });

  it("caps an ultra request at 720p down to 24 samples", () => {
    expect(resolveVolumetricQuality(1280, 720, "ultra")).toEqual({
      tier: "balanced",
      samples: 24,
      dither: true,
    });
  });

  it("keeps a quality request at 1080p at 32 samples", () => {
    expect(resolveVolumetricQuality(1920, 1080, "quality")?.samples).toBe(32);
  });

  it("grants an ultra request at 4K 48 samples", () => {
    expect(resolveVolumetricQuality(3840, 2160, "ultra")).toEqual({
      tier: "ultra",
      samples: 48,
      dither: true,
    });
  });

  it("never scales a balanced request up at large areas", () => {
    expect(resolveVolumetricQuality(7680, 4320, "balanced")?.samples).toBe(24);
  });

  it("defaults to balanced 24 when quality is omitted", () => {
    expect(resolveVolumetricQuality(1920, 1080)).toEqual({
      tier: "balanced",
      samples: 24,
      dither: true,
    });
  });

  it("honors an explicit sample override and rejects out-of-range values", () => {
    expect(resolveVolumetricQuality(1280, 720, "balanced", 64)?.samples).toBe(64);
    expect(() => resolveVolumetricQuality(1280, 720, "balanced", 3)).toThrow(RangeError);
    expect(() => resolveVolumetricQuality(1280, 720, "balanced", 129)).toThrow(RangeError);
  });
});

describe("selectVolumetricLight — brightest-beam preference", () => {
  it("prefers a spot over a brighter directional", () => {
    expect(selectVolumetricLight([light("directional", 5), light("spot", 2)])?.kind).toBe("spot");
  });

  it("falls back to directional when no spot exists", () => {
    expect(selectVolumetricLight([light("point", 9), light("directional", 1)])?.kind).toBe(
      "directional",
    );
  });

  it("ignores zero-intensity lights and returns null when none qualify", () => {
    expect(selectVolumetricLight([light("spot", 0)])).toBeNull();
    expect(selectVolumetricLight([])).toBeNull();
  });
});

describe("volumetricLightDirection", () => {
  it("negates and normalizes a directional light vector", () => {
    const dir = volumetricLightDirection(light("directional", 1, [0, -4, 0]));
    expect(dir?.[0]).toBeCloseTo(0, 6);
    expect(dir?.[1]).toBeCloseTo(1, 6);
    expect(dir?.[2]).toBeCloseTo(0, 6);
  });

  it("returns null for point lights and degenerate directionals", () => {
    expect(volumetricLightDirection(light("point", 3))).toBeNull();
    expect(volumetricLightDirection(light("directional", 1, [0, 0, 0]))).toBeNull();
  });
});

describe("resolveVolumetricFog", () => {
  it("keeps exp2-only output when quality is off", () => {
    const resolved = resolveVolumetricFog({ quality: "off" }, [], 1280, 720);
    expect(resolved.quality).toBeNull();
    expect(resolved.pass).toBeNull();
    expect(resolved.forward.volumetricIntensity).toBe(0);
    expect(resolved.lightKind).toBeNull();
  });

  it("adopts authored overrides and reports the selected light kind", () => {
    const resolved = resolveVolumetricFog(
      {
        quality: "quality",
        density: 0.05,
        heightFalloff: 0.2,
        heightReference: 1,
        lightPosition: [0.3, 0.4],
      },
      [light("spot", 2)],
      1920,
      1080,
    );
    expect(resolved.quality?.samples).toBe(32);
    expect(resolved.pass?.dither).toBe(true);
    expect(resolved.forward.volumetricLightColor).toEqual([1, 0.96, 0.9]);
    expect(resolved.lightKind).toBe("spot");
  });
});

describe("forward fog chunk — A5 inscatter with hash dither", () => {
  it("adds the forward lobe gated by u_volumetricIntensity with one-LSB dither", () => {
    const chunk = SHADER_CHUNKS.find((entry) => entry.name === "environment_fog_common");
    expect(chunk).toBeDefined();
    expect(chunk?.source).toContain("u_volumetricIntensity");
    expect(chunk?.source).toContain("u_volumetricLightDirection");
    expect(chunk?.source).toContain("43758.5453");
  });
});

describe("volumetric-light CPU kernel — A5 ordered dither", () => {
  const width = 8;
  const height = 8;
  const pixels = new Uint8Array(width * height * 4).fill(128);
  const depth = {
    label: "test-depth",
    width,
    height,
    format: "depth24" as const,
    data: new Float32Array(width * height).fill(0.5),
  };

  it("leaves legacy bytes untouched when dither is off", () => {
    const legacy = volumetricLightPixels(pixels.slice(), width, height, { depth });
    const explicitOff = volumetricLightPixels(pixels.slice(), width, height, {
      depth,
      dither: false,
    });
    expect(Array.from(explicitOff.pixels)).toEqual(Array.from(legacy.pixels));
  });

  it("perturbs at most one LSB per channel when dither is on", () => {
    const plain = volumetricLightPixels(pixels.slice(), width, height, { depth });
    const dithered = volumetricLightPixels(pixels.slice(), width, height, {
      depth,
      dither: true,
    });
    expect(dithered.changedPixels).toBeGreaterThan(0);
    for (let i = 0; i < plain.pixels.length; i += 1) {
      expect(Math.abs((dithered.pixels[i] ?? 0) - (plain.pixels[i] ?? 0))).toBeLessThanOrEqual(1);
    }
  });
});
