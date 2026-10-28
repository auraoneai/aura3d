import { describe, expect, it } from "vitest";
import { downsampleRgba } from "../../../packages/rendering/src/environment/probeBuild";
import { KTX2_MAGIC, readRgb9e5Cube, unpackRgb9e5 } from "../../../packages/rendering/src/environment/Rgb9e5Cube";

/** The pre-optimisation downsample, kept verbatim as the reference. */
function referenceDownsample(src: Float32Array, w: number, h: number): Float32Array {
  const nw = Math.max(1, w >> 1);
  const nh = Math.max(1, h >> 1);
  const out = new Float32Array(nw * nh * 4);
  for (let y = 0; y < nh; y += 1) {
    for (let x = 0; x < nw; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        let sum = 0;
        let count = 0;
        for (let dy = 0; dy < 2; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            const sx = Math.min(w - 1, x * 2 + dx);
            const sy = Math.min(h - 1, y * 2 + dy);
            sum += src[(sy * w + sx) * 4 + c]!;
            count += 1;
          }
        }
        out[(y * nw + x) * 4 + c] = sum / count;
      }
    }
  }
  return out;
}

describe("probe build (first-frame cost): bit-exact rewrites", () => {
  it("downsampleRgba matches the naive 2x2 loop, including odd and 1-pixel edges", () => {
    let seed = 99;
    const next = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    for (const [w, h] of [[256, 128], [8, 4], [5, 3], [1, 1], [2, 1], [1, 6]] as const) {
      const src = new Float32Array(w * h * 4).map(() => Math.fround(next() * 40));
      const got = downsampleRgba(src, w, h);
      expect(Array.from(got.data)).toEqual(Array.from(referenceDownsample(src, w, h)));
    }
  });

  it("readRgb9e5Cube decodes exactly like unpackRgb9e5", () => {
    const size = 4;
    const texelsPerFace = size * size;
    const words = new Uint32Array(6 * texelsPerFace);
    let seed = 7;
    for (let i = 0; i < words.length; i += 1) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; words[i] = seed; }
    const bytes = new Uint8Array(92 + words.byteLength);
    bytes.set(KTX2_MAGIC, 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(12, 142, true); // vkFormat E5B9G9R9
    view.setUint32(16, 4, true); // typeSize
    view.setUint32(20, size, true);
    view.setUint32(24, size, true);
    view.setUint32(36, 6, true); // faceCount
    view.setUint32(40, 1, true); // levelCount
    view.setBigUint64(68, 92n, true); // level 0 byteOffset
    view.setBigUint64(76, BigInt(words.byteLength), true); // byteLength
    view.setBigUint64(84, BigInt(words.byteLength), true); // uncompressedByteLength
    bytes.set(new Uint8Array(words.buffer), 92);
    const cube = readRgb9e5Cube(bytes);
    for (let face = 0; face < 6; face += 1) {
      for (let t = 0; t < texelsPerFace; t += 1) {
        const [r, g, b] = unpackRgb9e5(words[face * texelsPerFace + t]!);
        const texel = cube.levels[0]![face]!.subarray(t * 4, t * 4 + 4);
        expect(Array.from(texel)).toEqual([Math.fround(r), Math.fround(g), Math.fround(b), 1]);
      }
    }
  });
});
