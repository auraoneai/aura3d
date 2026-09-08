import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { A3Capture } from "./root-effects-a3-harness";
import { startExampleDevServer } from "./example-dev-server";
import { retainTemporalFrame, temporalCommandIdentity, temporalSourceIdentity } from "./root-temporal-evidence";

/** Diagnostic only: never replaces the frozen R02 raw edge/ghost acceptance. */
test("R02 diagnostic separates static raster jitter from authored object motion", async ({ page }) => {
  test.setTimeout(180_000);
  const sourceStart = temporalSourceIdentity();
  const command = temporalCommandIdentity();
  const server = await startExampleDevServer();
  const directory = "tests/reports/root-effects-a3/diagnostic-static301";
  const sequences: Record<string, unknown> = {};
  const difference = (a: readonly number[], b: readonly number[]) => {
    let sum = 0;
    for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(a[i + c]! - b[i + c]!);
    return sum / (a.length / 4 * 765);
  };
  try {
    await page.goto(`${server.origin}/tests/browser/root-effects-a3-harness.html`);
    await page.waitForFunction(() => Boolean(window.__AURA3D_A3_RUNNER__ || window.__AURA3D_A3_ERROR__));
    expect(await page.evaluate(() => window.__AURA3D_A3_ERROR__)).toBeUndefined();
    let reference: A3Capture | undefined;
    for (const effect of ["baseline", "taa"] as const) {
      const raw = await page.evaluate(effect => window.__AURA3D_A3_RUNNER__!.renderTemporalSequence(effect, "static"), effect);
      const frames = raw.map(({ pixelsBase64, ...frame }) => ({ ...frame, pixels: Array.from(Buffer.from(pixelsBase64, "base64")) }));
      expect(frames).toHaveLength(24);
      reference ??= frames[0]!;
      const metrics = {
        steadyFrameDifference: frames.slice(9).reduce((sum, frame, index) => sum + difference(frame.pixels, frames[index + 8]!.pixels), 0) / 15,
        steadyReferenceError: frames.slice(9).reduce((sum, frame) => sum + difference(frame.pixels, reference!.pixels), 0) / 15
      };
      sequences[effect] = { metrics, frames: frames.map(({ pixels, ...frame }, index) => ({ ...frame,
        artifact: retainTemporalFrame(`${directory}/${effect}-${String(index).padStart(3, "0")}.png`, frame.width, frame.height, pixels)
      })) };
      console.info(`R02 diagnostic ${effect}`, JSON.stringify(metrics));
    }
    const sourceEnd = temporalSourceIdentity();
    expect(sourceEnd).toEqual(sourceStart);
    mkdirSync(resolve(directory), { recursive: true });
    writeFileSync(resolve(directory, "report.json"), JSON.stringify({ schema: "aura3d-root-temporal-static-diagnostic/v1", acceptance: false, sourceStart, sourceEnd, command, sequences }, null, 2));
  } finally { await server.close(); }
});

test("R02 diagnostic compares moving coverage against converged supersampling", async ({ page }) => {
  test.setTimeout(240_000);
  const sourceStart = temporalSourceIdentity();
  const command = temporalCommandIdentity();
  const server = await startExampleDevServer();
  const directory = "tests/reports/root-effects-a3/diagnostic-reference301";
  const sequences: Record<string, A3Capture[]> = {};
  const artifacts: Record<string, unknown> = {};
  const difference = (a: readonly number[], b: readonly number[]) => {
    let sum = 0;
    for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(a[i + c]! - b[i + c]!);
    return sum / (a.length / 4 * 765);
  };
  try {
    await page.goto(`${server.origin}/tests/browser/root-effects-a3-harness.html`);
    await page.waitForFunction(() => Boolean(window.__AURA3D_A3_RUNNER__ || window.__AURA3D_A3_ERROR__));
    expect(await page.evaluate(() => window.__AURA3D_A3_ERROR__)).toBeUndefined();
    for (const entry of [{ name: "baseline", effect: "baseline", scale: 1 }, { name: "reference4", effect: "baseline", scale: 4 }, { name: "reference8", effect: "baseline", scale: 8 }, { name: "taa", effect: "taa", scale: 1 }] as const) {
      const raw = await page.evaluate(({ effect, scale }) => window.__AURA3D_A3_RUNNER__!.renderTemporalSequence(effect, "jitter", false, scale), entry);
      const frames = raw.map(({ pixelsBase64, ...frame }) => ({ ...frame, pixels: Array.from(Buffer.from(pixelsBase64, "base64")) }));
      expect(frames).toHaveLength(24);
      sequences[entry.name] = frames;
      artifacts[entry.name] = { renderWidth: 240 * entry.scale, renderHeight: 160 * entry.scale, boxFilterScale: entry.scale,
        frames: frames.map(({ pixels, ...frame }, index) => ({ ...frame, artifact: retainTemporalFrame(`${directory}/${entry.name}-${String(index).padStart(3, "0")}.png`, 240, 160, pixels) })) };
    }
    const metrics = Object.fromEntries(Object.entries(sequences).map(([name, frames]) => [name, {
      steadyFrameDifference: frames.slice(9).reduce((sum, frame, index) => sum + difference(frame.pixels, frames[index + 8]!.pixels), 0) / 15,
      steadyReferenceError: frames.slice(9).reduce((sum, frame, index) => sum + difference(frame.pixels, sequences.reference8![index + 9]!.pixels), 0) / 15
    }]));
    const sourceEnd = temporalSourceIdentity();
    expect(sourceEnd).toEqual(sourceStart);
    mkdirSync(resolve(directory), { recursive: true });
    writeFileSync(resolve(directory, "report.json"), JSON.stringify({ schema: "aura3d-root-temporal-reference-diagnostic/v1", acceptance: false,
      referenceDefinition: "Actual baseline GPU rendering at 4x and 8x each dimension, display RGB box-averaged to the unchanged 240x160 acceptance grid; convergence measured, not assumed", sourceStart, sourceEnd, command, metrics, sequences: artifacts }, null, 2));
    console.info("R02 supersampling diagnostic", JSON.stringify(metrics));
  } finally { await server.close(); }
});
