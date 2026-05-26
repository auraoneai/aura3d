import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  auditCubemapPMREMResources,
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  createV6ToneMappingPolicy,
  createPMREMTransmissionProbe,
  generateCubemapPMREMResources,
  parseV6RadianceHDR
} from "../../../packages/rendering/src/production-runtime";

describe("V6 PBR/HDR pipeline", () => {
  it("parses real Radiance RGBE HDR data and creates renderer IBL resources", () => {
    const hdr = readFileSync("fixtures/environment-corpus/hdri/studio_small_08_1k.hdr");
    const radiance = parseV6RadianceHDR(hdr);
    const pipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
      id: "studio-small-08",
      label: "Studio Small 08",
      intensity: 1.15,
      backgroundIntensity: 0.85,
      rotation: 0.15,
      toneMapping: { operator: "filmic", exposure: 1, whitePoint: 11.2 }
    });

    expect(radiance.width).toBe(1024);
    expect(radiance.height).toBe(512);
    expect(radiance.rgbe.byteLength).toBe(1024 * 512 * 4);
    expect(pipeline.diagnostics.realRadianceHdr).toBe(true);
    expect(pipeline.diagnostics.environmentTextureEncoding).toBe("rgba16f-linear");
    expect(pipeline.diagnostics.environmentTextureFormat).toBe("rgba16f");
    expect(pipeline.diagnostics.hdrPixelCount).toBe(1024 * 512);
    expect(pipeline.diagnostics.maxLinearValue).toBeGreaterThan(1);
    expect(pipeline.diagnostics.diffuseIrradiance).toBe(true);
    expect(pipeline.diagnostics.diffuseIrradianceModel).toBe("cosine-weighted-hemisphere");
    expect(pipeline.diagnostics.specularPrefilter).toBe(true);
    expect(pipeline.diagnostics.specularPrefilterModel).toBe("ggx-importance-sampled");
    expect(pipeline.diagnostics.cubemapPMREM).toBe(true);
    expect(pipeline.diagnostics.cubemapPMREMModel).toBe("equirectangular-to-cubemap-ggx-importance-sampled-prefilter");
    expect(pipeline.diagnostics.cubemapPMREMShaderSampling).toBe("webgl2-sampler-cube");
    expect(pipeline.diagnostics.cubemapPMREMShaderContract).toBe("webgl2-sampler-cube-split-sum");
    expect(pipeline.diagnostics.cubemapFaceSize).toBe(128);
    expect(pipeline.diagnostics.cubemapMipCount).toBeGreaterThanOrEqual(8);
    expect(pipeline.cubemapPMREM.levels[0]?.faces).toHaveLength(6);
    expect(pipeline.cubemapPMREMShaderContract.sampling).toBe("webgl2-sampler-cube");
    expect(pipeline.cubemapPMREMShaderContract.requiredUniforms).toContain("u_environmentCubeMapTexture");
    expect(pipeline.cubemapPMREMShaderContract.requiredUniforms).toContain("u_environmentBrdfLutTexture");
    expect(pipeline.cubemapPMREMShaderContract.materialVariantCoverage).toContain("TexturedPBRMaterial");
    expect(pipeline.cubemapPMREMShaderContract.faceCompleteness).toBe(true);
    expect(pipeline.diagnostics.brdfLut).toBe(true);
    expect(pipeline.diagnostics.specularMipCount).toBeGreaterThanOrEqual(9);
    expect(pipeline.resources.diffuseIrradiance.width).toBe(32);
    expect(pipeline.resources.diffuseIrradiance.height).toBe(16);
    expect(pipeline.resources.brdfLut.width).toBe(64);
    expect(pipeline.toneMapping.operator).toBe("filmic");
  });

  it("generates real cubemap PMREM face data from an equirectangular HDR source", () => {
    const width = 16;
    const height = 8;
    const data = new Float32Array(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const offset = pixel * 4;
      data[offset] = 0.02;
      data[offset + 1] = 0.018;
      data[offset + 2] = 0.015;
      data[offset + 3] = 1;
    }
    const hotSpot = (4 * width + 8) * 4;
    data[hotSpot] = 18;
    data[hotSpot + 1] = 9;
    data[hotSpot + 2] = 3;

    const pmrem = generateCubemapPMREMResources({ width, height, data }, { faceSize: 9, mipCount: 4, sampleCount: 8 });
    const base = pmrem.levels[0]!;
    const rough = pmrem.levels[3]!;
    const positiveX = base.faces.find((face) => face.face === "px")!;
    const negativeX = base.faces.find((face) => face.face === "nx")!;
    const pxCenter = centerRed(positiveX.data, positiveX.width);
    const nxCenter = centerRed(negativeX.data, negativeX.width);
    const roughCenter = centerRed(rough.faces.find((face) => face.face === "px")!.data, rough.faceSize);

    expect(pmrem.diagnostics.faceCount).toBe(6);
    expect(pmrem.diagnostics.sourceProjection).toBe("equirectangular-to-cubemap");
    expect(pmrem.diagnostics.filterModel).toBe("ggx-importance-sampled-cubemap-prefilter");
    expect(pmrem.diagnostics.shaderSampling).toBe("webgl2-sampler-cube");
    expect(pmrem.levels.map((level) => [level.faceSize, level.faces.length])).toEqual([[9, 6], [4, 6], [2, 6], [1, 6]]);
    expect(pmrem.diagnostics.totalByteLength).toBe(pmrem.levels.reduce((total, level) => total + level.faces.reduce((faceTotal, face) => faceTotal + face.data.byteLength, 0), 0));
    expect(pxCenter).toBeGreaterThan(nxCenter);
    expect(pxCenter).toBeGreaterThan(1);
    expect(roughCenter).toBeLessThan(pxCenter);

    const audit = auditCubemapPMREMResources(pmrem);
    expect(audit.parity).toBe("bounded-pmrem-audit-not-threejs-parity");
    expect(audit.completeMipPyramid).toBe(true);
    expect(audit.faceCount).toBe(6);
    expect(audit.baseFaceSize).toBe(9);
    expect(audit.luminanceVarianceByMip).toHaveLength(4);
    expect(audit.roughnessVarianceNonIncreasing).toBe(false);
    expect(audit.roughestVarianceReduced).toBe(true);
    expect(audit.luminanceVarianceByMip.at(-1)).toBeLessThan(audit.luminanceVarianceByMip[0]!);
  });

  it("builds texture bindings that can feed the renderer environment uniforms", () => {
    const hdr = readFileSync("fixtures/environment-corpus/hdri/studio_small_08_1k.hdr");
    const pipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
      id: "venice-sunset",
      label: "Venice Sunset",
      intensity: 1.35,
      backgroundIntensity: 0.95,
      rotation: 0.62,
      toneMapping: { operator: "aces", exposure: 0.9, whitePoint: 10.4 }
    });
    const lighting = createV6EnvironmentLightingResources(pipeline);

    expect(lighting.lighting.environmentMapTexture?.validate().ok).toBe(true);
    expect(lighting.lighting.environmentCubeMapTexture?.validate().ok).toBe(true);
    expect(lighting.lighting.environmentBrdfLutTexture?.validate().ok).toBe(true);
    expect(lighting.lighting.environmentMapEncoding).toBe("linear");
    expect(lighting.environmentTexture.format).toBe("rgba16f");
    expect(lighting.environmentTexture.colorSpace).toBe("linear");
    expect(lighting.environmentTexture.mipLevels.length).toBeGreaterThanOrEqual(9);
    expect(lighting.environmentCubeTexture.dimension).toBe("cube");
    expect(lighting.environmentCubeTexture.format).toBe("rgba16f");
    expect(lighting.environmentCubeTexture.cubeFaces).toHaveLength(6);
    expect(lighting.lighting.environmentMapMipCount).toBe(lighting.environmentCubeTexture.cubeFaces[0]?.mipLevels.length);
    expect(lighting.brdfLutTexture.width).toBe(64);
    expect(lighting.lighting.environmentMapIntensity).toBe(1.35);
    expect(lighting.lighting.environmentMapRotation).toBe(0.62);
    lighting.dispose();
    expect(lighting.environmentTexture.disposed).toBe(true);
    expect(lighting.environmentCubeTexture.disposed).toBe(true);
    expect(lighting.brdfLutTexture.disposed).toBe(true);
  });

  it("plans parallax-corrected multi-bounce PMREM transmission probes", () => {
    const probe = createPMREMTransmissionProbe({
      position: [0.1, 0.2, 0.05],
      normal: [0, 0, 1],
      viewDirection: [0.25, -0.1, 1],
      ior: 1.45,
      roughness: 0.18,
      thickness: 0.65,
      attenuationDistance: 4,
      attenuationColor: [0.75, 0.9, 1],
      environmentBoxMin: [-2, -1, -2],
      environmentBoxMax: [2, 3, 2],
      maxBounces: 3,
      mipCount: 9
    });

    expect(probe.projection).toBe("box-parallax-corrected-cubemap");
    expect(probe.refractionModel).toBe("ior-refract-with-reflection-fallback");
    expect(probe.multiBounce).toBe(true);
    expect(probe.bounces.length).toBeGreaterThanOrEqual(2);
    expect(probe.bounces.length).toBeLessThanOrEqual(3);
    expect(probe.totalTravelDistance).toBeGreaterThan(0);
    expect(probe.recommendedLod).toBeGreaterThan(0);
    expect(probe.recommendedLod).toBeLessThanOrEqual(8);
    expect(probe.causticEnergy).toBeGreaterThan(0);
    expect(probe.averageAttenuation[0]).toBeLessThan(1);
    expect(probe.averageAttenuation[2]).toBeCloseTo(1);
    expect(probe.bounces.every((bounce) => bounce.travelDistance > 0 && bounce.lod >= 0 && bounce.causticEnergy > 0)).toBe(true);
  });

  it("publishes ACES, filmic, linear, and reinhard tone mapping policy options", () => {
    expect(createV6ToneMappingPolicy({ operator: "aces" }).operator).toBe("aces");
    expect(createV6ToneMappingPolicy({ operator: "filmic" }).operator).toBe("filmic");
    expect(createV6ToneMappingPolicy({ operator: "linear" }).operator).toBe("linear");
    expect(createV6ToneMappingPolicy({ operator: "reinhard" }).operator).toBe("reinhard");
    expect(() => createV6ToneMappingPolicy({ exposure: -1 })).toThrow(/exposure/i);
    expect(() => createV6ToneMappingPolicy({ whitePoint: 0 })).toThrow(/whitePoint/i);
  });
});

function centerRed(data: Uint16Array, width: number): number {
  const center = Math.floor(width / 2);
  return halfFloatToNumber(data[(center * width + center) * 4]!);
}

function halfFloatToNumber(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) {
    return sign * 2 ** -14 * (fraction / 1024);
  }
  if (exponent === 0x1f) {
    return fraction === 0 ? sign * Infinity : Number.NaN;
  }
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}
