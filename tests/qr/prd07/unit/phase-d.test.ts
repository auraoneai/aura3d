// 07 Phase D / 07-IC0 — unit tests for the S-row evaluator and the IC-0
// identity math (tests/qr/prd07/ci/*). CIEDE2000 is pinned to Sharma, Wu &
// Dalal (2005) published test pairs.
import { describe, expect, it } from "vitest";
import { ciede2000, deltaE2000P99, ic0Verdict, noiseFloorFrom, quantile, sameProvider, srgb8ToLab } from "../ci/ic0-lib";
import { judgeCheck, panelScore, type CaptureReportLike, type JudgeRecordLike, type PhaseDInputs } from "../ci/s-rows-lib";
import { evaluatePhaseD } from "../ci/s-rows-table";
import { skyVariance, subjectPresence } from "../ci/s-rows";

const EMPTY: PhaseDInputs = { vfx: null, none: null, gamesVfx: null, gamesNone: null, frames: {}, judges: [], signoffs: [] };

function solid(width: number, height: number, rgb: [number, number, number]) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) rgba.set([...rgb, 255], i * 4);
  return { rgba, width, height };
}

describe("07-IC0 CIEDE2000", () => {
  it.each([
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082]
  ] as const)("Sharma pair %j vs %j = %d", (a, b, expected) => {
    expect(ciede2000(a, b)).toBeCloseTo(expected, 3);
    expect(ciede2000(b, a)).toBeCloseTo(expected, 3);
  });

  it("sRGB white maps to L=100, a=b=0", () => {
    const [L, a, b] = srgb8ToLab(255, 255, 255);
    expect(L).toBeCloseTo(100, 2);
    expect(Math.abs(a)).toBeLessThan(0.01);
    expect(Math.abs(b)).toBeLessThan(0.01);
  });

  it("identical frames have p99 0; size mismatch is +Infinity", () => {
    const f = solid(8, 8, [10, 20, 30]);
    expect(deltaE2000P99(f, solid(8, 8, [10, 20, 30]))).toBe(0);
    expect(deltaE2000P99(f, solid(4, 8, [10, 20, 30]))).toBe(Number.POSITIVE_INFINITY);
  });

  it("p99 ignores a < 1 % outlier and catches a 2 % one", () => {
    const a = solid(10, 10, [100, 100, 100]);
    const b = solid(10, 10, [100, 100, 100]);
    b.rgba.set([255, 0, 0, 255], 0);
    expect(deltaE2000P99(a, b)).toBe(0);
    b.rgba.set([255, 0, 0, 255], 4);
    expect(deltaE2000P99(a, b)).toBeGreaterThan(10);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2);
  });

  it("verdicts need a measured noise floor; providers must match", () => {
    expect(noiseFloorFrom([])).toBeNull();
    expect(noiseFloorFrom([0.2, Number.NaN, 0.5])).toBe(0.5);
    expect(ic0Verdict(0.4, null)).toBe("noise-floor-unmeasured");
    expect(ic0Verdict(null, 0.5)).toBe("missing");
    expect(ic0Verdict(0.4, 0.5)).toBe("pass");
    expect(ic0Verdict(0.6, 0.5)).toBe("fail");
    const gh = { ciProvider: "github", runnerImage: "macos14/20261005.1", browserChannel: "chromium", gpuRenderer: "ANGLE Metal" };
    expect(sameProvider(gh, { ...gh, runnerImage: "macos14/20261009.2" }).same).toBe(true);
    expect(sameProvider(gh, { ...gh, ciProvider: "gitlab" }).same).toBe(false);
    expect(sameProvider(gh, { ...gh, gpuRenderer: "SwiftShader" }).same).toBe(false);
  });
});

describe("07 Phase D judge panel", () => {
  const rec = (itemId: string, aura: number, reference?: number, flags?: string[]): JudgeRecordLike =>
    ({ itemId, category: "vfx", scores: { aura, ...(reference !== undefined ? { reference } : {}) }, ...(flags ? { flags } : {}) });

  it("needs two records; a > 1 split needs a third (median decides)", () => {
    expect(panelScore([rec("x", 7)], "vfx", "aura").score).toBeNull();
    expect(panelScore([rec("x", 7), rec("x", 5)], "vfx", "aura").score).toBeNull();
    expect(panelScore([rec("x", 7), rec("x", 6.5)], "vfx", "aura").score).toBe(6.75);
    expect(panelScore([rec("x", 7), rec("x", 5), rec("x", 6)], "vfx", "aura").score).toBe(6);
  });

  it("reads per-category game scores and rejects other-category benchmark records", () => {
    const game: JudgeRecordLike = { itemId: "g@vfx", scores: { particles: 4, vfx: 6 } };
    expect(panelScore([game, game], "particles", "aura").score).toBe(4);
    expect(panelScore([rec("x", 9), rec("x", 9)], "particles", "aura").score).toBeNull();
  });

  it("applies min, reference delta, baseline delta and flags", () => {
    const input = (judges: JudgeRecordLike[]): PhaseDInputs => ({ ...EMPTY, judges });
    expect(judgeCheck(input([rec("s", 6.5, 6.8), rec("s", 6, 6.6)]), { item: "s", category: "vfx", min: 6, vsReferenceMinus: 0.5 }).status).toBe("pass");
    expect(judgeCheck(input([rec("s", 6, 7.5), rec("s", 6, 7.5)]), { item: "s", category: "vfx", min: 6, vsReferenceMinus: 0.5 }).status).toBe("fail");
    expect(judgeCheck(input([rec("s", 6), rec("s", 6)]), { item: "s", category: "vfx", vsReferenceMinus: 0.5 }).status).toBe("pending");
    expect(judgeCheck(input([rec("s", 8, undefined, ["seam"]), rec("s", 8)]), { item: "s", category: "vfx", forbidFlags: ["seam"] }).status).toBe("fail");
    const games = [rec("g@vfx", 4.5), rec("g@vfx", 4), rec("g@none", 2), rec("g@none", 2)];
    expect(judgeCheck(input(games), { item: "g@vfx", category: "vfx", vsItem: { item: "g@none", plus: 2 } }).status).toBe("pass");
  });
});

describe("07 Phase D rows", () => {
  it("an empty run fails every row on engineering (nothing captured)", () => {
    const rows = evaluatePhaseD(EMPTY);
    expect(rows.map((r) => r.row)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14", "S15"]);
    for (const r of rows) expect(r.status, r.row).toBe("fail");
  });

  it("S2 passes only with a healthy frame, three reference and two judge records", () => {
    const ready = (flags: string[]) => ({ status: "ready", payload: { drawCalls: 12, errors: [], extra: { qrFlags: flags, effects: { liveParticles: 40, errors: [] } } } });
    const vfx: CaptureReportLike = { scenes: [{ scene: "prd07-flipbook", engines: { aura3d: ready(["vfx", "vfx.sky", "vfx.fog", "vfx.volumetric", "vfx.decals"]), three: { status: "ready" } } }] };
    const judges: JudgeRecordLike[] = [
      { itemId: "prd07-flipbook", category: "vfx", scores: { aura: 6.5, reference: 6.5 } },
      { itemId: "prd07-flipbook", category: "vfx", scores: { aura: 6, reference: 6 } }
    ];
    const pending = evaluatePhaseD({ ...EMPTY, vfx }).find((r) => r.row === "S2")!;
    expect(pending.status).toBe("pending");
    const pass = evaluatePhaseD({ ...EMPTY, vfx, judges }).find((r) => r.row === "S2")!;
    expect(pass.status).toBe("pass");
    const noFlags: CaptureReportLike = { scenes: [{ scene: "prd07-flipbook", engines: { aura3d: ready([]), three: { status: "ready" } } }] };
    expect(evaluatePhaseD({ ...EMPTY, vfx: noFlags, judges }).find((r) => r.row === "S2")!.status).toBe("fail");
  });

  it("S6 can never pass while the per-pillar fog reference is unmeasured", () => {
    const s6 = evaluatePhaseD(EMPTY).find((r) => r.row === "S6")!;
    expect(s6.checks.find((c) => c.id === "prd07-fog-height:cpu-reference")!.status).toBe("unmeasured");
  });
});

describe("07 Phase D pixel metrics", () => {
  it("skyVariance is 0 on a flat sky and > 0 on a gradient", () => {
    expect(skyVariance(solid(16, 16, [90, 120, 200]), null)).toBe(0);
    const g = solid(16, 16, [0, 0, 0]);
    for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) g.rgba.set([y * 12, y * 12, 200, 255], (y * 16 + x) * 4);
    expect(skyVariance(g, null)).toBeGreaterThan(0);
  });

  it("subjectPresence counts mask pixels that differ from the corner background", () => {
    const img = solid(32, 32, [5, 5, 5]);
    const mask = solid(32, 32, [0, 0, 0]);
    for (let y = 12; y < 20; y += 1) for (let x = 12; x < 20; x += 1) {
      mask.rgba.set([255, 255, 255, 255], (y * 32 + x) * 4);
      if (x < 18) img.rgba.set([200, 150, 90, 255], (y * 32 + x) * 4);
    }
    expect(subjectPresence(img, mask)).toBeCloseTo(48 / 64, 5);
  });
});
