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
import { boundaryRing, requireLaneApp, setCameraPose, stagePixels } from "./shadow-helpers";

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
    await captureLaneScene(page, server, { scene: CITY, flags: "lighting" });
    await requireLaneApp(page);
    const { position, target } = spec.camera;
    const forward: Vec3 = [target[0] - position[0], target[1] - position[1], target[2] - position[2]];
    const len = Math.hypot(...forward);
    const step: Vec3 = [(forward[0] / len) * DOLLY_STEP_M, (forward[1] / len) * DOLLY_STEP_M, (forward[2] / len) * DOLLY_STEP_M];
    const frames: PixelBuffer[] = [];
    for (let frame = 0; frame < DOLLY_FRAMES; frame += 1) {
      const p: Vec3 = [position[0] + step[0] * frame, position[1] + step[1] * frame, position[2] + step[2] * frame];
      const t: Vec3 = [target[0] + step[0] * frame, target[1] + step[1] * frame, target[2] + step[2] * frame];
      expect(await setCameraPose(page, p, t), "app.setScene camera move").toBe(true);
      frames.push(await stagePixels(page));
    }
    const edge = boundaryRing(shadowMask(frames[0]!, off), frames[0]!, 1);
    const diff = meanFrameDiff(frames, edge);
    // The dolly must reach the renderer: the first and last frames (0.59 m
    // apart) differ across the frame. Without this a camera surface that
    // ignores the move makes every frame identical and the shimmer gate
    // passes trivially (azure-gpu run 38155871625: meanFrameDiff 0).
    const fullFrame = new Uint8Array(frames[0]!.width * frames[0]!.height).fill(255);
    const moved = meanFrameDiff([frames[0]!, frames[frames.length - 1]!], fullFrame);
    const report = { edgePixels: maskPixelCount(edge), meanFrameDiff: diff, firstToLastFrameDiff: moved };
    await testInfo.attach("02-S5-dolly.json", { body: JSON.stringify(report), contentType: "application/json" });
    expect(report.edgePixels, "frame-0 shadow edges").toBeGreaterThan(500);
    expect(moved, `the dolly must change the rendered frame: ${JSON.stringify(report)}`).toBeGreaterThan(MIN_DOLLY_FRAME_DIFF);
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
