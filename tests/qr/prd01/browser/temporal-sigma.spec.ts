import { test, expect } from "@playwright/test";
import { nonFavicon, openTool } from "./specHelpers";

// PRD-01 §17.1 S9 (row 01-S9): specular AA temporal stability on the
// `prd01-specular-aa` content under a deterministic 60-frame camera dolly
// (?tools=temporal-dolly). Per-pixel luma sigma in the "spheres" mask:
//   sigma(core) <= 1.2 x sigma(three r185)
//   sigma(core) <= 0.5 x sigma(flag-off, a3d-qr=none)
// Sanity: every engine's readback is opaque (a cleared / unreadable drawing
// buffer reads back alpha 0) and not black, and the dolly changed the mask on
// most frames, so a blank or frozen canvas cannot pass.

interface EngineResult {
  readonly sigma: { readonly meanSigma: number; readonly p95Sigma: number; readonly maxSigma: number; readonly pixels: number; readonly frames: number };
  readonly meanLuma: number;
  readonly opaqueFraction: number;
  readonly changedFrames: number;
}

interface TemporalDollyReport {
  readonly flags: string;
  readonly frames: number;
  readonly aura: EngineResult | null;
  readonly three: EngineResult | null;
  readonly errors: readonly string[];
}

const THREE_RATIO = 1.2;
const FLAG_OFF_RATIO = 0.5;

function assertDrawn(label: string, result: EngineResult | null, frames: number): EngineResult {
  expect(result, `${label} produced no frames`).not.toBeNull();
  const r = result!;
  expect(r.sigma.frames, `${label} frame count`).toBe(frames);
  expect(r.sigma.pixels, `${label} mask pixels`).toBeGreaterThan(0);
  expect(r.opaqueFraction, `${label} readback is not opaque`).toBeGreaterThan(0.99);
  expect(r.meanLuma, `${label} mask is black`).toBeGreaterThan(8);
  expect(r.changedFrames, `${label} dolly did not move the image`).toBeGreaterThanOrEqual(Math.floor(frames / 2));
  return r;
}

test("01-S9 specular AA temporal sigma: core <= 1.2x three and <= 0.5x flag-off", async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];

  const core = await openTool<TemporalDollyReport>(page, "tools=temporal-dolly&a3d-qr=core", pageErrors);
  const off = await openTool<TemporalDollyReport>(page, "tools=temporal-dolly&a3d-qr=none", pageErrors);
  const raw = { core: core.aura, none: off.aura, three: core.three, errors: [...core.errors, ...off.errors] };
  console.log(`[01-S9] raw ${JSON.stringify(raw)}`);
  expect(core.errors).toEqual([]);
  expect(off.errors).toEqual([]);

  const auraCore = assertDrawn("aura core", core.aura, core.frames);
  const three = assertDrawn("three r185", core.three, core.frames);
  const auraOff = assertDrawn("aura flag-off", off.aura, off.frames);

  const summary = {
    core: auraCore.sigma,
    none: auraOff.sigma,
    three: three.sigma,
    ratioThree: auraCore.sigma.meanSigma / three.sigma.meanSigma,
    ratioFlagOff: auraCore.sigma.meanSigma / auraOff.sigma.meanSigma
  };
  console.log(`[01-S9] ${JSON.stringify(summary)}`);
  await test.info().attach("temporal-sigma.json", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });

  expect(nonFavicon(pageErrors)).toEqual([]);
  expect(auraCore.sigma.meanSigma, "sigma(core) vs 1.2 x sigma(three)").toBeLessThanOrEqual(THREE_RATIO * three.sigma.meanSigma);
  expect(auraCore.sigma.meanSigma, "sigma(core) vs 0.5 x sigma(flag-off)").toBeLessThanOrEqual(FLAG_OFF_RATIO * auraOff.sigma.meanSigma);
});
