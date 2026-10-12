/**
 * PRD-02 §6.2: Radiance RGBE decode scale. value = mantissa · 2^(e − 136)
 * (three.js RGBELoader: (m / 256) · 2^(e − 128)). The C-09 decoder divided by
 * 256 once more, so every HDRI probe was 256× too dark (azure-gpu run
 * 38187586433: real PMREM mean luma 0.0039× the three.js r185 reference).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeHdrEquirect } from "../../../../packages/rendering/src/environment/HdrEquirect";

function flatHdr(width: number, pixels: readonly (readonly [number, number, number, number])[]): Uint8Array {
  const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X ${width}\n`;
  const head = new TextEncoder().encode(header);
  const out = new Uint8Array(head.length + pixels.length * 4 + 32);
  out.set(head, 0);
  pixels.forEach((px, i) => out.set(px, head.length + i * 4));
  return out;
}

describe("prd02 RGBE decode scale", () => {
  it("(128,128,128,e=129) decodes to 1.0 and (255,64,0,e=136) to (255,64,0)", () => {
    const img = decodeHdrEquirect(flatHdr(2, [[128, 128, 128, 129], [255, 64, 0, 136]]));
    expect(Array.from(img.data.slice(0, 3))).toEqual([1, 1, 1]);
    expect(Array.from(img.data.slice(3, 6))).toEqual([255, 64, 0]);
  });

  it("the studio_small_08 HDRI decodes to a plausible radiance range (mean luma 0.05..5)", () => {
    const img = decodeHdrEquirect(new Uint8Array(readFileSync("fixtures/environment-corpus/hdri/studio_small_08_1k.hdr")));
    let sum = 0;
    for (let i = 0; i < img.data.length; i += 3) sum += 0.2126 * img.data[i]! + 0.7152 * img.data[i + 1]! + 0.0722 * img.data[i + 2]!;
    const mean = sum / (img.data.length / 3);
    expect(mean).toBeGreaterThan(0.05);
    expect(mean).toBeLessThan(5);
  });
});
