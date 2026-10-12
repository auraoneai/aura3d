/**
 * lighting + compiler game darkening (#979 round 3, run 38182457655) — the
 * HDRI behind every C-09 HDRI probe decoded ~256× too dark, and an Ultra-tier
 * HDRI probe ran a 1024-face CPU GGX prefilter on the main thread before the
 * first draw.
 *
 *  - decodeHdrEquirect matches three r185's HDRLoader (m · 2^(e−128) / 255);
 *  - the pinned kloppenheim_06_puresky_1k decodes to sky-level radiance;
 *  - HDRI probes use three's PMREM sizing (equirect width / 4), ≤ 256 while
 *    the prefilter is CPU-only;
 *  - the re-baked HDR presets carry real (not 1/256) irradiance.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeHdrEquirect } from "../../../../packages/rendering/src/environment/HdrEquirect";
import { hdriProbeFaceSize } from "../../../../packages/rendering/src/environment/EnvironmentCache";

/** Minimal flat (non-RLE) Radiance file: width × 1 scanline of RGBE pixels. */
function radiance(pixels: readonly (readonly [number, number, number, number])[]): Uint8Array {
  const header = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X ${pixels.length}\n`);
  const out = new Uint8Array(header.length + pixels.length * 4);
  out.set(header, 0);
  pixels.forEach((p, i) => out.set(p, header.length + i * 4));
  return out;
}

describe("RGBE decode matches three r185 HDRLoader", () => {
  it("m · 2^(e−128) / 255 per channel; e = 0 is black", () => {
    const img = decodeHdrEquirect(radiance([[128, 64, 255, 129], [10, 20, 30, 0], [200, 100, 50, 136]]));
    const three = (m: number, e: number) => (m * 2 ** (e - 128)) / 255;
    expect(img.data[0]).toBeCloseTo(three(128, 129), 6);
    expect(img.data[1]).toBeCloseTo(three(64, 129), 6);
    expect(img.data[2]).toBeCloseTo(three(255, 129), 6);
    expect(Array.from(img.data.slice(3, 6))).toEqual([0, 0, 0]);
    expect(img.data[6]).toBeCloseTo(three(200, 136), 4);
  });

  it("the pinned kloppenheim_06_puresky_1k decodes to sky radiance, not 1/256 of it", () => {
    const img = decodeHdrEquirect(new Uint8Array(readFileSync("fixtures/environment-corpus/hdri/kloppenheim_06_puresky_1k.hdr")));
    let max = 0;
    let sum = 0;
    for (const v of img.data) {
      max = Math.max(max, v);
      sum += v;
    }
    expect(max).toBeGreaterThan(8); // was 0.127 with the double /256
    expect(sum / img.data.length).toBeGreaterThan(0.2); // was 0.0024
  });
});

describe("HDRI probe face size (three PMREM sizing, CPU-prefilter cap)", () => {
  it("1k equirect → 256 at High/Ultra, tier-limited at Low", () => {
    expect(hdriProbeFaceSize(1024, "ultra")).toBe(256);
    expect(hdriProbeFaceSize(1024, "high")).toBe(256);
    expect(hdriProbeFaceSize(2048, "ultra")).toBe(256);
    expect(hdriProbeFaceSize(1024, "low")).toBe(128);
    expect(hdriProbeFaceSize(256, "ultra")).toBe(128);
  });
});

describe("re-baked HDR presets carry real irradiance", () => {
  for (const name of ["studio", "outdoor", "sunset"] as const) {
    it(`${name}: SH9 DC is sky-level (> 1), not ~0.01`, () => {
      const bytes = readFileSync(`public/aura-environments/${name}.sh9.f32`);
      const sh9 = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      expect(sh9[0]).toBeGreaterThan(1);
    });
  }
});
