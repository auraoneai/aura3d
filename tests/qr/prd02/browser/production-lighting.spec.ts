/**
 * 02-S2S3 — flag-on production captures of prd02-no-lights, -15, -11 and -13
 * against three r185 (PRD-02 §16.1 S2/S3).
 *
 * S2 (prd02-no-lights; three side = RoomEnvironment PMREM, lane fixtures.ts):
 *   subject mean linear luma within ±25 % of three; subject top/bottom luma
 *   ratio ≥ 0.8× three's; unrequested shadow pixels ≤ 0.1 %.
 * S3 (production path, A3D_QR_LIGHTING on):
 *   prd02-15 shadow-region luma drop 40–60 % (three ≈ 50 %);
 *   prd02-11 / prd02-13 unrequested shadow pixels ≤ 0.1 %;
 *   prd02-13 no punctual hotspot: plastic-sphere max luma ≤ the env-only
 *   three render + 2/255.
 *
 * Every measurement is attached to the test (`02-S2S3-<scene>.json`) so the
 * remote run's JSON report carries the numbers for evidence/prd02/<run-id>/.
 */
import { expect, test, type TestInfo } from "@playwright/test";
import { objectIdMask, maskPixelCount, shadowReceiverMask, type PixelBuffer } from "../../../../benchmarks/quality-rebuild/scenes/prd02/masks";
import { getPrd02Spec } from "../../../../benchmarks/quality-rebuild/scenes/prd02/specs";
import { diffPixelRatio, shadowDrop } from "../metrics/regionMetrics";
import { captureLaneScene, startLaneServer, type LaneServer } from "./lane-page";
import { maxLuma, meanLinearLuma, objectDiscMask, splitTopBottom } from "./shadow-helpers";

const FLAG_ON = "lighting";
const UNREQUESTED_MAX = 0.001;

async function attach(testInfo: TestInfo, scene: string, report: Record<string, unknown>): Promise<void> {
  await testInfo.attach(`02-S2S3-${scene}.json`, { body: JSON.stringify(report, null, 2), contentType: "application/json" });
}

function fullFrame(img: PixelBuffer): Uint8Array {
  return new Uint8Array(img.width * img.height).fill(255);
}

test.describe("02-S2S3 production lighting captures (flag on vs three)", () => {
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

  test("S2 prd02-no-lights: neutral room lights the subject like three's RoomEnvironment", async ({ page }, testInfo) => {
    const scene = "prd02-no-lights";
    const spec = getPrd02Spec(scene);
    const three = (await captureLaneScene(page, server, { scene, engine: "three", flags: "none" })).pixels;
    const aura = (await captureLaneScene(page, server, { scene, flags: FLAG_ON })).pixels;
    const auraOff = (await captureLaneScene(page, server, { scene, flags: FLAG_ON, control: "no-shadows" })).pixels;
    const subject = objectIdMask(spec, aura);
    expect(maskPixelCount(subject), "subject mask").toBeGreaterThan(1000);
    const [top, bottom] = splitTopBottom(subject, aura);
    const threeLuma = meanLinearLuma(three, subject);
    const auraLuma = meanLinearLuma(aura, subject);
    const threeTopBottom = meanLinearLuma(three, top) / Math.max(meanLinearLuma(three, bottom), 1e-6);
    const auraTopBottom = meanLinearLuma(aura, top) / Math.max(meanLinearLuma(aura, bottom), 1e-6);
    const unrequested = diffPixelRatio(aura, auraOff, fullFrame(aura));
    const report = { threeLuma, auraLuma, lumaRatio: auraLuma / threeLuma, threeTopBottom, auraTopBottom, topBottomRatio: auraTopBottom / threeTopBottom, unrequested };
    await attach(testInfo, scene, report);
    expect(threeLuma, "three RoomEnvironment reference must light the subject").toBeGreaterThan(0.01);
    expect(auraLuma / threeLuma, JSON.stringify(report)).toBeGreaterThanOrEqual(0.75);
    expect(auraLuma / threeLuma, JSON.stringify(report)).toBeLessThanOrEqual(1.25);
    expect(auraTopBottom, JSON.stringify(report)).toBeGreaterThanOrEqual(0.8 * threeTopBottom);
    expect(unrequested, JSON.stringify(report)).toBeLessThanOrEqual(UNREQUESTED_MAX);
  });

  test("S3 prd02-15: full-strength sun shadow drops the receiver 40-60 %", async ({ page }, testInfo) => {
    const scene = "prd02-15-animation-skinning";
    const three = (await captureLaneScene(page, server, { scene, engine: "three", flags: "none" })).pixels;
    const threeOff = (await captureLaneScene(page, server, { scene, engine: "three", flags: "none", control: "no-shadows" })).pixels;
    const aura = (await captureLaneScene(page, server, { scene, flags: FLAG_ON })).pixels;
    const auraOff = (await captureLaneScene(page, server, { scene, flags: FLAG_ON, control: "no-shadows" })).pixels;
    const receiver = shadowReceiverMask(three, threeOff);
    expect(maskPixelCount(receiver), "three shadow region").toBeGreaterThan(500);
    const report = {
      receiverPixels: maskPixelCount(receiver),
      threeDrop: shadowDrop(three, threeOff, receiver),
      auraDrop: shadowDrop(aura, auraOff, receiver)
    };
    await attach(testInfo, scene, report);
    expect(report.auraDrop, JSON.stringify(report)).toBeGreaterThanOrEqual(0.4);
    expect(report.auraDrop, JSON.stringify(report)).toBeLessThanOrEqual(0.6);
  });

  for (const scene of ["prd02-11-multiple-lights", "prd02-13-ibl-only"] as const) {
    test(`S3 ${scene}: no unrequested shadow pixels (<= 0.1 %)`, async ({ page }, testInfo) => {
      const spec = getPrd02Spec(scene);
      expect(spec.lights.some((light) => "castShadow" in light && light.castShadow), `${scene} requests no shadows`).toBe(false);
      const aura = (await captureLaneScene(page, server, { scene, flags: FLAG_ON })).pixels;
      const auraOff = (await captureLaneScene(page, server, { scene, flags: FLAG_ON, control: "no-shadows" })).pixels;
      const report: Record<string, number> = { unrequested: diffPixelRatio(aura, auraOff, fullFrame(aura)) };
      if (scene === "prd02-13-ibl-only") {
        const three = (await captureLaneScene(page, server, { scene, engine: "three", flags: "none" })).pixels;
        const plastic = objectDiscMask(spec, aura, "plastic sphere", 0.9);
        report.auraPlasticMax = maxLuma(aura, plastic);
        report.threePlasticMax = maxLuma(three, plastic);
      }
      await attach(testInfo, scene, report);
      expect(report.unrequested, JSON.stringify(report)).toBeLessThanOrEqual(UNREQUESTED_MAX);
      if (report.auraPlasticMax !== undefined) {
        expect(report.auraPlasticMax, `no punctual hotspot: ${JSON.stringify(report)}`).toBeLessThanOrEqual(report.threePlasticMax! + 2);
      }
    });
  }
});
