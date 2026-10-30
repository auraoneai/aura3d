import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  aggregateCells,
  bandFor,
  checkBand,
  compareCaptures,
  deltaE2000,
  deltaE2000Lab,
  evaluateBands,
  formatBands,
  formatCompare,
  formatPairs,
  formatRowTables,
  fractionAbove,
  histogramL1,
  hueDelta,
  lastShots,
  loadCapture,
  metricOf,
  parseCaptureLog,
  regionStats,
  steadyRows
  // @ts-expect-error plain ESM tool without types
} from "../../../../tools/look-metrics/region-luma.mjs";
import { glMetaInPage, glPairInPage, type DecodedFrame } from "../../../browser/game-luma-stats";

const SCRIPT = join(process.cwd(), "tools/look-metrics/region-luma.mjs");
const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "region-luma-")); dirs.push(d); return d; };

type Stats = Record<string, unknown>;
const stats = (mean: number, extra: Stats = {}): Stats => ({
  mean, std: 10, p5: Math.max(0, mean - 30), p50: mean, p95: Math.min(255, mean + 40), darkFrac: 0.01, clipFrac: 0,
  rgb: [mean + 10, mean, mean - 10], hue: 30, hueR: 0.8, chroma: 12, sat: 0.2, lap: 50, edge: 0.03, ...extra
});
const row = (target: string, id: string, mean: number, extra: Stats = {}): Stats => {
  const [slug, variant] = target.split("--");
  return {
    target, id, slug, variant, sinceReadyMs: 25000, ...stats(mean), grid: Array(9).fill(mean), info: { app: true, renderPath: "hdr-msaa", drawCalls: 120 },
    gl: 2, w: 1280, h: 720, cells: Array.from({ length: 9 }, (_, i) => stats(mean + i)), crops: {}, ...extra
  };
};

describe("region-luma: loading", () => {
  it("parses GL_META and GL_PAIR lines from a runner log and skips torn lines", () => {
    const log = [
      "noise",
      `GL_META ${JSON.stringify(row("g--a", "settle-25s", 80))}`,
      'GL_META {"target":"torn',
      `[step] GL_PAIR ${JSON.stringify({ target: "g--a", id: "settle-25s", gapMs: 600, diff: { meanAbsY: 2.5, cells: [], crops: {} } })}`,
      "GL_JPG g--a settle-25s 1/1 AAAA"
    ].join("\n");
    const { metas, pairs } = parseCaptureLog(log);
    expect(metas).toHaveLength(1);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].diff.meanAbsY).toBe(2.5);
  });

  it("loads a decode-luma array, an extract object and a raw log", () => {
    const dir = tmp();
    const rows = [row("g--a", "settle-25s", 80)];
    writeFileSync(join(dir, "luma.json"), JSON.stringify(rows));
    writeFileSync(join(dir, "both.json"), JSON.stringify({ metas: rows, pairs: [{ target: "g--a" }] }));
    writeFileSync(join(dir, "acr-run.log"), `GL_META ${JSON.stringify(rows[0])}\n`);
    expect(loadCapture(join(dir, "luma.json")).metas).toHaveLength(1);
    expect(loadCapture(join(dir, "both.json")).pairs).toHaveLength(1);
    expect(loadCapture(join(dir, "acr-run.log")).metas[0].target).toBe("g--a");
  });

  it("keeps only steady-state shots (25 s and 60 s, not the 3 s floor-probe shot)", () => {
    const rows = [row("g--a", "settle-3s", 200), row("g--a", "settle-25s", 80), row("g--a", "settle-60s", 82), row("g--a", "warmup", 1)];
    expect(steadyRows(rows).map((r: Stats) => r.id)).toEqual(["settle-25s", "settle-60s"]);
    expect((lastShots(steadyRows(rows)).get("g--a") as Stats).id).toBe("settle-60s");
  });
});

describe("region-luma: colour maths", () => {
  it("CIEDE2000 matches the Sharma et al. reference pairs", () => {
    expect(deltaE2000Lab([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
    expect(deltaE2000Lab([50, 2.5, 0], [73, 25, -18])).toBeCloseTo(27.1492, 3);
    expect(deltaE2000Lab([2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514])).toBeCloseTo(0.9082, 3);
    expect(deltaE2000([10, 20, 30], [10, 20, 30])).toBe(0);
  });

  it("hue deltas wrap through 0 and keep their sign", () => {
    expect(hueDelta(350, 10)).toBe(20);
    expect(hueDelta(10, 350)).toBe(-20);
    expect(hueDelta(0, 180)).toBe(180);
    expect(hueDelta(null, 10)).toBeNull();
  });

  it("aggregates three equal cells exactly (mean, pooled std, rgb) and sums hue vectors", () => {
    const agg = aggregateCells([stats(10, { std: 0, hue: 0, hueR: 1, chroma: 10 }), stats(20, { std: 0, hue: 90, hueR: 1, chroma: 10 }), stats(30, { std: 0, hue: 90, hueR: 1, chroma: 10 })]);
    expect(agg.mean).toBe(20);
    expect(agg.std).toBeCloseTo(Math.sqrt(200 / 3), 2);
    expect(agg.rgb).toEqual([30, 20, 10]);
    expect(agg.hue).toBeCloseTo(63.4, 1);
    expect(agg.aggregate).toBe(true);
  });
});

describe("region-luma: bands", () => {
  it("checks frame metrics, derived ratios and wrapping hue bands", () => {
    const s = stats(100, { rgb: [150, 100, 100], hue: 350 });
    expect(checkBand(s, { mean: [90, 110], rb: [1.4, null] })).toEqual([]);
    expect(checkBand(s, { hue: [330, 30] })).toEqual([]);
    expect(checkBand(s, { hue: [20, 40] })[0]).toMatchObject({ metric: "hue", value: 350 });
    expect(checkBand(s, { mean: [null, 50] })[0]).toMatchObject({ metric: "mean", value: 100, max: 50 });
    expect(metricOf(s, "spread")).toBe(70);
    expect(metricOf({ mean: 1 }, "rgb")).toBeNull();
  });

  it("reports a v1 row (no colour) and a missing crop as misses, never as passes", () => {
    const v1 = { target: "g--a", id: "settle-25s", slug: "g", variant: "a", mean: 80, p5: 10, p50: 80, p95: 150, darkFrac: 0, clipFrac: 0, grid: Array(9).fill(80) };
    const [r] = evaluateBands([v1], { variants: { a: { rb: [1, null], crops: { hero: { mean: [10, null] } } } } }, { slug: "g" });
    expect(r.pass).toBe(false);
    expect(r.misses.map((m: Stats) => m.region)).toEqual(["frame", "crop:hero"]);
  });

  it("applies the PRD default (darkFrac <= 0.6, clipFrac <= 0.05) unless the variant is a declared exception", () => {
    const rows = [row("g--dark", "settle-25s", 20, { darkFrac: 0.7 }), row("g--moon", "settle-25s", 20, { darkFrac: 0.7 }), row("other--x", "settle-25s", 20, { darkFrac: 0.9 })];
    const spec = { slug: "g", exceptions: { moon: "lunar venue" } };
    const results = evaluateBands(rows, spec);
    expect(results.map((r: Stats) => [r.target, r.pass])).toEqual([["g--dark", false], ["g--moon", true]]);
    expect(bandFor(spec, rows[1]).excepted).toBe(true);
  });

  it("evaluates cell indices, row aliases and crops from the variant band", () => {
    const r = row("g--a", "settle-60s", 100, { crops: { platform: { x: 0, y: 0, w: 10, h: 10, ...stats(70) } } });
    const spec = { variants: { a: { cells: { "4": { mean: [104, 104] }, top: { mean: [101, 101], p95: [0, 255] } }, crops: { platform: { mean: [60, null] } } } } };
    const [res] = evaluateBands([r], spec, { slug: "g" });
    expect(res.misses).toHaveLength(1);
    expect(res.misses[0]).toMatchObject({ region: "cell:top", metric: "p95", reason: expect.stringContaining("percentiles") });
    expect((regionStats(r, "bottom") as Stats).mean).toBe(107);
    expect(formatBands([res])).toContain("MISS");
  });
});

describe("region-luma: compare, pairs and tables", () => {
  it("pairs captures by target at the last steady shot and reports frame, cell and crop deltas", () => {
    const before = [row("g--a", "settle-60s", 80, { crops: { hero: stats(60) } }), row("g--gone", "settle-60s", 50)];
    const after = [row("g--a", "settle-25s", 1), row("g--a", "settle-60s", 95, { hue: 50, crops: { hero: stats(90, { lap: 100 }) } })];
    const res = compareCaptures(before, after);
    const a = res.find((r: Stats) => r.target === "g--a");
    expect(a.frame.mean).toBe(15);
    expect(a.frame.hue).toBe(20);
    expect(a.cells[0].mean).toBe(15);
    expect(a.crops.hero.mean).toBe(30);
    expect(a.crops.hero.lapRatio).toBe(2);
    expect(res.find((r: Stats) => r.target === "g--gone").missing).toBe("after");
    expect(formatCompare(res)).toContain("| g--a | 80 | 95 | 15 |");
  });

  it("formats per-cell and per-crop tables and GL_PAIR diffs", () => {
    const r = row("g--a", "settle-60s", 100, { crops: { hero: { x: 1, y: 2, w: 30, h: 40, ...stats(70) } } });
    const text = formatRowTables(r);
    expect(text).toContain("| 4 |");
    expect(text).toContain("| hero | 1,2 30x40 |");
    expect(formatPairs([{ target: "g--a", id: "settle-25s", gapMs: 600, diff: { meanAbsY: 2, meanAbsRGB: 3, changedFrac: 0.1, ssim: 0.98, cells: [{ meanAbsY: 1, changedFrac: 0, ssim: 1 }], crops: { hero: { meanAbsY: 4, changedFrac: 0.5, ssim: 0.9 } } } }])).toContain("crop hero");
  });

  it("histogram metrics: above<N> from the 32-bin hist, hue-histogram L1 in compare", () => {
    const hist = Array(32).fill(0);
    hist[25] = 0.25; hist[31] = 0.75;
    expect(fractionAbove(hist, 200)).toBeCloseTo(1, 6);
    expect(fractionAbove(hist, 204)).toBeCloseTo(0.875, 6);
    expect(fractionAbove(hist, 248)).toBeCloseTo(0.75, 6);
    expect(fractionAbove(null, 200)).toBeNull();
    expect(metricOf({ hist }, "above200")).toBeCloseTo(1, 6);
    expect(checkBand({ mean: 1 }, { above200: [0.03, null] })[0]).toMatchObject({ metric: "above200", reason: expect.stringContaining("histogram") });
    expect(histogramL1([1, 0], [0, 1])).toBe(2);
    const hueA = [1, ...Array(11).fill(0)], hueB = [0, 1, ...Array(10).fill(0)];
    const res = compareCaptures([row("g--a", "settle-60s", 80, { hueHist: hueA })], [row("g--a", "settle-60s", 80, { hueHist: hueB })]);
    expect(res[0].frame.hueL1).toBe(2);
  });

  it("a blank frame and a shot with textures still uploading are misses even inside the band", () => {
    const blank = row("g--a", "settle-25s", 100, { blank: true });
    const pending = row("g--b", "settle-25s", 100, { info: { app: true, texPending: 3, texTotal: 58 } });
    const [r1, r2] = evaluateBands([blank, pending], { slug: "g", variants: { a: { mean: [90, 110] }, b: { mean: [90, 110] } } });
    expect(r1.misses.map((m: Stats) => m.metric)).toEqual(["blank"]);
    expect(r2.misses[0]).toMatchObject({ metric: "texPending", value: 3, reason: expect.stringContaining("GL_TEX_WAIT_S") });
  });

  it("decodes the rows the capture spec writes (game-luma-stats GL_META v2 and GL_PAIR)", async () => {
    const w = 30, h = 18;
    const shot = (lift: number): DecodedFrame => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const top = y < 6;
        data[i] = top ? 40 : 200 + (x < 10 ? lift : 0); data[i + 1] = top ? 90 : 120; data[i + 2] = top ? 220 : 60; data[i + 3] = 255;
      }
      return { width: w, height: h, data };
    };
    const frames: Record<string, DecodedFrame> = { a: shot(0), b: shot(40) };
    const decode = async (k: string) => frames[k]!;
    const meta = await glMetaInPage({ png: "a", crops: [{ name: "ground", x: 0, y: 1 / 3, w: 1, h: 2 / 3 }] }, decode);
    const logged = { target: "g--dusk", id: "settle-60s", slug: "g", variant: "dusk", sinceReadyMs: 60000, ...meta.v1, info: { app: true, texPending: 0 }, ...meta.v2 };
    const pairRow = { target: "g--dusk", id: "settle-60s", slug: "g", variant: "dusk", gapMs: 600, elapsedMs: 700, diff: (await glPairInPage({ a: "a", b: "b", rects: meta.rects }, decode)).diff };
    const capture = parseCaptureLog(`GL_META ${JSON.stringify(logged)}\nGL_PAIR ${JSON.stringify(pairRow)}\n`);
    const spec = { slug: "g", variants: { dusk: { cells: { top: { hue: [200, 230] }, "4": { rb: [1.5, null] } }, crops: { ground: { mean: [100, 140], above200: [null, 0.01] } } } } };
    const [res] = evaluateBands(capture.metas, spec);
    expect(res.misses).toEqual([]);
    expect(regionStats(capture.metas[0], "crop:ground").from).toBe("target");
    expect(formatRowTables(capture.metas[0])).toContain("| ground | 0,6 30x12 |");
    expect(formatPairs(capture.pairs)).toContain("| g--dusk | settle-60s | 600 |");
    expect(capture.pairs[0].diff.crops.ground.changedFrac).toBeCloseTo(1 / 3, 3);
  });

  it("CLI: bands exits 1 on a miss and 0 on a pass; table and compare print markdown", () => {
    const dir = tmp();
    const cap = join(dir, "luma-after.json");
    writeFileSync(cap, JSON.stringify([row("g--a", "settle-60s", 100)]));
    writeFileSync(join(dir, "ok.json"), JSON.stringify({ schema: "aura3d.luma-bands/1", slug: "g", variants: { a: { mean: [90, 110] } } }));
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ schema: "aura3d.luma-bands/1", slug: "g", variants: { a: { mean: [10, 20] } } }));
    expect(execFileSync(process.execPath, [SCRIPT, "bands", cap, "--bands", join(dir, "ok.json")], { encoding: "utf8" })).toContain("pass");
    let code = 0;
    try { execFileSync(process.execPath, [SCRIPT, "bands", cap, "--bands", join(dir, "bad.json")], { stdio: "pipe" }); } catch (e) { code = (e as { status: number }).status; }
    expect(code).toBe(1);
    expect(execFileSync(process.execPath, [SCRIPT, "table", cap], { encoding: "utf8" })).toContain("### g--a settle-60s");
    expect(execFileSync(process.execPath, [SCRIPT, "compare", cap, cap, "--json"], { encoding: "utf8" })).toContain('"target": "g--a"');
  });
});
