import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  loadV6HdrEnvironment,
  parseRadianceHDR
} from "../../../packages/rendering/src/production-runtime";

describe("V6 HDRLoader contract", () => {
  it("exports the Radiance HDR parser and public environment loader helper", () => {
    expect(parseRadianceHDR).toBeTypeOf("function");
    expect(loadV6HdrEnvironment).toBeTypeOf("function");
  });

  it("loads a real Radiance RGBE fixture into renderer-ready environment resources", () => {
    const hdr = readFileSync("fixtures/environment-corpus/hdri/studio_small_08_1k.hdr");
    const environment = loadV6HdrEnvironment(hdr, {
      id: "studio-small-08-loader-test",
      label: "Studio Small 08 Loader Test",
      intensity: 1.2,
      backgroundIntensity: 0.75,
      rotation: 0.35,
      specularLevels: 4,
      specularSampleCount: 2,
      cubemapFaceSize: 8,
      cubemapMipCount: 4,
      cubemapSampleCount: 2,
      irradianceWidth: 8,
      irradianceHeight: 4,
      brdfLutSize: 8,
      brdfLutSampleCount: 8
    });

    expect(environment.id).toBe("studio-small-08-loader-test");
    expect(environment.label).toBe("Studio Small 08 Loader Test");
    expect(environment.radiance.width).toBe(1024);
    expect(environment.radiance.height).toBe(512);
    expect(environment.pipeline.diagnostics.realRadianceHdr).toBe(true);
    expect(environment.pipeline.diagnostics.environmentTextureEncoding).toBe("rgba16f-linear");
    expect(environment.pipeline.diagnostics.cubemapPMREM).toBe(true);
    expect(environment.pipeline.diagnostics.cubemapFaceSize).toBe(8);
    expect(environment.pipeline.diagnostics.cubemapMipCount).toBe(4);
    expect(environment.lighting.environmentMapTexture?.validate().ok).toBe(true);
    expect(environment.lighting.environmentCubeMapTexture?.validate().ok).toBe(true);
    expect(environment.lighting.environmentBrdfLutTexture?.validate().ok).toBe(true);
    expect(environment.lighting.environmentMapEncoding).toBe("linear");
    expect(environment.lighting.environmentMapIntensity).toBe(1.2);
    expect(environment.lighting.environmentMapSpecularIntensity).toBeCloseTo(0.456, 5);
    expect(environment.lighting.environmentMapRotation).toBe(0.35);
    expect(environment.resources.environmentTexture.format).toBe("rgba16f");
    expect(environment.resources.environmentCubeTexture.dimension).toBe("cube");
    expect(environment.resources.environmentCubeTexture.cubeFaces).toHaveLength(6);
    expect(environment.resources.brdfLutTexture.width).toBe(8);

    environment.dispose();
    expect(environment.resources.environmentTexture.disposed).toBe(true);
    expect(environment.resources.environmentCubeTexture.disposed).toBe(true);
    expect(environment.resources.brdfLutTexture.disposed).toBe(true);
  });

  it("rejects malformed input instead of producing diagnostic or fallback resources", () => {
    expect(() => loadV6HdrEnvironment(new Uint8Array([0x45, 0x58, 0x52]))).toThrow(/Radiance\/RGBE header/);
    expect(() => loadV6HdrEnvironment(createFlatHdrWithoutPixels(4, 1))).toThrow(/scanline 0 is truncated/);
    expect(() => loadV6HdrEnvironment(createRleHdrWithZeroRun())).toThrow(/invalid zero run length/);
  });
});

function createFlatHdrWithoutPixels(width: number, height: number): Uint8Array {
  return Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`, "ascii");
}

function createRleHdrWithZeroRun(): Uint8Array {
  return concatBytes(
    Buffer.from("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 8\n", "ascii"),
    new Uint8Array([2, 2, 0, 8, 0])
  );
}

function concatBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
