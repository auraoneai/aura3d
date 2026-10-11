/**
 * 02-S7 — PMREM correctness and three r185 parity on studio_small_08_1k.hdr
 * (PRD-02 §16.1 S7; Phase 3 GPUPMREMGenerator row). Drives
 * `scenes/prd02/pmrem.html` from the lane bundle on macos-14 (ANGLE Metal).
 *
 * Subject: the C-09 real factory (A3D_QR_LIGHTING) through the production
 * HDRI loader; its specular cube is uploaded to a WebGL2 RGBA16F cube and
 * sampled with textureLod on the GPU.
 *  - per-mip solid-angle mean luma within ±5 % of mip 0;
 *  - texel max luma monotonically non-increasing with mip;
 *  - mip N-1 (16 px) top/bottom hemisphere mean-luma ratio ≥ 1.5;
 *  - mirror sphere (ChunkHarness program over `a3d_prd02_lighting_ibl`) at
 *    roughness {0, .25, .5, .75, 1}: each window's mean linear luma within
 *    10 % of three's PMREMGenerator.fromEquirectangular + textureCubeUV, and
 *    the HF-energy ordering identical; prerequisite: mip-0 GPU samples
 *    correlate with the source equirect (log-luma Pearson ≥ 0.9).
 * Controls that must fail: the C-09 slot stub (flag off) cannot build a
 * probe at all; the pre-C-09 PMREM path (0.82 wide-lobe blend) fails the
 * mip criterion and the three parity.
 */
import { expect, test } from "@playwright/test";
import { startLaneServer, type LaneServer } from "./lane-page";

interface MipStats {
  readonly mip: number;
  readonly faceSize: number;
  readonly meanLuma: number;
  readonly maxLuma: number;
  readonly topLuma: number;
  readonly bottomLuma: number;
}
interface SphereWindow {
  readonly roughness: number;
  readonly meanLuma: number;
  readonly hf: number;
  readonly pixels: number;
}
interface Measured {
  readonly mipCount: number;
  readonly faceSize: number;
  readonly stats: readonly MipStats[];
  readonly orientation: number;
  readonly mirror: readonly SphereWindow[];
}
interface HarnessResult {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly real?: Measured & { readonly source: string };
  readonly legacy?: Measured;
  readonly three?: { readonly windows: readonly SphereWindow[]; readonly cubeUvHeight: number };
  readonly stub?: { readonly threw: boolean; readonly message: string };
}

const MEAN_TOLERANCE = 0.05;
const HEMISPHERE_RATIO = 1.5;
const PARITY_TOLERANCE = 0.1;
const ORIENTATION_MIN = 0.9;

function mipCriterion(stats: readonly MipStats[]) {
  const mip0 = stats[0]!;
  const meanOk = stats.every((s) => Math.abs(s.meanLuma / mip0.meanLuma - 1) <= MEAN_TOLERANCE);
  const maxOk = stats.every((s, i) => i === 0 || s.maxLuma <= stats[i - 1]!.maxLuma);
  const last = stats[stats.length - 1]!;
  const hemisphereRatio = last.topLuma / last.bottomLuma;
  return { meanOk, maxOk, hemisphereRatio, hemisphereOk: hemisphereRatio >= HEMISPHERE_RATIO, pass: meanOk && maxOk && hemisphereRatio >= HEMISPHERE_RATIO };
}

function hfOrder(windows: readonly SphereWindow[]): number[] {
  return windows.map((w) => w.roughness).sort((a, b) => windows.find((w) => w.roughness === b)!.hf - windows.find((w) => w.roughness === a)!.hf);
}

function parityCriterion(subject: readonly SphereWindow[], reference: readonly SphereWindow[]) {
  const ratios = subject.map((w, i) => w.meanLuma / reference[i]!.meanLuma);
  const meansOk = ratios.every((r) => Math.abs(r - 1) <= PARITY_TOLERANCE);
  const orderOk = JSON.stringify(hfOrder(subject)) === JSON.stringify(hfOrder(reference));
  return { ratios, meansOk, orderOk, pass: meansOk && orderOk };
}

test.describe("02-S7 PMREM on studio_small_08_1k.hdr", () => {
  let server: LaneServer;
  let result: HarnessResult;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    server = await startLaneServer();
    const page = await browser.newPage();
    await page.goto(`${server.origin}/scenes/prd02/pmrem.html`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction("() => Boolean(window.__A3D_PRD02_PMREM__)", undefined, { timeout: 240_000, polling: 500 });
    result = (await page.evaluate("() => window.__A3D_PRD02_PMREM__")) as HarnessResult;
    await page.close();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("harness ran on the real C-09 factory", () => {
    expect(result.status, result.error).toBe("ready");
    expect(result.real?.source).toBe("hdri");
    expect(result.real?.mipCount ?? 0).toBeGreaterThan(1);
  });

  test("real PMREM: per-mip mean ±5 %, max monotone, mip N-1 top/bottom ≥ 1.5", () => {
    const stats = result.real!.stats;
    const verdict = mipCriterion(stats);
    const detail = JSON.stringify({ verdict, stats });
    expect(stats[stats.length - 1]!.faceSize, detail).toBe(16);
    expect(verdict.meanOk, detail).toBe(true);
    expect(verdict.maxOk, detail).toBe(true);
    expect(verdict.hemisphereRatio, detail).toBeGreaterThanOrEqual(HEMISPHERE_RATIO);
  });

  test("real PMREM mip 0 is oriented like the source equirect on the GPU", () => {
    expect(result.real!.orientation).toBeGreaterThanOrEqual(ORIENTATION_MIN);
  });

  test("real PMREM mirror sphere within 10 % of three r185 at 5 roughness values, HF order identical", () => {
    const verdict = parityCriterion(result.real!.mirror, result.three!.windows);
    const detail = JSON.stringify({ verdict, aura: result.real!.mirror, three: result.three!.windows });
    expect(result.real!.mirror.length).toBe(5);
    expect(result.real!.mirror.every((w) => w.pixels > 0 && Number.isFinite(w.meanLuma))).toBe(true);
    expect(verdict.meansOk, detail).toBe(true);
    expect(verdict.orderOk, detail).toBe(true);
  });

  test("control: the C-09 slot stub (flag off) cannot build a probe", () => {
    expect(result.stub?.threw).toBe(true);
    expect(result.stub?.message).toContain("ENVIRONMENT_PROBE_PENDING");
  });

  test("control: the pre-C-09 PMREM (0.82 blend) fails the mip criterion and the three parity", () => {
    const legacy = result.legacy!;
    const mip = mipCriterion(legacy.stats);
    const parity = parityCriterion(legacy.mirror, result.three!.windows);
    const detail = JSON.stringify({ mip, parity, stats: legacy.stats, mirror: legacy.mirror });
    expect(mip.pass, detail).toBe(false);
    expect(parity.pass, detail).toBe(false);
  });
});
