/**
 * 02-S5 — stable shadows and off-screen casters (PRD-02 §16.1 S5, item 1943),
 * A3D_QR_LIGHTING on.
 *
 *  - prd02-17: a 60-frame dolly of 0.01 m per frame along the view direction
 *    gives a mean absolute frame-to-frame luma difference ≤ 1.5/255 inside the
 *    static shadow-edge mask (boundary ring of the frame-0 shadow mask).
 *  - prd02-pole-behind-camera: a tall pole 3 m behind the camera, under a low
 *    sun from behind, still casts into view (shadow pixels > 0 in the receiver
 *    mask). Casters come from the pre-cull collect snapshot.
 */
import { expect, test } from "@playwright/test";
import { maskPixelCount, shadowReceiverMask, type PixelBuffer } from "../../../../benchmarks/quality-rebuild/scenes/prd02/masks";
import { getPrd02Spec } from "../../../../benchmarks/quality-rebuild/scenes/prd02/specs";
import type { Vec3 } from "../../../../benchmarks/quality-rebuild/shared/types";
import { meanFrameDiff, shadowMask } from "../metrics/regionMetrics";
import { captureLaneScene, startLaneServer, type LaneServer } from "./lane-page";
import { boundaryRing, deviceCounters, requireLaneApp, setCameraPose, stagePixels } from "./shadow-helpers";

const CITY = "prd02-17-large-environment";
const POLE = "prd02-pole-behind-camera";
const DOLLY_FRAMES = 60;
const DOLLY_STEP_M = 0.01;
const SHIMMER_MAX = 1.5;
/** Mean |Δluma| (0..255) the 0.59 m dolly must at least produce over the whole frame. */
const MIN_DOLLY_FRAME_DIFF = 0.05;

test.describe("02-S5 shadow stability", () => {
  let server: LaneServer;
  test.beforeAll(async () => {
    server = await startLaneServer();
  });
  test.afterAll(async () => {
    await server.close();
  });
  test.beforeEach(() => {
    test.setTimeout(600_000);
  });

  test("prd02-17: 60-frame 0.01 m dolly keeps the shadow edges stable (<= 1.5/255)", async ({ page }, testInfo) => {
    const spec = getPrd02Spec(CITY);
    const off = (await captureLaneScene(page, server, { scene: CITY, flags: "lighting", control: "no-shadows" })).pixels;
    const on = (await captureLaneScene(page, server, { scene: CITY, flags: "lighting" })).pixels;
    await requireLaneApp(page);
    const probeBefore = maskPixelCount(boundaryRing(shadowMask(on, off), on, 1));
    const staged0 = await stagePixels(page);
    const probeStaged = maskPixelCount(boundaryRing(shadowMask(staged0, off), staged0, 1));
    const probeMount = await page.evaluate(`(async () => { const app = window.__qrPrd02App; const s = app.scene; app.setScene({ ...s }); const t0 = performance.now(); let readyMs = -1; if (typeof app.ready === "function") { await app.ready(); readyMs = performance.now() - t0; } app.step(1/60); await new Promise((r) => requestAnimationFrame(() => r(undefined))); return { readyMs }; })()`);
    const stagedAfterReady = await stagePixels(page);
    const probeAfterReady = maskPixelCount(boundaryRing(shadowMask(stagedAfterReady, off), stagedAfterReady, 1));
    console.log("[prd02c-17-probe]", JSON.stringify({ probeBefore, probeStaged, probeMount, probeAfterReady, w: on.width, sw: staged0.width }));
    const { position, target } = spec.camera;
    const forward: Vec3 = [target[0] - position[0], target[1] - position[1], target[2] - position[2]];
    const len = Math.hypot(...forward);
    const step: Vec3 = [(forward[0] / len) * DOLLY_STEP_M, (forward[1] / len) * DOLLY_STEP_M, (forward[2] / len) * DOLLY_STEP_M];
    const frames: PixelBuffer[] = [];
    let countersAfterFirstMove: Awaited<ReturnType<typeof deviceCounters>> = null;
    for (let frame = 0; frame < DOLLY_FRAMES; frame += 1) {
      const p: Vec3 = [position[0] + step[0] * frame, position[1] + step[1] * frame, position[2] + step[2] * frame];
      const t: Vec3 = [target[0] + step[0] * frame, target[1] + step[1] * frame, target[2] + step[2] * frame];
      expect(await setCameraPose(page, p, t), "app.setScene camera move").toBe(true);
      frames.push(await stagePixels(page));
      if (frame === 0) countersAfterFirstMove = await deviceCounters(page);
    }
    const countersAfterDolly = await deviceCounters(page);
    const edge = boundaryRing(shadowMask(frames[0]!, off), frames[0]!, 1);
    const diff = meanFrameDiff(frames, edge);
    // The dolly must reach the renderer: the first and last frames (0.59 m
    // apart) differ across the frame. Without this a camera surface that
    // ignores the move makes every frame identical and the shimmer gate
    // passes trivially (azure-gpu run 38155871625: meanFrameDiff 0).
    const fullFrame = new Uint8Array(frames[0]!.width * frames[0]!.height).fill(255);
    const moved = meanFrameDiff([frames[0]!, frames[frames.length - 1]!], fullFrame);
    const report = { edgePixels: maskPixelCount(edge), meanFrameDiff: diff, firstToLastFrameDiff: moved, countersAfterFirstMove, countersAfterDolly };
    await testInfo.attach("02-S5-dolly.json", { body: JSON.stringify(report), contentType: "application/json" });
    expect(report.edgePixels, "frame-0 shadow edges").toBeGreaterThan(500);
    expect(moved, `the dolly must change the rendered frame: ${JSON.stringify(report)}`).toBeGreaterThan(MIN_DOLLY_FRAME_DIFF);
    // The per-frame setScene must re-present the same renderer, programs and
    // shadow targets; a rebuild per frame would make "stable" meaningless.
    expect(countersAfterFirstMove?.programCompileCount ?? null, "C-28 programCompileCount reachable from app.diagnostics()").not.toBeNull();
    for (const key of ["programCompileCount", "renderTargets", "disposedRenderTargets"] as const) {
      expect(countersAfterFirstMove?.[key] ?? null, `${key} reachable from app.diagnostics()`).not.toBeNull();
      expect(countersAfterDolly?.[key], `${key} across 59 setScene camera moves: ${JSON.stringify(report)}`).toBe(countersAfterFirstMove?.[key]);
    }
    expect(diff, JSON.stringify(report)).toBeLessThanOrEqual(SHIMMER_MAX);
  });

  test("prd02-pole-behind-camera: a caster behind the camera casts into view", async ({ page }, testInfo) => {
    const three = (await captureLaneScene(page, server, { scene: POLE, engine: "three", flags: "none" })).pixels;
    const threeOff = (await captureLaneScene(page, server, { scene: POLE, engine: "three", flags: "none", control: "no-shadows" })).pixels;
    const aura = (await captureLaneScene(page, server, { scene: POLE, flags: "lighting" })).pixels;
    const auraOff = (await captureLaneScene(page, server, { scene: POLE, flags: "lighting", control: "no-shadows" })).pixels;
    const receiver = shadowReceiverMask(three, threeOff);
    const auraShadow = shadowMask(aura, auraOff);
    let inReceiver = 0;
    for (let index = 0; index < receiver.length; index += 1) if (receiver[index] && auraShadow[index]) inReceiver += 1;
    const report = { threeReceiverPixels: maskPixelCount(receiver), auraShadowPixelsInReceiver: inReceiver };
    await testInfo.attach("02-S5-pole.json", { body: JSON.stringify(report), contentType: "application/json" });
    expect(report.threeReceiverPixels, "three reference: the pole shadow reaches the view").toBeGreaterThan(200);
    expect(inReceiver, JSON.stringify(report)).toBeGreaterThan(0);
  });
});
