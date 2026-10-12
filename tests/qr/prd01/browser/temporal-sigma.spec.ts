import { test, expect } from "@playwright/test";
import { nonFavicon, openTool } from "./specHelpers";

// PRD-01 §17.1 S9 (row 01-S9) / §15 `prd01-specular-aa`: 40 thin glossy tori
// (roughness 0.05) and wires at 20-60 m under a deterministic 60-frame camera
// dolly (?tools=temporal-dolly). Temporal luminance variance in highlight
// regions — RMS frame-to-frame luma change over the pixels whose peak luma
// reaches the highlight threshold:
//   sigma(core) <= 1.2 x sigma(three r185, MeshStandardMaterial)
//   sigma(core) <= 0.5 x sigma(flag-off, a3d-qr=none)
// Sanity: every engine's readback is opaque (an unreadable drawing buffer
// reads alpha 0), it has a highlight region, and the dolly changed most frames.

interface EngineResult {
  readonly highlight: { readonly sigma: number; readonly highlightPixels: number; readonly frames: number; readonly threshold: number };
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
const MIN_HIGHLIGHT_PIXELS = 50;

function assertDrawn(label: string, result: EngineResult | null, frames: number): EngineResult {
  expect(result, `${label} produced no frames`).not.toBeNull();
  const r = result!;
  expect(r.highlight.frames, `${label} frame count`).toBe(frames);
  expect(r.opaqueFraction, `${label} readback is not opaque`).toBeGreaterThan(0.99);
  expect(r.highlight.highlightPixels, `${label} has no highlight region`).toBeGreaterThanOrEqual(MIN_HIGHLIGHT_PIXELS);
  expect(r.changedFrames, `${label} dolly did not move the image`).toBeGreaterThanOrEqual(Math.floor(frames / 2));
  return r;
}

test("01-S9 specular AA highlight frame-to-frame sigma: core <= 1.2x three and <= 0.5x flag-off", async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];

  const core = await openTool<TemporalDollyReport>(page, "tools=temporal-dolly&a3d-qr=core", pageErrors);
  const off = await openTool<TemporalDollyReport>(page, "tools=temporal-dolly&a3d-qr=none", pageErrors);
  console.log(`[01-S9] raw ${JSON.stringify({ core: core.aura, none: off.aura, three: core.three, errors: [...core.errors, ...off.errors] })}`);
  expect(core.errors).toEqual([]);
  expect(off.errors).toEqual([]);

  const auraCore = assertDrawn("aura core", core.aura, core.frames);
  const three = assertDrawn("three r185", core.three, core.frames);
  const auraOff = assertDrawn("aura flag-off", off.aura, off.frames);

  const summary = {
    core: auraCore.highlight,
    none: auraOff.highlight,
    three: three.highlight,
    ratioThree: auraCore.highlight.sigma / three.highlight.sigma,
    ratioFlagOff: auraCore.highlight.sigma / auraOff.highlight.sigma
  };
  console.log(`[01-S9] ${JSON.stringify(summary)}`);
  await test.info().attach("temporal-sigma.json", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });

  expect(nonFavicon(pageErrors)).toEqual([]);
  expect(auraCore.highlight.sigma, "sigma(core) vs 1.2 x sigma(three)").toBeLessThanOrEqual(THREE_RATIO * three.highlight.sigma);
  expect(auraCore.highlight.sigma, "sigma(core) vs 0.5 x sigma(flag-off)").toBeLessThanOrEqual(FLAG_OFF_RATIO * auraOff.highlight.sigma);
});
