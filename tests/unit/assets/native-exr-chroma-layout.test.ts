import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { EXRLoader, parseEXR } from "../../../packages/assets/src/EXRLoader";

const fixtureUrl = new URL("../../fixtures/exr/wp08-chroma-layout.exr", import.meta.url);
const provenanceUrl = new URL("../../fixtures/exr/wp08-chroma-layout.provenance.json", import.meta.url);
const fixture = readFileSync(fixtureUrl);
const digest = "f38ee348c7e447ab5848472d016c87a4a265001009d86eeb434b49c29088d1b3";
const dwabFixture = readFileSync(new URL("../../fixtures/exr/wp08-chroma-layout-dwab.exr", import.meta.url));
const dwabProvenanceUrl = new URL("../../fixtures/exr/wp08-chroma-layout-dwab.provenance.json", import.meta.url);
const dwabDigest = "e74a9133bab2b3f26f2e92566f5e739bcdd16e93ba55b4e7f25212adb7d4a7c9";
const halfFixture = readFileSync(new URL("../../fixtures/exr/wp08-chroma-layout-half.exr", import.meta.url));
const halfProvenanceUrl = new URL("../../fixtures/exr/wp08-chroma-layout-half.provenance.json", import.meta.url);
const halfDigest = "972c5f974dd731e8afa043b013e4a4ccb873cfb05bc50542ffd19667ba41c214";
const width = 32;
const height = 16;
const variants = [
  { name: "ZIP FLOAT", compression: "ZIP", bytes: fixture, provenance: provenanceUrl, digest, size: 934, compressed: 481, decoded: 7168, tolerance: 0.000001 },
  { name: "ZIP HALF", compression: "ZIP", bytes: halfFixture, provenance: halfProvenanceUrl, digest: halfDigest, size: 919, compressed: 466, decoded: 6656, tolerance: 0.000001 },
  { name: "DWAB FLOAT", compression: "DWAB", bytes: dwabFixture, provenance: dwabProvenanceUrl, digest: dwabDigest, size: 1291, compressed: 838, decoded: 7168, tolerance: 0.02 }
] as const;

function input(bytes: Uint8Array = fixture): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function halfToNumber(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> 10) & 31;
  const fraction = bits & 1023;
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

function expectedPixel(x: number, y: number): readonly number[] {
  const sx = Math.min(30, Math.floor((x + 1) / 2) * 2);
  const sy = Math.min(14, Math.floor((y + 1) / 2) * 2);
  const luminance = 0.5 + x / 64 + y / 128;
  const red = luminance * (1 - 0.25 + sx / 64);
  const blue = luminance * (1 + 0.125 + sy / 64);
  const green = 2 * luminance - (red + blue) / 2;
  return [red, green, blue, 0.75];
}

describe("OpenEXR subsampled luminance/chroma output layouts", () => {
  test.each(variants)("uses the independently generated, reference-verified $name fixture", ({ bytes, provenance: path, digest: expectedDigest, size, compressed, decoded }) => {
    const provenance = JSON.parse(readFileSync(path, "utf8"));
    expect(provenance.sha256).toBe(expectedDigest);
    expect(provenance.fixtureLicense).toBe("MIT");
    expect(provenance.encoder).toMatchObject({ name: "OpenEXR", version: "3.4.6", license: "BSD-3-Clause" });
    expect(bytes.byteLength).toBe(size);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(expectedDigest);
    let cursor = 8;
    while (bytes[cursor] !== 0) {
      cursor = bytes.indexOf(0, cursor) + 1;
      cursor = bytes.indexOf(0, cursor) + 1;
      const length = bytes.readUInt32LE(cursor);
      cursor += 4 + length;
    }
    const chunk = Number(bytes.readBigUInt64LE(cursor + 1));
    expect(bytes.readUInt32LE(chunk + 4)).toBe(compressed);
    expect(compressed).toBeLessThan(decoded);
  });

  for (const variant of variants) for (const type of ["float", "half"] as const) {
    for (const [outputFormat, channels] of [["r", 1], ["rg", 2], ["rgba", 4]] as const) {
      test(`decodes named ${variant.name} chroma to ${type} ${outputFormat}`, async () => {
        const result = await parseEXR(input(variant.bytes), { layer: "look", type, outputFormat });
        expect(result).toMatchObject({ width, height, channels, format: outputFormat, type, flipY: false });
        expect(result.header.compression).toBe(`${variant.compression}_COMPRESSION`);
        expect(result.data.length).toBe(width * height * channels);
        expect(result.data.buffer.byteLength).toBe(result.data.byteLength);
        expect(result.diagnostics.map(item => item.message)).toEqual(expect.arrayContaining([expect.stringContaining("Channel R ")]));
        if (channels < 4) {
          expect(result.diagnostics.map(item => item.message)).toEqual(expect.arrayContaining([expect.stringContaining("Channel look.A ")]));
        }
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const expected = expectedPixel(x, y);
          const offset = ((height - 1 - y) * width + x) * channels;
          for (let channel = 0; channel < channels; channel++) {
            const raw = result.data[offset + channel]!;
            const actual = type === "half" ? halfToNumber(raw) : raw;
            expect(Math.abs(actual - expected[channel]!), `x=${x}, y=${y}, channel=${channel}`).toBeLessThan(Math.max(type === "half" ? 0.002 : 0, variant.tolerance));
          }
        }
      });
    }
    test(`${variant.name} ${type} narrow output exactly matches the RGBA channel prefixes`, async () => {
      const rgba = await parseEXR(input(variant.bytes), { layer: "look", type, outputFormat: "rgba" });
      const red = await parseEXR(input(variant.bytes), { layer: "look", type, outputFormat: "r" });
      const redGreen = await parseEXR(input(variant.bytes), { layer: "look", type, outputFormat: "rg" });
      for (let pixel = 0; pixel < width * height; pixel++) {
        expect(red.data[pixel]).toBe(rgba.data[pixel * 4]);
        expect(redGreen.data[pixel * 2]).toBe(rgba.data[pixel * 4]);
        expect(redGreen.data[pixel * 2 + 1]).toBe(rgba.data[pixel * 4 + 1]);
      }
    });
  }

  test("honours the loader's named layer and narrow output setters", async () => {
    const loader = new EXRLoader().setLayer("look").setDataType("float").setOutputFormat("rg");
    const decoded = await loader.parse(input());
    expect(decoded).toMatchObject({ width, height, channels: 2, format: "rg" });
    expect(Array.from(decoded.data.slice(0, 2))).toEqual(expectedPixel(0, height - 1).slice(0, 2));
  });

  test("preserves narrow output selection through the loader fetch path", async () => {
    const fetch = vi.fn(async () => new Response(input(dwabFixture)));
    vi.stubGlobal("fetch", fetch);
    try {
      const onLoad = vi.fn();
      const loader = new EXRLoader().setLayer("look").setDataType("float").setOutputFormat("r");
      const decoded = await loader.load("https://fixture.invalid/lighting.exr", onLoad);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(onLoad).toHaveBeenCalledWith(decoded);
      expect(decoded).toMatchObject({ width, height, channels: 1, format: "r" });
      expect(Math.abs(decoded.data[0]! - expectedPixel(0, height - 1)[0]!)).toBeLessThan(0.02);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("retains limits and rejects incomplete chroma or truncated data", async () => {
    const missing = Buffer.from(fixture);
    const by = missing.indexOf(Buffer.from("look.BY\0"));
    expect(by).toBeGreaterThan(0);
    missing.write("look.XY", by, "ascii");
    await expect(parseEXR(Uint8Array.from(missing).buffer, { layer: "look", outputFormat: "r" })).rejects.toThrow(/Y, RY and BY/);
    await expect(parseEXR(input(), { layer: "look", maxPixels: 511 })).rejects.toThrow(/limit/i);
    await expect(parseEXR(input(), { layer: "look", maxInputBytes: fixture.byteLength - 1 })).rejects.toThrow(/limit/i);
    await expect(parseEXR(input().slice(0, -1), { layer: "look", outputFormat: "rg" })).rejects.toThrow(/truncated|chunk/i);
    const corrupt = Buffer.from(fixture);
    corrupt[corrupt.length - 1] ^= 0xff;
    await expect(parseEXR(input(corrupt), { layer: "look", outputFormat: "rg" })).rejects.toThrow(/decode|checksum|data/i);
    await expect(parseEXR(input(), { layer: "look", outputFormat: "rg", maxPixels: 512, maxInputBytes: fixture.byteLength })).resolves.toMatchObject({ width, height });
  });
});
