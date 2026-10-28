import { describe, expect, it } from "vitest";
import {
  NEUTRAL_FLOOR_RADIANCE,
  NEUTRAL_FLOOR_SH9,
  Prd02EnvironmentProbe,
  buildNeutralFloorProbe,
  floatToHalf,
  halfToFloat,
  probeToEquirectTexture,
  uniformRadianceHalf
} from "../../../packages/rendering/src/environment/probeBuild.js";

/** The same probe with the fast-path marker removed, so `probeToEquirectTexture` takes its general sampling route. */
function unmarked(probe: Prd02EnvironmentProbe): Prd02EnvironmentProbe {
  return new Prd02EnvironmentProbe({
    specularCube: probe.specularCube,
    mipCount: probe.mipCount,
    faceSize: probe.faceSize,
    sh9: probe.sh9,
    shTexture: probe.shTexture,
    background: probe.background,
    source: probe.source
  });
}

describe("neutral floor probe (WP-8 first-frame init)", () => {
  it("encodes each face to the same half bits as encoding a float face texel by texel", () => {
    const faceSize = 32;
    const probe = buildNeutralFloorProbe(faceSize as 128);
    const reference = new Uint16Array(faceSize * faceSize * 4);
    const f32 = Math.fround(NEUTRAL_FLOOR_RADIANCE);
    for (let i = 0; i < faceSize * faceSize; i += 1) {
      reference[i * 4] = floatToHalf(f32);
      reference[i * 4 + 1] = floatToHalf(f32);
      reference[i * 4 + 2] = floatToHalf(f32);
      reference[i * 4 + 3] = floatToHalf(1);
    }
    expect(probe.specularCube.cubeFaces).toHaveLength(6);
    for (const face of probe.specularCube.cubeFaces) {
      expect(face.mipLevels).toHaveLength(1);
      expect(Array.from(face.mipLevels[0]!.data as Uint16Array)).toEqual(Array.from(reference));
    }
    expect(probe.mipCount).toBe(1);
    expect(probe.faceSize).toBe(faceSize);
    expect(Array.from(probe.sh9)).toEqual(Array.from(NEUTRAL_FLOOR_SH9));
    expect(probe.source).toBe("neutral");
  });

  it("gives each face its own copy of the shared data", () => {
    const probe = buildNeutralFloorProbe(16 as 128);
    const [a, b] = probe.specularCube.cubeFaces;
    expect(a!.mipLevels[0]!.data).not.toBe(b!.mipLevels[0]!.data);
  });

  it("builds an equirect of every mip bit-identical to the general sampled path", () => {
    for (const faceSize of [16, 32]) {
      const probe = buildNeutralFloorProbe(faceSize as 128);
      expect(probe.uniformRadiance).toBe(Math.fround(NEUTRAL_FLOOR_RADIANCE));
      const fast = probeToEquirectTexture(probe);
      const general = probeToEquirectTexture(unmarked(probe));
      expect(fast.width).toBe(general.width);
      expect(fast.height).toBe(general.height);
      expect(fast.mipLevels).toHaveLength(general.mipLevels.length);
      fast.mipLevels.forEach((level, i) => {
        const other = general.mipLevels[i]!;
        expect([level.width, level.height]).toEqual([other.width, other.height]);
        expect(Array.from(level.data as Uint16Array)).toEqual(Array.from(other.data as Uint16Array));
      });
    }
  });

  it("honours explicit equirect dimensions", () => {
    const probe = buildNeutralFloorProbe(16 as 128);
    const fast = probeToEquirectTexture(probe, { width: 24, height: 10 });
    const general = probeToEquirectTexture(unmarked(probe), { width: 24, height: 10 });
    expect(fast.mipLevels.map((m) => [m.width, m.height])).toEqual(general.mipLevels.map((m) => [m.width, m.height]));
    fast.mipLevels.forEach((level, i) => {
      expect(Array.from(level.data as Uint16Array)).toEqual(Array.from(general.mipLevels[i]!.data as Uint16Array));
    });
  });

  it("fills a uniform half run with rgb, alpha 1", () => {
    const run = uniformRadianceHalf(3, 2);
    expect(run).toHaveLength(12);
    expect(halfToFloat(run[0]!)).toBe(2);
    expect(halfToFloat(run[3]!)).toBe(1);
    expect(halfToFloat(run[11]!)).toBe(1);
  });
});
