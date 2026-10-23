import { describe, expect, it } from "vitest";
import {
  assignOrder, binomialTwoSided, extractJson, frameDistance, imageStats, jsDivergence, parseFrameLines, seededRng, summarize, wilson, type Rgba, type Trial
} from "../../../tools/crayon-capture/heatsink-judge-lib";

const solid = (r: number, g: number, b: number, w = 16, h = 16): Rgba => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255; }
  return { width: w, height: h, data };
};
const stripes = (w = 32, h = 32): Rgba => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = x % 8 < 4 ? 255 : 0; const i = (y * w + x) * 4; data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255; }
  return { width: w, height: h, data };
};

describe("seeded presentation order", () => {
  it("is deterministic per seed, balanced per pass, and differs between seeds", () => {
    const steps = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = assignOrder(steps, 3, 42);
    expect(assignOrder(steps, 3, 42)).toEqual(a);
    expect(assignOrder(steps, 3, 43)).not.toEqual(a);
    for (let pass = 0; pass < 3; pass++) expect(a.filter((x) => x.pass === pass && x.originalIs === "A")).toHaveLength(4);
    expect(a).toHaveLength(24);
    expect(seededRng(1)()).toBe(seededRng(1)());
  });
});

describe("image statistics and distances", () => {
  it("a frame has zero distance to itself and a flat frame has no edges", () => {
    const s = imageStats(solid(10, 20, 30));
    expect(s.edgeDensity).toBe(0);
    const d = frameDistance(s, s);
    expect(d.lumaJsd).toBe(0);
    expect(d.rgbJsd).toBe(0);
    expect(d.paletteDistance).toBe(0);
  });
  it("different palettes and edge content are measurably apart", () => {
    const dark = imageStats(solid(0, 0, 0));
    const bright = imageStats(solid(255, 255, 255));
    const d = frameDistance(dark, bright);
    expect(d.lumaJsd).toBeCloseTo(1, 6);
    expect(d.paletteDistance).toBeCloseTo(1, 6);
    expect(imageStats(stripes()).edgeDensity).toBeGreaterThan(0.1);
    expect(frameDistance(imageStats(solid(128, 128, 128, 32, 32)), imageStats(stripes())).edgeDensityRatio).toBe(NaN);
  });
  it("js divergence is symmetric and bounded", () => {
    const p = [0.5, 0.5, 0], q = [0, 0.5, 0.5];
    expect(jsDivergence(p, q)).toBeCloseTo(jsDivergence(q, p), 12);
    expect(jsDivergence(p, q)).toBeGreaterThan(0);
    expect(jsDivergence(p, q)).toBeLessThanOrEqual(1);
  });
});

describe("binomial test against chance", () => {
  it("matches known exact values", () => {
    expect(binomialTwoSided(5, 10)).toBeCloseTo(1, 9);
    expect(binomialTwoSided(10, 10)).toBeCloseTo(2 / 1024, 9);
    expect(binomialTwoSided(8, 10)).toBeCloseTo(0.109375, 6);
    expect(binomialTwoSided(0, 0)).toBe(1);
  });
  it("wilson interval contains the point estimate and widens for small n", () => {
    const [lo, hi] = wilson(30, 48);
    expect(lo).toBeLessThan(30 / 48);
    expect(hi).toBeGreaterThan(30 / 48);
    const small = wilson(3, 5);
    expect(small[1] - small[0]).toBeGreaterThan(hi - lo);
  });
});

const trial = (over: Partial<Trial>): Trial => ({ step: 1, pass: 0, look: "cruise", originalIs: "A", picked: "A", sameGame: false, sameGameConfidence: 0.8, originalConfidence: 0.9, tells: [], ...over });

describe("summary", () => {
  it("counts accuracy per look, flags distinguishability above 70% and ignores unanswered trials", () => {
    const trials = [trial({}), trial({}), trial({ look: "heat", picked: "B" }), trial({ look: "heat" }), trial({ picked: null, error: "x" })];
    const s = summarize(trials);
    expect(s.valid).toBe(4);
    expect(s.correct).toBe(3);
    expect(s.accuracy).toBe(0.75);
    expect(s.distinguishable).toBe(true);
    expect(s.byLook.heat).toMatchObject({ valid: 2, correct: 1, accuracy: 0.5 });
    const chance = summarize([trial({}), trial({ picked: "B" }), trial({}), trial({ picked: "B" })]);
    expect(chance.accuracy).toBe(0.5);
    expect(chance.distinguishable).toBe(false);
  });
});

describe("parsing", () => {
  it("extracts the JSON object from prose or a fence", () => {
    expect(extractJson('Here:\n```json\n{"original":"B","same_game":false}\n```')).toEqual({ original: "B", same_game: false });
    expect(extractJson("no json")).toBeNull();
    expect(extractJson("{broken")).toBeNull();
  });
  it("reads frame lines out of a CRLF log, ignoring noise", () => {
    const b64 = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]).toString("base64");
    const log = `noise\r\n@@HEATSINK_FRAME 450 ${b64}\r\n@@HEATSINK_FRAME 750 ${b64}\r\nHEATSINK_FRAME_INFO 450 800x450\r\n`;
    const frames = parseFrameLines(log);
    expect([...frames.keys()]).toEqual([450, 750]);
    expect([...(frames.get(450) as Buffer)]).toEqual([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  });
  it("rejoins a wrapped frame with stderr lines interleaved and cuts at the JPEG end", () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(60, 7), Buffer.from([0xff, 0xd9])]);
    const full = jpeg.toString("base64");
    const log = `@@HEATSINK_FRAME 900 ${full.slice(0, 40)}\n[12.3s] stepping to 1000\n${full.slice(40)}\n2026/10/23 done\n`;
    expect([...(parseFrameLines(log).get(900) as Buffer)]).toEqual([...jpeg]);
  });
});
