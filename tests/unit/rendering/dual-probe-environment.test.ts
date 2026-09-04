import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createDualProbeEnvironmentLightingResources,
  createProductionPbrHdrPipelineFromRadiance,
  type ProductionPbrHdrPipeline
} from "../../../packages/rendering/src/production-runtime/index.js";

/**
 * muse3jsparity-PRD B3 dual-probe: the composed pyramid carries the
 * illumination probe on the roughest mip (the diffuse term's LOD) and the
 * reflection probe on every sharper mip (the specular term's LODs).
 */
function buildPipeline(id: string, file: string, intensity: number, cubemapFaceSize = 16) {
  return createProductionPbrHdrPipelineFromRadiance(readFileSync(file), {
    id,
    label: id,
    intensity,
    cubemapFaceSize,
    cubemapMipCount: 3,
    cubemapSampleCount: 4,
    specularSampleCount: 4,
    brdfLutSize: 8,
    irradianceWidth: 8,
    irradianceHeight: 4
  });
}

describe("B3 dual-probe environment composition", () => {
  let illumination!: ProductionPbrHdrPipeline;
  let reflection!: ProductionPbrHdrPipeline;
  beforeAll(() => {
    illumination = buildPipeline("b3-illumination", "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", 0.7);
    reflection = buildPipeline("b3-reflection", "fixtures/environment-corpus/hdri/kloppenheim_06_puresky_1k.hdr", 1.3);
  });
  it("binds illumination content on the roughest mip and reflection content above", () => {
    const dual = createDualProbeEnvironmentLightingResources({ illumination, reflection });
    try {
      expect(dual.environmentCubeTexture.label).toContain("dual-probe");
      expect(dual.lighting.environmentMapMipCount).toBe(3);
      expect(dual.environmentCubeTexture.cubeFaces).toHaveLength(6);
      for (const cubeFace of dual.environmentCubeTexture.cubeFaces) {
        expect(cubeFace.mipLevels).toHaveLength(3);
        const illuminationFaces = illumination.cubemapPMREM.levels[2]!.faces;
        const reflectionFaces = reflection.cubemapPMREM.levels[0]!.faces;
        const expectedRough = illuminationFaces.find((face) => face.face === cubeFace.face)!.data;
        const expectedSharp = reflectionFaces.find((face) => face.face === cubeFace.face)!.data;
        // Sharper mips sample the reflection probe ...
        expect(Array.from(cubeFace.mipLevels[0]!.data as Uint16Array)).toEqual(Array.from(expectedSharp));
        expect(Array.from(cubeFace.mipLevels[1]!.data as Uint16Array)).toEqual(
          Array.from(reflection.cubemapPMREM.levels[1]!.faces.find((face) => face.face === cubeFace.face)!.data)
        );
        // ... while the roughest mip (the diffuse term's LOD) is illumination.
        expect(Array.from(cubeFace.mipLevels[2]!.data as Uint16Array)).toEqual(Array.from(expectedRough));
      }
    } finally {
      dual.dispose();
    }
  }, 30_000);

  it("splits diffuse and specular intensity per probe", () => {
    const dual = createDualProbeEnvironmentLightingResources({ illumination, reflection });
    try {
      expect(dual.lighting.environmentMapIntensity).toBeCloseTo(0.7, 6);
      expect(dual.lighting.environmentMapSpecularIntensity).toBeCloseTo(1.3 * 1.1, 6);
    } finally {
      dual.dispose();
    }
  }, 30_000);

  it("rejects mismatched pyramid geometry instead of resampling", () => {
    const narrow = buildPipeline("b3-reflection-m", "fixtures/environment-corpus/hdri/kloppenheim_06_puresky_1k.hdr", 1, 8);
    expect(() => createDualProbeEnvironmentLightingResources({ illumination, reflection: narrow })).toThrow(/face sizes differ/);
  }, 30_000);
});
