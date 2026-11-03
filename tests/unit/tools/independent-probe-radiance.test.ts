import { describe, expect, it } from "vitest";
import { decodeRadianceHdr } from "../../../tools/independent-probe-baker/hdr.js";

function file(text: string, payload: readonly number[] = []): Uint8Array {
  const header = new TextEncoder().encode(text);
  const bytes = new Uint8Array(header.length + payload.length);
  bytes.set(header);
  bytes.set(payload, header.length);
  return bytes;
}

function hdr(
  width: number,
  height: number,
  payload: readonly number[],
  lines: readonly string[] = [],
  signature = "#?RADIANCE",
): Uint8Array {
  return file(`${signature}\n${[...lines, "FORMAT=32-bit_rle_rgbe"].join("\n")}\n\n-Y ${height} +X ${width}\n`, payload);
}

/** Eight pixels, with split R literals, repeated G/B and literal exponents. */
function mixedRow8(): number[] {
  return [
    2, 2, 0, 8,
    1, 128, 7, 88, 0, 255, 16, 64, 192, 128,
    136, 64,
    136, 32,
    8, 129, 0, 129, 129, 129, 129, 129, 129,
  ];
}

function constantRow8(red: number, green: number, blue: number, exponent: number): number[] {
  return [2, 2, 0, 8, 136, red, 136, green, 136, blue, 136, exponent];
}

describe("independently authored Radiance HDR decoder", () => {
  it("decodes modern literal/repeat packets and reconstructs lower bin values", () => {
    const bytes = hdr(8, 2, [...mixedRow8(), ...constantRow8(32, 16, 8, 129)]);
    const before = bytes.slice();
    const result = decodeRadianceHdr(bytes, { reconstruction: "lower" });

    expect(result.width).toBe(8);
    expect(result.height).toBe(2);
    expect(result.data).toBeInstanceOf(Float32Array);
    expect(result.data).toHaveLength(8 * 2 * 3);
    expect(Array.from(result.data.slice(0, 3))).toEqual([1, 0.5, 0.25]);
    expect(Array.from(result.data.slice(3, 6))).toEqual([0, 0, 0]); // exponent 0
    expect(Array.from(result.data.slice(6, 9))).toEqual([0, 0.5, 0.25]);
    expect(Array.from(result.data.slice(9, 12))).toEqual([255 / 128, 0.5, 0.25]);
    expect(Array.from(result.data.slice(8 * 3, 8 * 3 + 3))).toEqual([0.25, 0.125, 0.0625]);
    expect(result.metadata.reconstruction).toBe("lower");
    expect(result.metadata.exposureMode).toBe("preserve");
    expect(result.metadata.colorSpace).toBe("rgb-unconverted");
    expect(bytes).toEqual(before);
  });

  it("uses the requested midpoint reconstruction but keeps exponent-zero pixels black", () => {
    const bytes = hdr(8, 1, mixedRow8(), [], "#?RGBE");
    const result = decodeRadianceHdr(bytes, { reconstruction: "midpoint" });
    expect(Array.from(result.data.slice(0, 3))).toEqual([128.5 / 128, 64.5 / 128, 32.5 / 128]);
    expect(Array.from(result.data.slice(3, 6))).toEqual([0, 0, 0]);
    expect(Array.from(result.data.slice(6, 9))).toEqual([0.5 / 128, 64.5 / 128, 32.5 / 128]);
    expect(result.metadata.reconstruction).toBe("midpoint");
  });

  it("supports the maximum literal and repeat packet lengths", () => {
    const payload = [
      2, 2, 0, 128,
      128, ...Array(128).fill(128),
      255, 64, 129, 32, // repeat 127, then repeat 1
      128, ...Array(128).fill(32),
      128, ...Array(128).fill(129),
    ];
    const result = decodeRadianceHdr(hdr(128, 1, payload), { reconstruction: "lower" });
    expect(result.width).toBe(128);
    expect(Array.from(result.data.slice(0, 3))).toEqual([1, 0.5, 0.25]);
    expect(Array.from(result.data.slice(126 * 3, 127 * 3))).toEqual([1, 0.5, 0.25]);
    expect(Array.from(result.data.slice(127 * 3, 128 * 3))).toEqual([1, 0.25, 0.25]);
  });

  it("records cumulative exposure and removes it only when requested", () => {
    const bytes = hdr(8, 1, constantRow8(128, 64, 32, 129), [
      "EXPOSURE=2",
      "EXPOSURE=4",
      " EXPOSURE=64", // Only left-justified variables affect metadata.
    ]);
    const preserved = decodeRadianceHdr(bytes, { reconstruction: "lower" });
    const removed = decodeRadianceHdr(bytes, { reconstruction: "lower", exposure: "remove" });
    expect(preserved.metadata.exposure).toBe(8);
    expect(removed.metadata.exposure).toBe(8);
    expect(preserved.metadata.exposureMode).toBe("preserve");
    expect(removed.metadata.exposureMode).toBe("remove");
    expect(Array.from(preserved.data.slice(0, 3))).toEqual([1, 0.5, 0.25]);
    expect(Array.from(removed.data.slice(0, 3))).toEqual([0.125, 0.0625, 0.03125]);
    expect(preserved.metadata.headerLines).toContain(" EXPOSURE=64");
  });

  it("preserves color metadata without assuming primaries or applying COLORCORR", () => {
    const primaries = [0.64, 0.33, 0.3, 0.6, 0.15, 0.06, 0.3127, 0.329];
    const bytes = hdr(8, 1, constantRow8(128, 64, 32, 129), [
      "EXPOSURE=2",
      "COLORCORR=2 3 4",
      "COLORCORR=0.5 1 2",
      `PRIMARIES=${primaries.join(" ")}`,
      "GAMMA=2.2",
    ]);
    const result = decodeRadianceHdr(bytes, { reconstruction: "lower" });
    expect(result.metadata.colorSpace).toBe("rgb-unconverted");
    expect(result.metadata.exposure).toBe(2);
    expect(result.metadata.colorCorrections).toEqual([[2, 3, 4], [0.5, 1, 2]]);
    expect(result.metadata.primaries).toEqual(primaries);
    expect(result.metadata.gamma).toBe(2.2);
    expect(result.metadata.headerLines).toContain("COLORCORR=2 3 4");
    expect(Array.from(result.data.slice(0, 3))).toEqual([1, 0.5, 0.25]);
    expect(() => decodeRadianceHdr(bytes, { reconstruction: "lower", exposure: "remove" })).toThrow();
  });

  it("rejects malformed headers, unsupported orientations and old RLE", () => {
    const row = mixedRow8();
    expect(() => decodeRadianceHdr(hdr(8, 1, row, [], "#?INVALID"), { reconstruction: "lower" })).toThrow();
    expect(() => decodeRadianceHdr(file("#?RADIANCE\n\n-Y 1 +X 8\n", row), { reconstruction: "lower" })).toThrow();
    expect(() => decodeRadianceHdr(file("#?RADIANCE\nFORMAT=other\n\n-Y 1 +X 8\n", row), { reconstruction: "lower" })).toThrow();
    expect(() => decodeRadianceHdr(file("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n+Y 1 +X 8\n", row), { reconstruction: "lower" })).toThrow();
    expect(() => decodeRadianceHdr(file("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 -X 8\n", row), { reconstruction: "lower" })).toThrow();
    expect(() => decodeRadianceHdr(hdr(0, 1, row), { reconstruction: "lower" })).toThrow();
    expect(() => decodeRadianceHdr(hdr(8, 0, row), { reconstruction: "lower" })).toThrow();
    expect(() => decodeRadianceHdr(hdr(2, 1, [1, 1, 1, 2, 128, 64, 32, 129]), { reconstruction: "lower" })).toThrow();
  });

  it("rejects truncated, zero-length, overrun and mismatched-width scanline packets", () => {
    const marker = [2, 2, 0, 8];
    for (const payload of [
      [2, 2, 0], // truncated scanline marker
      [2, 2, 0, 7], // marker width differs from the resolution
      [...marker, 0], // zero-length packet
      [...marker, 136], // repeated value missing
      [...marker, 8, 1, 2, 3], // literal values missing
      [...marker, 9, ...Array(9).fill(1)], // literal overruns scanline
      [...marker, 137, 1], // repeat overruns scanline
      [...marker, 136, 1, 136], // second channel repeat missing value
    ]) {
      expect(() => decodeRadianceHdr(hdr(8, 1, payload), { reconstruction: "lower" })).toThrow();
    }
  });

  it("enforces explicit reconstruction, exposure and small caller-provided budgets", () => {
    const bytes = hdr(8, 1, mixedRow8());
    expect(() => decodeRadianceHdr(bytes, {} as { reconstruction: "lower" })).toThrow();
    expect(() => decodeRadianceHdr(bytes, { reconstruction: "upper" as unknown as "lower" })).toThrow();
    expect(() => decodeRadianceHdr(bytes, { reconstruction: "lower", exposure: "auto" as unknown as "preserve" })).toThrow();
    expect(() => decodeRadianceHdr(bytes, { reconstruction: "lower", maxInputBytes: bytes.length - 1 })).toThrow();
    expect(() => decodeRadianceHdr(bytes, { reconstruction: "lower", maxHeaderBytes: 10 })).toThrow();
    expect(() => decodeRadianceHdr(bytes, { reconstruction: "lower", maxPixels: 7 })).toThrow();
    expect(() => decodeRadianceHdr(bytes, { reconstruction: "lower", maxDecodedBytes: 8 * 3 * 4 - 1 })).toThrow();
  });
});
