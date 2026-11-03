import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseEXR } from "../../../packages/assets/src/EXRLoader";
import {
  loadProductionHdrEnvironment,
  loadProductionHdrEnvironmentFile,
  loadProductionLinearHdrEnvironment
} from "../../../packages/rendering/src/production-runtime/environment/HDRLoader";

// The 64 x 48 reference EXRs contain independently specified source gradients:
// R = 2x/63, G = 1.5y/47, B = 0.25 + (x+y)/110, A = 1.
// The EXR decoder returns device-row order; this renderer input is top-down.
async function linearExrFixture(name: string) {
  const bytes = readFileSync(`tests/fixtures/exr/${name}.exr`);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const decoded = await parseEXR(arrayBuffer, { type: "float", outputFormat: "rgba" });
  expect(decoded.data).toBeInstanceOf(Float32Array);
  const rowSize = decoded.width * 4;
  const data = new Float32Array(decoded.data.length);
  for (let y = 0; y < decoded.height; y += 1) {
    const sourceRow = decoded.height - 1 - y;
    data.set(decoded.data.subarray(sourceRow * rowSize, (sourceRow + 1) * rowSize), y * rowSize);
  }
  return { width: decoded.width, height: decoded.height, data };
}

const smallPipeline = {
  cubemapFaceSize: 1,
  cubemapMipCount: 1,
  cubemapSampleCount: 1,
  irradianceWidth: 2,
  irradianceHeight: 1,
  specularLevels: 2,
  specularSampleCount: 1,
  brdfLutSize: 2,
  brdfLutSampleCount: 2
} as const;

function halfToNumber(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 0x1f) return fraction ? Number.NaN : sign * Infinity;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

describe("linear HDR environment resources", () => {
  it.each(["none_float", "zip_float", "piz_half"])(
    "preserves %s EXR values into an oriented, disposable HDR probe",
    async (fixture) => {
      const source = await linearExrFixture(fixture);
      const loaded = loadProductionLinearHdrEnvironment(source, {
        ...smallPipeline,
        id: `test-${fixture}`,
        intensity: 1.25,
        rotation: 0.3
      });

      expect(loaded.id).toBe(`test-${fixture}`);
      expect(loaded.pipeline.diagnostics.realRadianceHdr).toBe(false);
      expect(loaded.pipeline.resources.diagnostics.inputEncoding).toBe("linear-hdr");
      expect(loaded.pipeline.diagnostics.maxLinearValue).toBeCloseTo(2, 3);
      expect(loaded.pipeline.linear).toMatchObject({ width: 64, height: 48 });
      for (const [x, y] of [[0, 0], [17, 13], [63, 47]]) {
        const offset = (y! * 64 + x!) * 4;
        const expected = [2 * x! / 63, 1.5 * y! / 47, 0.25 + (x! + y!) / 110, 1];
        for (let channel = 0; channel < 4; channel += 1) {
          expect(loaded.pipeline.linear.data[offset + channel]).toBeCloseTo(expected[channel]!, 3);
        }
      }

      const faces = loaded.pipeline.cubemapPMREM.levels[0]!.faces;
      const positiveY = faces.find((face) => face.face === "py")!;
      const negativeY = faces.find((face) => face.face === "ny")!;
      expect(halfToNumber(positiveY.data[1]!)).toBeCloseTo(0, 3);
      expect(halfToNumber(negativeY.data[1]!)).toBeCloseTo(1.5, 3);
      expect(loaded.lighting.environmentMapEncoding).toBe("linear");
      expect(loaded.lighting.environmentMapIntensity).toBe(1.25);
      expect(loaded.lighting.environmentMapRotation).toBe(0.3);
      expect(loaded.lighting.environmentMapTexture?.validate().ok).toBe(true);
      expect(loaded.lighting.environmentCubeMapTexture?.validate().ok).toBe(true);
      expect(loaded.lighting.environmentBrdfLutTexture?.validate().ok).toBe(true);
      expect(loaded.resources.environmentTexture.format).toBe("rgba16f");

      loaded.dispose();
      loaded.dispose();
      expect(loaded.resources.environmentTexture.disposed).toBe(true);
      expect(loaded.resources.environmentCubeTexture.disposed).toBe(true);
      expect(loaded.resources.brdfLutTexture.disposed).toBe(true);
    }
  );

  it("rejects malformed linear image dimensions, lengths and non-finite samples", () => {
    expect(() => loadProductionLinearHdrEnvironment({ width: 0, height: 1, data: new Float32Array() }, smallPipeline))
      .toThrow(/dimensions|width/i);
    expect(() => loadProductionLinearHdrEnvironment({ width: 2, height: 1, data: new Float32Array(4) }, smallPipeline))
      .toThrow(/data|RGBA/i);
    expect(() => loadProductionLinearHdrEnvironment({ width: 1, height: 1, data: new Float32Array([NaN, 0, 0, 1]) }, smallPipeline))
      .toThrow(/finite/i);
  });
});

describe("existing Radiance HDR entry points", () => {
  const header = new TextEncoder().encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 2\n");
  const pixels = new Uint8Array([128, 64, 32, 129, 64, 32, 16, 129]);
  const bytes = new Uint8Array([...header, ...pixels]);

  it("keeps the synchronous RGBE loader and linear channel values", () => {
    const loaded = loadProductionHdrEnvironment(bytes, smallPipeline);
    expect(loaded.radiance.format).toBe("32-bit_rle_rgbe");
    expect(loaded.radiance.rgbe).toEqual(pixels);
    expect(loaded.pipeline.diagnostics.realRadianceHdr).toBe(true);
    expect(Array.from(loaded.pipeline.linear.data.slice(0, 4))).toEqual([1, 0.5, 0.25, 1]);
    loaded.dispose();
    expect(loaded.resources.environmentCubeTexture.disposed).toBe(true);
  });

  it("passes the original URL and request options through file loading and reports HTTP failures", async () => {
    const fetcher = vi.fn(async () => new Response(bytes));
    const requestInit: RequestInit = { credentials: "include", headers: { "x-test": "authorized" } };
    const url = "https://assets.example/studio.HDR?revision=1#lighting";
    const loaded = await loadProductionHdrEnvironmentFile(url, { ...smallPipeline, fetcher, requestInit });
    expect(fetcher).toHaveBeenCalledWith(url, requestInit);
    expect(loaded.radiance.rgbe).toEqual(pixels);
    loaded.dispose();

    await expect(loadProductionHdrEnvironmentFile(url, {
      ...smallPipeline,
      fetcher: async () => new Response(null, { status: 404, statusText: "Not Found" })
    })).rejects.toThrow(/HTTP 404 Not Found/);
  });
});
