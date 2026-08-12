import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  loadProductionHdrEnvironmentFile,
  loadProductionHdrEnvironment,
  parseRadianceHDR
} from "../../../packages/rendering/src/production-runtime";

describe("Production HDRLoader contract", () => {
  it("exports the Radiance HDR parser and public environment loader helper", () => {
    expect(parseRadianceHDR).toBeTypeOf("function");
    expect(loadProductionHdrEnvironment).toBeTypeOf("function");
    expect(loadProductionHdrEnvironmentFile).toBeTypeOf("function");
  });

  it("loads a public URL through fetch into disposable renderer-ready resources", async () => {
    const hdr = readFileSync("fixtures/environment-corpus/hdri/studio_small_08_1k.hdr");
    const requested: string[] = [];
    const environment = await loadProductionHdrEnvironmentFile("https://assets.example/studio.hdr", {
      id: "url-hdr-environment",
      cubemapFaceSize: 4,
      cubemapMipCount: 3,
      cubemapSampleCount: 1,
      irradianceWidth: 4,
      irradianceHeight: 2,
      specularLevels: 3,
      specularSampleCount: 1,
      brdfLutSize: 4,
      brdfLutSampleCount: 4,
      fetcher: async (input) => {
        requested.push(String(input));
        return new Response(hdr, { status: 200, headers: { "content-type": "image/vnd.radiance" } });
      }
    });

    expect(requested).toEqual(["https://assets.example/studio.hdr"]);
    expect(environment.id).toBe("url-hdr-environment");
    expect(environment.radiance).toMatchObject({ width: 1024, height: 512, format: "32-bit_rle_rgbe" });
    expect(environment.resources.environmentCubeTexture.cubeFaces).toHaveLength(6);
    expect(environment.lighting.environmentCubeMapTexture?.validate().ok).toBe(true);
    environment.dispose();
    expect(environment.resources.environmentCubeTexture.disposed).toBe(true);
  }, 15_000);

  it("loads Blob sources and rejects failed HTTP responses", async () => {
    const hdr = readFileSync("fixtures/environment-corpus/hdri/studio_small_08_1k.hdr");
    const environment = await loadProductionHdrEnvironmentFile(new Blob([hdr]), {
      cubemapFaceSize: 2,
      cubemapMipCount: 2,
      cubemapSampleCount: 1,
      irradianceWidth: 2,
      irradianceHeight: 1,
      specularLevels: 2,
      specularSampleCount: 1,
      brdfLutSize: 2,
      brdfLutSampleCount: 2
    });
    expect(environment.pipeline.diagnostics.realRadianceHdr).toBe(true);
    environment.dispose();

    await expect(loadProductionHdrEnvironmentFile("https://assets.example/missing.hdr", {
      fetcher: async () => new Response(null, { status: 404, statusText: "Not Found" })
    })).rejects.toThrow(/HTTP 404 Not Found/);
    /*
     * 45s, raised from 15s after this became the suite's most frequent load-only failure.
     *
     * Diagnosed rather than retried, per the repository's standing rule. This test does real work twice: it
     * decodes a 1K Radiance HDR and builds cubemap, irradiance, specular and BRDF-LUT resources, then repeats
     * the loader path for the 404 case. Standalone it measures **5.66s against the old 15s budget** -- only
     * 2.6x headroom on genuine CPU work, where most tests in this repository have 100x or more. Under the full
     * 389-file suite on a machine at load average 80+ that margin disappears, and the failure is always a
     * wall-clock timeout, never an assertion.
     *
     * Nothing here is skipped, mocked, or loosened: the assertions, the real fixture and the real pipeline are
     * unchanged. Only the wall clock is, and only for the one test whose cost justifies it.
     */
  }, 45_000);

  it("loads a real Radiance RGBE fixture into renderer-ready environment resources", () => {
    const hdr = readFileSync("fixtures/environment-corpus/hdri/studio_small_08_1k.hdr");
    const environment = loadProductionHdrEnvironment(hdr, {
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
    // PBRHDRPipeline intentionally keeps the HDR specular lobe at 110% of the
    // caller's IBL intensity; the former 38% multiplier made metals look flat.
    expect(environment.lighting.environmentMapSpecularIntensity).toBeCloseTo(1.32, 5);
    expect(environment.lighting.environmentMapRotation).toBe(0.35);
    expect(environment.resources.environmentTexture.format).toBe("rgba16f");
    expect(environment.resources.environmentCubeTexture.dimension).toBe("cube");
    expect(environment.resources.environmentCubeTexture.cubeFaces).toHaveLength(6);
    expect(environment.resources.brdfLutTexture.width).toBe(8);

    environment.dispose();
    expect(environment.resources.environmentTexture.disposed).toBe(true);
    expect(environment.resources.environmentCubeTexture.disposed).toBe(true);
    expect(environment.resources.brdfLutTexture.disposed).toBe(true);
  }, 15_000);

  it("rejects malformed input instead of producing diagnostic or fallback resources", () => {
    expect(() => loadProductionHdrEnvironment(new Uint8Array([0x45, 0x58, 0x52]))).toThrow(/Radiance\/RGBE header/);
    expect(() => loadProductionHdrEnvironment(createFlatHdrWithoutPixels(4, 1))).toThrow(/scanline 0 is truncated/);
    expect(() => loadProductionHdrEnvironment(createRleHdrWithZeroRun())).toThrow(/invalid zero run length/);
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
