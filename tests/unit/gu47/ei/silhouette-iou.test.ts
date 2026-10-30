import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  borderColor,
  crc32,
  decodePng,
  encodePng,
  iou,
  maskFromImage,
  normalizeMask,
  pairwiseIou
  // @ts-expect-error plain ESM tool without types
} from "../../../../tools/look-metrics/silhouette-iou.mjs";

const SCRIPT = join(process.cwd(), "tools/look-metrics/silhouette-iou.mjs");
const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "silhouette-")); dirs.push(d); return d; };

/** RGBA image with a filled shape on a flat background (or transparent when bg is null). */
function image(w: number, h: number, inside: (x: number, y: number) => boolean, fg = [220, 40, 40], bg: number[] | null = [20, 30, 40]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const on = inside(x, y);
    const c = on ? fg : bg ?? [0, 0, 0];
    data[o] = c[0]!; data[o + 1] = c[1]!; data[o + 2] = c[2]!; data[o + 3] = on || bg ? 255 : 0;
  }
  return { width: w, height: h, data };
}
const rect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** Minimal PNG writer for colour types other than RGBA, to exercise the decoder. */
function pngOf(width: number, height: number, type: number, rows: number[][], extra: Array<[string, Buffer]> = []) {
  const chunk = (kind: string, body: Buffer) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(kind, 4, "latin1");
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = type;
  const raw = Buffer.concat(rows.map((r, y) => Buffer.from([y % 2 ? 2 : 0, ...r.map((v, i) => (y % 2 ? (v - (rows[y - 1]![i] ?? 0) + 256) & 255 : v))])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), ...extra.map(([k, b]) => chunk(k, b)), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

describe("silhouette-iou: PNG codec", () => {
  it("round-trips RGBA through encodePng/decodePng", () => {
    const img = image(7, 5, rect(1, 1, 4, 3), [200, 100, 50], null);
    const back = decodePng(encodePng(img));
    expect(back.width).toBe(7);
    expect(Array.from(back.data)).toEqual(Array.from(img.data));
  });

  it("decodes gray, RGB and palette (with tRNS) images and the Up filter", () => {
    const gray = decodePng(pngOf(2, 2, 0, [[0, 255], [128, 64]]));
    expect(Array.from(gray.data.slice(0, 8))).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(gray.data[8]).toBe(128);
    const rgb = decodePng(pngOf(1, 2, 2, [[10, 20, 30], [40, 50, 60]]));
    expect(Array.from(rgb.data)).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
    const pal = decodePng(pngOf(2, 1, 3, [[0, 1]], [["PLTE", Buffer.from([1, 2, 3, 4, 5, 6])], ["tRNS", Buffer.from([0])]]));
    expect(Array.from(pal.data)).toEqual([1, 2, 3, 0, 4, 5, 6, 255]);
  });

  it("rejects JPEG and interlaced input with a clear message", () => {
    expect(() => decodePng(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toThrow(/not a PNG/);
    const png = pngOf(1, 1, 2, [[1, 2, 3]]);
    png[8 + 8 + 12] = 1; // IHDR interlace byte
    expect(() => decodePng(png)).toThrow();
  });
});

describe("silhouette-iou: masks and IoU", () => {
  it("keys out the border colour, or uses alpha when the image has transparency", () => {
    const keyed = maskFromImage(image(10, 10, rect(2, 2, 5, 5)));
    expect(keyed.mode).toBe("key");
    expect(keyed.count).toBe(16);
    expect(keyed.bbox).toEqual({ x0: 2, y0: 2, x1: 5, y1: 5 });
    expect(borderColor(image(10, 10, rect(2, 2, 5, 5)))).toEqual([20, 30, 40]);
    const alpha = maskFromImage(image(10, 10, rect(0, 0, 9, 4), [20, 30, 40], null));
    expect(alpha.mode).toBe("alpha");
    expect(alpha.count).toBe(50);
  });

  it("identical shapes give 1, disjoint 0, a half overlap 1/3; scale and position are normalised away", () => {
    const a = maskFromImage(image(20, 20, rect(0, 0, 9, 9)));
    const b = maskFromImage(image(20, 20, rect(5, 0, 14, 9)));
    const c = maskFromImage(image(20, 20, rect(10, 10, 19, 19)));
    expect(iou(a, a)).toBe(1);
    expect(iou(a, c)).toBe(0);
    expect(iou(a, b)).toBeCloseTo(1 / 3, 6);
    const small = normalizeMask(maskFromImage(image(40, 40, rect(3, 3, 12, 22))), 64);
    const big = normalizeMask(maskFromImage(image(80, 80, rect(40, 10, 59, 49))), 64);
    expect(iou(small, big)).toBe(1);
    expect(() => iou(a, normalizeMask(a, 32))).toThrow(/sizes differ/);
  });

  it("pairwiseIou lists every pair, worst first", () => {
    const square = normalizeMask(maskFromImage(image(20, 20, rect(2, 2, 17, 17))));
    const bar = normalizeMask(maskFromImage(image(20, 20, rect(0, 8, 19, 11))));
    const res = pairwiseIou([{ name: "square", mask: square }, { name: "bar", mask: bar }, { name: "square2", mask: square }]);
    expect(res.pairs).toHaveLength(3);
    expect(res.max).toMatchObject({ a: "square", b: "square2", iou: 1 });
    expect(res.matrix[0][1]).toBeLessThan(0.3);
  });

  it("CLI: --max fails a too-similar pair (exit 1), passes distinct ones and writes masks", () => {
    const dir = tmp();
    writeFileSync(join(dir, "a.png"), encodePng(image(30, 30, rect(5, 5, 24, 24))));
    writeFileSync(join(dir, "b.png"), encodePng(image(30, 30, (x, y) => (x - 15) ** 2 + (y - 15) ** 2 <= 100)));
    writeFileSync(join(dir, "c.png"), encodePng(image(30, 30, rect(0, 13, 29, 16))));
    const out = execFileSync(process.execPath, [SCRIPT, join(dir, "a.png"), join(dir, "c.png"), "--max", "0.6", "--masks", join(dir, "m")], { encoding: "utf8" });
    expect(out).toContain("pass: every pair <= 0.6");
    expect(existsSync(join(dir, "m", "a.mask.png"))).toBe(true);
    let code = 0;
    try { execFileSync(process.execPath, [SCRIPT, join(dir, "a.png"), join(dir, "b.png"), "--max", "0.6", "--json"], { stdio: "pipe" }); } catch (e) { code = (e as { status: number }).status; }
    expect(code).toBe(1);
    let usage = 0;
    try { execFileSync(process.execPath, [SCRIPT, join(dir, "a.png")], { stdio: "pipe" }); } catch (e) { usage = (e as { status: number }).status; }
    expect(usage).toBe(2);
  });
});
