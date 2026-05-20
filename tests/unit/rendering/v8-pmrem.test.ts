import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  auditCubemapPMREMResources,
  createCubemapPMREMShaderContract,
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  generateCubemapPMREMResources
} from "../../../packages/rendering/src/v6";

describe("V8 PMREM production contract", () => {
  it("generates cube PMREM mips that are wired to the renderer cube-map LOD contract", () => {
    const source = createHighContrastEnvironment();
    const pmrem = generateCubemapPMREMResources(source, { faceSize: 16, mipCount: 5, sampleCount: 16 });
    const audit = auditCubemapPMREMResources(pmrem);
    const contract = createCubemapPMREMShaderContract(pmrem);

    expect(pmrem.diagnostics.shaderSampling).toBe("webgl2-sampler-cube");
    expect(pmrem.levels.map((level) => level.faces.length)).toEqual([6, 6, 6, 6, 6]);
    expect(pmrem.levels.map((level) => level.faceSize)).toEqual([16, 8, 4, 2, 1]);
    expect(contract.sampling).toBe("webgl2-sampler-cube");
    expect(contract.mipSelection).toBe("roughness-scaled-textureLod");
    expect(contract.requiredUniforms).toEqual(expect.arrayContaining([
      "u_environmentCubeMapTexture",
      "u_environmentCubeMapTextureEnabled",
      "u_environmentMapTextureMipCount"
    ]));
    expect(audit.completeMipPyramid).toBe(true);
    expect(audit.roughestVarianceReduced).toBe(true);
    expect(audit.luminanceVarianceByMip.at(-1)).toBeLessThan(audit.luminanceVarianceByMip[0]!);
    expect(maxLuma(pmrem.levels[4]!.faces)).toBeLessThan(maxLuma(pmrem.levels[0]!.faces));
  });

  it("binds the cube PMREM mip count, not the equirectangular fallback mip count, into environment lighting", () => {
    const hdr = readFileSync("fixtures/v6/environments/hdri/studio_small_08_1k.hdr");
    const pipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
      id: "v8-studio-small-08",
      label: "V8 Studio Small 08",
      specularLevels: 4,
      intensity: 1,
      backgroundIntensity: 1,
      rotation: 0,
      toneMapping: { operator: "aces", exposure: 1, whitePoint: 11.2 }
    });
    const lighting = createV6EnvironmentLightingResources(pipeline);

    expect(pipeline.environmentMipLevels.length).toBe(4);
    expect(pipeline.cubemapPMREM.mipCount).toBeGreaterThan(4);
    expect(lighting.lighting.environmentMapMipCount).toBe(pipeline.cubemapPMREM.mipCount);
    expect(lighting.lighting.environmentMapMipCount).toBe(lighting.environmentCubeTexture.cubeFaces[0]?.mipLevels.length);
    lighting.dispose();
  });
});

function createHighContrastEnvironment() {
  const width = 32;
  const height = 16;
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 0.015;
      data[offset + 1] = 0.018;
      data[offset + 2] = 0.025;
      data[offset + 3] = 1;
    }
  }
  const hotSpot = (8 * width + 16) * 4;
  data[hotSpot] = 24;
  data[hotSpot + 1] = 12;
  data[hotSpot + 2] = 4;
  return { width, height, data };
}

function maxLuma(faces: readonly { readonly data: Uint16Array }[]): number {
  let max = 0;
  for (const face of faces) {
    for (let offset = 0; offset < face.data.length; offset += 4) {
      const r = halfFloatToNumber(face.data[offset]!);
      const g = halfFloatToNumber(face.data[offset + 1]!);
      const b = halfFloatToNumber(face.data[offset + 2]!);
      max = Math.max(max, r * 0.2126 + g * 0.7152 + b * 0.0722);
    }
  }
  return max;
}

function halfFloatToNumber(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : Number.NaN;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}
