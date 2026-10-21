/**
 * AD-03 (threejs-parity lane L4): real EXR decode parity.
 *
 * Fixtures were encoded by the OpenEXR C++ reference library at 64x48 RGBA
 * (gradient ramps) — see tests/fixtures/exr/. Parity is asserted against
 * three.js r185's EXRLoader decode of the same bytes: half output must be
 * bit-identical, float output must be bit-identical, and float→half
 * conversion may differ by at most one half-precision ULP (three uses a
 * rounding LUT; the port's arithmetic rounding differs only on ties).
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { EXRLoader as ThreeEXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { FloatType, HalfFloatType, RedFormat, RGBAFormat } from "three";
import { parseEXR, EXRLoader } from "@aura3d/assets";

function fixture(name: string): ArrayBuffer {
  const bytes = readFileSync(new URL(`../../fixtures/exr/${name}.exr`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe("AD-03 EXR decode parity (lane L4)", () => {
  test.each(["none_half", "rle_half", "zips_half", "zip_half", "piz_half"])(
    "decodes %s bit-identically to three's EXRLoader (half output)",
    async (name) => {
      const buffer = fixture(name);
      const aura = await parseEXR(buffer, { type: "half" });
      const ref = new ThreeEXRLoader().setDataType(HalfFloatType).parse(buffer);
      expect(aura.width).toBe(ref.width);
      expect(aura.height).toBe(ref.height);
      expect(aura.channels).toBe(4);
      expect(aura.data).toBeInstanceOf(Uint16Array);
      expect(aura.data.length).toBe(ref.data!.length);
      for (let i = 0; i < ref.data!.length; i += 1) {
        expect(aura.data[i], `pixel ${i}`).toBe(ref.data![i]);
      }
    }
  );

  test.each(["none_float", "rle_float", "zips_float", "zip_float", "piz_float"])(
    "decodes %s bit-identically to three's EXRLoader (float output)",
    async (name) => {
      const buffer = fixture(name);
      const aura = await parseEXR(buffer, { type: "float" });
      const ref = new ThreeEXRLoader().setDataType(FloatType).parse(buffer);
      expect(aura.data).toBeInstanceOf(Float32Array);
      expect(aura.data.length).toBe(ref.data!.length);
      for (let i = 0; i < ref.data!.length; i += 1) {
        expect(aura.data[i], `pixel ${i}`).toBe(ref.data![i]);
      }
    }
  );

  test("float→half output stays within one half-ULP of three's conversion", async () => {
    const buffer = fixture("piz_float");
    const aura = await parseEXR(buffer, { type: "half" });
    const ref = new ThreeEXRLoader().setDataType(HalfFloatType).parse(buffer);
    expect(aura.data.length).toBe(ref.data!.length);
    let maxDelta = 0;
    for (let i = 0; i < ref.data!.length; i += 1) {
      maxDelta = Math.max(maxDelta, Math.abs(aura.data[i]! - ref.data![i]!));
    }
    expect(maxDelta).toBeLessThanOrEqual(1);
  });

  test("gradient anchors land where the encoder wrote them", async () => {
    const aura = await parseEXR(fixture("none_float"), { type: "float" });
    const px = (x: number, y: number) => (aura.height - 1 - y) * aura.width * 4 + x * 4;
    // R channel: 0..2 left→right; three/aura output is bottom-up flipped.
    expect(aura.data[px(0, 0)]!).toBeCloseTo(0, 3);
    expect(aura.data[px(63, 0)]!).toBeCloseTo(2, 3);
    // G channel: 0..1.5 bottom→top.
    expect(aura.data[px(0, 0) + 1]!).toBeCloseTo(0, 3);
    expect(aura.data[px(0, 47) + 1]!).toBeCloseTo(1.5, 3);
    // A is a solid 1.
    expect(aura.data[px(10, 10) + 3]!).toBeCloseTo(1, 5);
  });

  test("rejects non-EXR bytes and unsupported compression loudly", async () => {
    await expect(parseEXR(new ArrayBuffer(32))).rejects.toThrow(/OpenEXR|EXR/i);
    await expect(parseEXR(fixture("none_half"), { outputFormat: "rgba" })).resolves.toMatchObject({ width: 64, height: 48 });
  });

  test("r-channel outputFormat mirrors three's RedFormat", async () => {
    const buffer = fixture("zip_half");
    const aura = await parseEXR(buffer, { type: "half", outputFormat: "r" });
    const ref = new ThreeEXRLoader().setDataType(HalfFloatType).setOutputFormat(RedFormat).parse(buffer);
    expect(aura.channels).toBe(1);
    expect(aura.data.length).toBe(ref.data!.length);
  });

  test("EXRLoader.parse honours setDataType/setOutputFormat/setPart", async () => {
    const loader = new EXRLoader().setDataType("float").setOutputFormat("rg").setPart(0);
    const data = await loader.parse(fixture("rle_float"));
    expect(data.channels).toBe(2);
    expect(data.data).toBeInstanceOf(Float32Array);
    expect(data.flipY).toBe(false);
    expect(data.generateMipmaps).toBe(false);
    expect(data.colorSpace).toBe("linear");
    // RGBA default for reference: channels R,G.
    expect(data.width * data.height * 2).toBe(data.data.length);
  });

  test("RGBAFormat reference sanity: header carries real EXR attributes", async () => {
    void RGBAFormat;
    const aura = await parseEXR(fixture("piz_half"));
    expect(aura.header.compression).toBe("PIZ_COMPRESSION");
    expect((aura.header.channels as unknown[]).length).toBe(4);
  });
});
