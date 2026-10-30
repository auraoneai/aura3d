import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { glMetaInPage, glPairInPage, type DecodedFrame, type FrameDecoder, type GlMetaResult } from "../../../browser/game-luma-stats";

type Rgb = readonly [number, number, number];

function frameOf(w: number, h: number, color: (x: number, y: number) => Rgb, jpeg?: string): DecodedFrame {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = color(x, y);
    const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { width: w, height: h, data, ...(jpeg ? { jpeg: () => jpeg } : {}) };
}
const decoderOf = (frames: Record<string, DecodedFrame>): FrameDecoder => async (key) => {
  const f = frames[key];
  if (!f) throw new Error(`no frame ${key}`);
  return f;
};
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The GL_META stats loop of the 4.6 spec (tests/browser/game-luma-capture.spec.ts:36-63 at f797808be), on raw RGBA. */
function v1Reference(d: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  const hist = new Uint32Array(256);
  const grid = new Float64Array(9);
  const gridN = new Uint32Array(9);
  let sum = 0, dark = 0, clip = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
    hist[y]!++; sum += y;
    if (y <= 8) dark++;
    if (y >= 250) clip++;
    const p = i / 4;
    const gx = Math.min(2, Math.floor(((p % width) * 3) / width));
    const gy = Math.min(2, Math.floor((Math.floor(p / width) * 3) / height));
    grid[gy * 3 + gx]! += y; gridN[gy * 3 + gx]!++;
  }
  const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
  return {
    mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95),
    darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4),
    grid: Array.from(grid, (v, k) => +(v / Math.max(1, gridN[k]!)).toFixed(1))
  };
}

const g = globalThis as unknown as Record<string, unknown>;
afterEach(() => { delete g.__AURA_QA__; delete g.__AURA_TEST_GAME__; delete g.__AURA_TEST_GAME_ERROR__; });

/** Nine flat cells of a 30x18 frame (10x6 px each), row-major. */
const CELL_COLORS: readonly Rgb[] = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [128, 128, 128], [255, 128, 0], [0, 0, 0], [255, 255, 255], [255, 0, 255]];
const cellsFrame = (): DecodedFrame => frameOf(30, 18, (x, y) => CELL_COLORS[Math.floor(y / 6) * 3 + Math.floor(x / 10)]!);

describe("GL_META v1 fields are unchanged", () => {
  it("match the 4.6 computation exactly on noise, gradients and sizes not divisible by 3", async () => {
    const r = rng(7);
    const cases = [
      frameOf(101, 67, () => [Math.floor(r() * 256), Math.floor(r() * 256), Math.floor(r() * 256)]),
      frameOf(1280, 720, (x, y) => [(x * 7) % 256, (y * 3) % 256, (x + y) % 256]),
      frameOf(5, 4, () => [3, 3, 3])
    ];
    for (const f of cases) {
      const { v1 } = await glMetaInPage({ png: "f" }, decoderOf({ f }));
      expect(v1).toEqual(v1Reference(f.data, f.width, f.height));
    }
  });

  it("keeps the v1 key order and appends v2 after info, as the spec logs it", async () => {
    const f = cellsFrame();
    const meta = await glMetaInPage({ png: "f" }, decoderOf({ f }));
    const row = { target: "g--a", id: "settle-25s", slug: "g", variant: "a", sinceReadyMs: 25000, ...meta.v1, info: { app: true }, ...meta.v2 };
    const keys = Object.keys(row);
    expect(keys.slice(0, 13)).toEqual(["target", "id", "slug", "variant", "sinceReadyMs", "mean", "p5", "p50", "p95", "darkFrac", "clipFrac", "grid", "info"]);
    expect(keys[13]).toBe("gl");
    expect(Object.keys(meta.v1).some((k) => k in meta.v2)).toBe(false);
  });
});

describe("GL_META v2 per-frame and per-cell statistics", () => {
  it("reports mean RGB, HSV hue, saturation and chroma per cell", async () => {
    const { v2 } = await glMetaInPage({ png: "f" }, decoderOf({ f: cellsFrame() }));
    expect(v2.gl).toBe(2);
    expect([v2.w, v2.h]).toEqual([30, 18]);
    expect(v2.cells.map((c) => c.rgb)).toEqual(CELL_COLORS);
    expect(v2.cells.map((c) => c.hue)).toEqual([0, 120, 240, 60, null, 30.1, null, null, 300]);
    expect(v2.cells[0]).toMatchObject({ std: 0, sat: 1, chroma: 255, hueR: 1, darkFrac: 0 });
    expect(v2.cells[4]).toMatchObject({ hue: null, sat: 0, chroma: 0, hueR: 0, mean: 128 });
    expect(v2.cells[6]).toMatchObject({ mean: 0, darkFrac: 1, p95: 0 });
    expect(v2.cells[7]).toMatchObject({ mean: 255, clipFrac: 1, p5: 255 });
    expect(v2.blank).toBe(false);
    expect(v2.canvas).toEqual({ x: 0, y: 0, w: 30, h: 18 });
  });

  it("averages hue on the circle (350 and 10 deg mean 0, not 180) and reports its concentration", async () => {
    // (255,0,43) is about 350 deg, (255,43,0) about 10 deg; equal chroma
    const f = frameOf(12, 12, (x) => (x % 2 ? [255, 0, 43] : [255, 43, 0]));
    const { v2 } = await glMetaInPage({ png: "f" }, decoderOf({ f }));
    expect(Math.min(v2.hue!, 360 - v2.hue!)).toBeLessThan(0.6);
    expect(v2.hueR).toBeGreaterThan(0.98);
    const mixed = frameOf(12, 12, (x) => (x % 2 ? [255, 0, 0] : [0, 255, 255]));
    expect((await glMetaInPage({ png: "f" }, decoderOf({ f: mixed }))).v2.hueR).toBeLessThan(0.01);
  });

  it("measures stddev, percentiles and sharpness (Laplacian variance, edge density)", async () => {
    const flat = await glMetaInPage({ png: "f" }, decoderOf({ f: frameOf(24, 24, () => [90, 90, 90]) }));
    expect(flat.v2).toMatchObject({ std: 0, lap: 0, edge: 0 });
    expect(flat.v2.blank).toBe(true);
    const checker = await glMetaInPage({ png: "f" }, decoderOf({ f: frameOf(24, 24, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0])) }));
    expect(checker.v2.std).toBeCloseTo(127.5, 1);
    expect(checker.v2.lap).toBeCloseTo(1020 * 1020, -2);
    expect(checker.v2.edge).toBe(1);
    expect(checker.v2.cells.every((c) => c.lap > 1e6)).toBe(true);
    const ramp = await glMetaInPage({ png: "f" }, decoderOf({ f: frameOf(100, 3, (x) => [x * 2, x * 2, x * 2]) }));
    expect(ramp.v2.p1).toBeLessThanOrEqual(ramp.v1.p5);
    expect(ramp.v2.p99).toBeGreaterThanOrEqual(ramp.v1.p95);
    expect(ramp.v2.hist.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 3);
    expect(ramp.v2.hueHist).toBeNull();
    const black = await glMetaInPage({ png: "f" }, decoderOf({ f: frameOf(9, 9, () => [0, 0, 0]) }));
    expect(black.v2.blank).toBe(true);
  });

  it("fills a 12-bin chroma-weighted hue histogram centred on 0, 30, ..., 330 deg", async () => {
    const { v2 } = await glMetaInPage({ png: "f" }, decoderOf({ f: cellsFrame() }));
    const h = v2.hueHist!;
    expect(h).toHaveLength(12);
    expect(h.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 2);
    // red, green, blue, yellow, magenta at 255 chroma; orange at 255
    for (const bin of [0, 4, 8, 2, 10, 1]) expect(h[bin]).toBeCloseTo(1 / 6, 2);
  });
});

describe("crops (window.__AURA_QA__.crops and QA hook extras)", () => {
  it("reads hook crops (array or function) before target crops, first name wins, and resolves them to pixels", async () => {
    g.__AURA_QA__ = { crops: () => [{ name: "red", x: 0, y: 0, w: 1 / 3, h: 1 / 3 }] };
    g.__AURA_TEST_GAME__ = { crops: [{ name: "red", x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, { name: "grey", x: 1 / 3, y: 1 / 3, w: 1 / 3, h: 1 / 3 }] };
    g.__AURA_TEST_GAME_ERROR__ = "boot error string";
    const meta = await glMetaInPage({ png: "f", crops: [{ name: "grey", x: 0, y: 0, w: 1, h: 1 }, { name: "white", x: 1 / 3, y: 2 / 3, w: 1 / 3, h: 1 / 3 }] }, decoderOf({ f: cellsFrame() }));
    expect(Object.keys(meta.v2.crops)).toEqual(["red", "grey", "white"]);
    expect(meta.v2.crops.red).toMatchObject({ x: 0, y: 0, w: 10, h: 6, from: "__AURA_QA__", rgb: [255, 0, 0], hue: 0 });
    expect(meta.v2.crops.grey).toMatchObject({ x: 10, y: 6, w: 10, h: 6, from: "__AURA_TEST_GAME__", mean: 128 });
    expect(meta.v2.crops.white).toMatchObject({ from: "target", mean: 255, clipFrac: 1 });
    expect(meta.v2.crops.red!.hist).toHaveLength(32);
    expect(meta.rects.map((r) => r.name)).toEqual(["red", "grey", "white"]);
    expect(meta.v2.cropErrors).toBeUndefined();
  });

  it("clamps rects to 0..1, reports bad names, bad numbers, throwing hooks and more than 16 crops, and never throws", async () => {
    g.__AURA_QA__ = { get crops() { throw new Error("boom"); } };
    const many = Array.from({ length: 18 }, (_, i) => ({ name: `c${i}`, x: 0, y: 0, w: 0.5, h: 0.5 }));
    const meta = await glMetaInPage({
      png: "f",
      crops: [{ name: "edge", x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, { name: "Bad Name", x: 0, y: 0, w: 1, h: 1 }, { name: "nan", x: Number.NaN, y: 0, w: 1, h: 1 }, { name: "gone", x: 2, y: 2, w: 1, h: 1 }, ...many]
    }, decoderOf({ f: cellsFrame() }));
    expect(meta.v2.crops.edge).toMatchObject({ x: 27, y: 16, w: 3, h: 2 });
    expect(Object.keys(meta.v2.crops)).toHaveLength(16);
    const errors = meta.v2.cropErrors!.join("\n");
    for (const text of ["__AURA_QA__.crops threw", "bad crop name \"Bad Name\"", "crop nan needs finite", "crop gone is empty", "at most 16 crops"]) expect(errors).toContain(text);
  });
});

describe("GL_PAIR frame difference", () => {
  it("is zero with SSIM 1 for identical shots and localises a change to its cell and crop", async () => {
    const base = (x: number, y: number): Rgb => [(x * 9 + y) % 200, (x + y * 5) % 200, 60];
    const a = frameOf(48, 48, base);
    const b = frameOf(48, 48, (x, y) => { const c = base(x, y); return x >= 16 && x < 32 && y >= 16 && y < 32 ? [c[0] + 40, c[1] + 40, c[2] + 40] : c; }, "JPEGB");
    const rects = [{ name: "mid", x: 16, y: 16, w: 16, h: 16, from: "target" }, { name: "corner", x: 0, y: 0, w: 8, h: 8, from: "target" }];
    const same = await glPairInPage({ a: "a", b: "a", rects }, decoderOf({ a }));
    expect(same.diff).toMatchObject({ meanAbsY: 0, meanAbsRGB: 0, changedFrac: 0, ssim: 1, maxAbsY: 0 });
    const moved = await glPairInPage({ a: "a", b: "b", rects }, decoderOf({ a, b }));
    expect(moved.jpeg).toBe("JPEGB");
    expect(moved.diff.cells[4]).toMatchObject({ meanAbsY: 40, changedFrac: 1 });
    expect(moved.diff.cells[4]!.ssim!).toBeLessThan(1);
    for (const i of [0, 1, 2, 3, 5, 6, 7, 8]) expect(moved.diff.cells[i]).toMatchObject({ meanAbsY: 0, changedFrac: 0, ssim: 1 });
    expect(moved.diff.crops.mid).toMatchObject({ meanAbsY: 40, meanAbsRGB: 40, changedFrac: 1 });
    expect(moved.diff.crops.corner).toMatchObject({ meanAbsY: 0, ssim: 1 });
    expect(moved.diff.maxAbsY).toBe(40);
    expect(moved.diff.meanAbsY).toBeCloseTo(40 / 9, 2);
    await expect(glPairInPage({ a: "a", b: "c", rects: [] }, decoderOf({ a, c: frameOf(8, 8, () => [0, 0, 0]) }))).rejects.toThrow(/differ in size/);
  });
});

describe("evidence/audit-fix/e5 decoders read GL_META v2 logs unchanged", () => {
  it("decode-luma writes the frames (pair shot included) and the v1 table; compare-luma pairs the rows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gl-meta-v2-"));
    try {
      const f = cellsFrame();
      const meta = await glMetaInPage({ png: "f" }, decoderOf({ f }));
      const pairDiff = (await glPairInPage({ a: "f", b: "f", rects: meta.rects }, decoderOf({ f }))).diff;
      const jpeg = Buffer.from("not really a jpeg").toString("base64");
      const row = { target: "g--a", id: "settle-60s", slug: "g", variant: "a", sinceReadyMs: 60000, ...meta.v1, info: { app: true, renderPath: "hdr-msaa", drawCalls: 12, texPending: 0 }, ...meta.v2 };
      const log = [
        `GL_META ${JSON.stringify(row)}`,
        `GL_JPG g--a settle-60s 1/2 ${jpeg.slice(0, 8)}`,
        `GL_JPG g--a settle-60s 2/2 ${jpeg.slice(8)}`,
        `GL_PAIR ${JSON.stringify({ target: "g--a", id: "settle-60s", gapMs: 600, elapsedMs: 650, diff: pairDiff })}`,
        `GL_JPG g--a settle-60s-pair 1/1 ${jpeg}`,
        "GL_LFS g--a /aura-assets/x.glb"
      ].join("\n");
      writeFileSync(join(dir, "acr-run.log"), `${log}\n`);
      const out = execFileSync(process.execPath, ["evidence/audit-fix/e5/decode-luma.mjs", `after=${join(dir, "acr-run.log")}`, "--out", dir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      expect(JSON.parse(out.trim())).toEqual({ label: "after", target: "g--a", shot: "settle-60s", mean: meta.v1.mean, p95: meta.v1.p95, clip: meta.v1.clipFrac, dark: meta.v1.darkFrac, path: "hdr-msaa", draws: 12 });
      expect(readFileSync(join(dir, "frames", "after", "g--a--settle-60s.jpg"), "utf8")).toBe("not really a jpeg");
      expect(existsSync(join(dir, "frames", "after", "g--a--settle-60s-pair.jpg"))).toBe(true);
      const rows = JSON.parse(readFileSync(join(dir, "luma-after.json"), "utf8")) as Record<string, unknown>[];
      expect(rows).toHaveLength(1);
      expect(rows[0]!.gl).toBe(2);
      const table = execFileSync(process.execPath, ["evidence/audit-fix/e5/compare-luma.mjs", join(dir, "luma-after.json"), join(dir, "luma-after.json")], { encoding: "utf8" });
      expect(table).toContain(`| g--a | ${meta.v1.mean.toFixed(2)} | ${meta.v1.mean.toFixed(2)} | 0.0% |`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("page functions are self-contained (Playwright serialises them with toString)", () => {
  it("glMetaInPage and glPairInPage give the same result when re-evaluated without module scope", async () => {
    g.__AURA_QA__ = { crops: [{ name: "hero", x: 0.25, y: 0.25, w: 0.5, h: 0.5 }] };
    const f = cellsFrame();
    const isolatedMeta = new Function(`return (${glMetaInPage.toString()});`)() as typeof glMetaInPage;
    const isolatedPair = new Function(`return (${glPairInPage.toString()});`)() as typeof glPairInPage;
    const direct: GlMetaResult = await glMetaInPage({ png: "f" }, decoderOf({ f }));
    expect(await isolatedMeta({ png: "f" }, decoderOf({ f }))).toEqual(direct);
    const pairInput = { a: "f", b: "f", rects: direct.rects };
    expect(await isolatedPair(pairInput, decoderOf({ f }))).toEqual(await glPairInPage(pairInput, decoderOf({ f })));
  });
});
