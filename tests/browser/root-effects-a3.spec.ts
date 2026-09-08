import { measureRootTemporalQuality } from "../../tools/muse3jsparity-readiness/root-temporal-quality";
import type { A3Capture, A3VariantId } from "./root-effects-a3-harness";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import { retainTemporalFrame, temporalHash, temporalSourceIdentity, temporalCommandIdentity } from "./root-temporal-evidence";

const REPORT = "tests/reports/root-effects-a3/a3-probe.json";

type A3Window = Window;

const PIXEL_BACKED: Record<string, string> = {
  "color-grade": "color-grade",
  outline: "outline",
  fxaa: "fxaa",
  ssr: "ssr",
  dof: "depth-of-field"
};

/** A3 root effects: every submittable pass executes pixel-backed with an on/off delta; withheld intents warn and keep drawing. */
test("root A3 effects execute with pixel deltas and honest withholding", async ({ page }) => {
  test.setTimeout(300_000);
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/root-effects-a3-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const harnessWindow = window as A3Window;
      return Boolean(harnessWindow.__AURA3D_A3_RUNNER__ || harnessWindow.__AURA3D_A3_ERROR__);
    }, undefined, { timeout: 90_000 });
    const harnessError = await page.evaluate(() => (window as A3Window).__AURA3D_A3_ERROR__);
    if (harnessError) throw new Error(harnessError);

    const render = (id: A3VariantId): Promise<A3Capture> =>
      page.evaluate((variant) =>
        (window as A3Window).__AURA3D_A3_RUNNER__!.renderVariant(variant), id);

    const baseline = await render("baseline");
    expect(baseline.drawCalls).toBeGreaterThan(0);

    const deltas: Record<string, { changedFraction: number; meanAbsoluteDelta: number }> = {};
    for (const [variant, pass] of Object.entries(PIXEL_BACKED) as [A3VariantId, string][]) {
      const capture = await render(variant);
      expect(capture.actualPasses).toContain(pass);
      expect(capture.pixelBacked).toBe(true);
      expect(capture.executionMode).toBe("renderer-owned-fused-ldr-native");
      const delta = pixelDelta(capture, baseline);
      expect(delta.changedFraction).toBeGreaterThan(0.002);
      deltas[variant] = delta;
      await page.screenshot({ path: resolve(`tests/reports/root-effects-a3/a3-${variant}.png`) });
    }

    // The typed animated actor remains outside rigid temporal support.
    for (const variant of ["motion-blur", "taa"] as const) {
      const capture = await render(variant);
      expect(capture.drawCalls).toBeGreaterThan(0);
      expect(capture.warnings.join(" ")).toContain("TEMPORAL_UNSUPPORTED_GEOMETRY");
      expect(capture.actualPasses).not.toContain(variant);
    }

    writeJson(REPORT, {
      generatedAt: new Date().toISOString(),
      baseline: { ...baseline, pixels: `[${baseline.pixels.length} channels]` },
      deltas
    });
    await page.screenshot({ path: resolve("tests/reports/root-effects-a3/a3-final.png") });
  } finally {
    await server.close();
  }
});

function pixelDelta(a: A3Capture, b: A3Capture): { changedFraction: number; meanAbsoluteDelta: number } {
  expect(a.width).toBe(b.width);
  expect(a.height).toBe(b.height);
  const total = a.width * a.height;
  let changed = 0;
  let absoluteDelta = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const delta =
      Math.abs((a.pixels[offset] ?? 0) - (b.pixels[offset] ?? 0)) +
      Math.abs((a.pixels[offset + 1] ?? 0) - (b.pixels[offset + 1] ?? 0)) +
      Math.abs((a.pixels[offset + 2] ?? 0) - (b.pixels[offset + 2] ?? 0));
    absoluteDelta += delta;
    if (delta > 12) changed += 1;
  }
  return { changedFraction: changed / total, meanAbsoluteDelta: absoluteDelta / total };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}


test("R02 root rigid temporal passes execute with movement and cut controls", async ({ page }) => {
  test.setTimeout(300_000);
  page.on("console", message => console.log(`[R02 browser ${message.type()}] ${message.text()}`));
  page.on("pageerror", error => console.error(`[R02 pageerror] ${error.message}`));
  page.on("requestfailed", request => console.error(`[R02 requestfailed] ${request.url()} ${request.failure()?.errorText}`));
  const startedAt = new Date().toISOString();
  const sourceStart = temporalSourceIdentity();
  const sequences: unknown[] = [];
  const metrics: Record<string, unknown> = {};
  const command = temporalCommandIdentity();
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/root-effects-a3-harness.html`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as A3Window).__AURA3D_A3_RUNNER__ || (window as A3Window).__AURA3D_A3_ERROR__), undefined, { timeout: 30_000 });
    expect(await page.evaluate(() => (window as A3Window).__AURA3D_A3_ERROR__)).toBeUndefined();
    const run = async (effect: "baseline" | "motion-blur" | "taa", motion: "static" | "object" | "camera" | "cut" | "jitter" | "disocclusion" | "resume", resetEveryFrame = false, referenceScale = 1): Promise<A3Capture[]> => {
      const sequenceStartedAt = new Date().toISOString();
      const frames = await page.evaluate(({ effect, motion, resetEveryFrame, referenceScale }) => (window as A3Window).__AURA3D_A3_RUNNER__!.renderTemporalSequence(effect, motion, resetEveryFrame, referenceScale), { effect, motion, resetEveryFrame, referenceScale });
      const decoded = frames.map(({ pixelsBase64, ...frame }) => ({ ...frame, pixels: Array.from(Buffer.from(pixelsBase64, "base64")) }));
      const captures = decoded.map(({ pixels, ...frame }, index) => ({
        frame: index, simulationTimeSeconds: (index + 1) / 60, ...frame,
        artifact: retainTemporalFrame(`tests/reports/root-effects-a3/r02-sequences/${effect}-${motion}${resetEveryFrame ? "-reset" : ""}${referenceScale > 1 ? `-reference${referenceScale}` : ""}/frame-${String(index).padStart(3, "0")}.png`, frame.width, frame.height, pixels)
      }));
      const sequence = { effect, motion, resetEveryFrame, referenceScale, startedAt: sequenceStartedAt, endedAt: new Date().toISOString(), frames: captures };
      sequences.push(sequence);
      writeJson(`tests/reports/root-effects-a3/r02-sequences/${effect}-${motion}${resetEveryFrame ? "-reset" : ""}${referenceScale > 1 ? `-reference${referenceScale}` : ""}/sequence.json`, sequence);
      return decoded;
    };
    const still = await run("baseline", "static");
    const stillBlur = await run("motion-blur", "static");
    expect(pixelDelta(still[23]!, stillBlur[23]!).meanAbsoluteDelta).toBeLessThan(.5);
    for (const motion of ["object", "camera"] as const) {
      const baseline = await run("baseline", motion);
      expect(pixelDelta(baseline[5]!, baseline[20]!).changedFraction, `${motion} must visibly move the edge before measuring temporal effects`).toBeGreaterThan(.0001);
      for (const effect of ["motion-blur", "taa"] as const) {
        const frames = await run(effect, motion);
        for (const frame of frames) {
          expect(frame.actualPasses).toContain(effect);
          expect(frame.pixelBacked).toBe(true);
          expect(frame.nativeTemporalPasses).toBeGreaterThan(0);
          expect(frame.nativeTemporalBindings).toBeGreaterThan(0);
          expect(frame.warnings.join(" ")).not.toContain("TEMPORAL_");
        }
        const delta = pixelDelta(frames[20]!, baseline[20]!);
        expect(delta.changedFraction).toBeGreaterThan(.0001);
        metrics[`${effect}-${motion}`] = delta;
      }
    }
    const cut = await run("taa", "cut");
    // Cold-reference configuration must match TAA's sampling. Comparing
    // against MSAA would measure spatial AA differences rather than stale history.
    const cutBaseline = await run("taa", "cut", true);
    // First frame after setScene is cold: no old-view color survives reseeding.
    const cutDelta = pixelDelta(cut[12]!, cutBaseline[12]!);
    expect(cutDelta.meanAbsoluteDelta).toBeLessThan(.5);
    metrics.cut = cutDelta;
    const jitterOff = await run("baseline", "jitter");
    const jitterTaa = await run("taa", "jitter");
    const jitterReset = await run("taa", "jitter", true);
    const flicker = (frames: A3Capture[]) => frames.slice(9).reduce((sum, frame, index) => sum + pixelDelta(frame, frames[index + 8]!).meanAbsoluteDelta / 765, 0) / 15;
    const edge = { off: flicker(jitterOff), taa: flicker(jitterTaa), reset: flicker(jitterReset) };
    metrics.edge = edge;
    console.info("R02 edge quality", JSON.stringify(edge));
    expect(edge.off).toBeGreaterThan(.0001);
    // Frozen v2 measures aliasing residual against the same authored motion.
    // Raw frame differences above remain retained, including historical failures.
    const reference8 = await run("baseline", "jitter", false, 8);
    const reference16 = await run("baseline", "jitter", false, 16);
    const { mask, ...quality } = measureRootTemporalQuality({ baseline: jitterOff.map(f=>f.pixels), taa: jitterTaa.map(f=>f.pixels), reset: jitterReset.map(f=>f.pixels), reference8: reference8.map(f=>f.pixels), reference16: reference16.map(f=>f.pixels) });
    const maskPath = "tests/reports/root-effects-a3/r02-edge-mask.bin";
    writeFileSync(resolve(maskPath), mask);
    metrics.quality = { ...quality, maskArtifact: { path: maskPath, sha256: temporalHash(mask) } };
    console.info("R02 prospective residual quality", JSON.stringify(quality));
    expect(quality.failures).toEqual([]);
    const disocclusionOff = await run("baseline", "disocclusion");
    const disocclusionTaa = await run("taa", "disocclusion");
    const roi = { x0: 82, x1: 93, y0: 50, y1: 110 };
    let oldCoverage = 0, newCoverage = 0, staleError = 0, ghostError = 0, count = 0;
    for (let y = roi.y0; y < roi.y1; y++) for (let x = roi.x0; x < roi.x1; x++) {
      const offset = (y * 240 + x) * 4;
      const luma = (frame: A3Capture) => (frame.pixels[offset]! + frame.pixels[offset + 1]! + frame.pixels[offset + 2]!) / 765;
      if (luma(disocclusionOff[11]!) > .5) oldCoverage++;
      if (luma(disocclusionOff[12]!) > .5) newCoverage++;
      for (let c = 0; c < 3; c++) {
        staleError += Math.abs(disocclusionTaa[11]!.pixels[offset + c]! - disocclusionOff[12]!.pixels[offset + c]!) / 765;
        ghostError += Math.abs(disocclusionTaa[12]!.pixels[offset + c]! - disocclusionOff[12]!.pixels[offset + c]!) / 765;
      }
      count++;
    }
    const ghost = { roi, oldCoverage: oldCoverage / count, newCoverage: newCoverage / count, staleError: staleError / count, actualError: ghostError / count };
    metrics.ghost = ghost;
    console.info("R02 disocclusion quality", JSON.stringify(ghost));
    expect(ghost.oldCoverage).toBeGreaterThan(.5);
    expect(ghost.newCoverage).toBeLessThan(.01);
    expect(ghost.staleError).toBeGreaterThan(.1);
    expect(ghost.actualError).toBeLessThan(.01);
    const resumed = await run("taa", "resume");
    const resumeReference = await run("taa", "disocclusion", true);
    const resumeDelta = pixelDelta(resumed[12]!, resumeReference[12]!);
    expect(resumeDelta.meanAbsoluteDelta).toBeLessThan(.5);
    metrics.resume = resumeDelta;
    const sourceEnd = temporalSourceIdentity();
    expect(sourceEnd).toEqual(sourceStart);
    writeJson("tests/reports/root-effects-a3/r02-temporal-sequences.json", { schema: "aura3d-root-temporal-sequences/v1", startedAt, endedAt: new Date().toISOString(), sourceStart, sourceEnd, command, commandSha256: temporalHash(JSON.stringify(command)), sequences, metrics, scope: "root WebGL temporal submissions; rigid object/camera motion; subpixel edge accumulation with history-reset negative control; covered/vacated ROI disocclusion with stale-frame negative control; cut and pause/resume resets" });
  } catch (error) {
    const failure = { generatedAt: new Date().toISOString(), error: String(error), sourceStart, command, metrics, completedSequenceCount: sequences.length, phase: await page.evaluate(() => (window as Window & { __AURA3D_R02_PHASE__?: unknown }).__AURA3D_R02_PHASE__).catch(() => undefined) };
    writeJson("tests/reports/root-effects-a3/r02-failure.json", failure);
    await page.screenshot({ path: resolve("tests/reports/root-effects-a3/r02-failure.png"), timeout: 5_000 }).catch(() => undefined);
    throw error;
  } finally { await server.close(); }
});
