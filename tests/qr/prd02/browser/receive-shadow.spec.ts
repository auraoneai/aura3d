/**
 * 02-T1923 — `receiveShadow: false` (PRD-02 §6.4, item 1923), A3D_QR_LIGHTING on.
 *
 * prd02-contact-cube's ground plane under a shadowing cube:
 *  - `receive-shadow-off`: the ground asks for `receiveShadow: false`, and the
 *    lane page registers `createPrd02ReceiveShadowContributor` (C-01 collect
 *    fixture) on the ground render items → receiver luma drop < 2 %;
 *  - `receive-shadow-on` (control, value true) → drop > 20 %.
 * The drop is measured inside three's shadow region against the Aura
 * `no-shadows` render.
 *
 * Production items get `receiveShadow` only after Q-15-5 (#759,
 * compiler/primitives.ts) and Q-04-2 (#764, TypedGLBActor); this spec covers
 * the forward binding through the lane fixture until then.
 */
import { expect, test, type Page } from "@playwright/test";
import { maskPixelCount, shadowReceiverMask } from "../../../../benchmarks/quality-rebuild/scenes/prd02/masks";
import { shadowDrop } from "../metrics/regionMetrics";
import { captureLaneScene, startLaneServer, type LaneServer } from "./lane-page";

const SCENE = "prd02-contact-cube";

async function fixtureMatched(page: Page): Promise<number> {
  return (await page.evaluate("window.__qrPrd02Fixture ? window.__qrPrd02Fixture.matched : 0")) as number;
}

test.describe("02-T1923 receiveShadow:false", () => {
  let server: LaneServer;
  test.beforeAll(async () => {
    server = await startLaneServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("receiveShadow:false drops < 2 %; the true control drops > 20 %", async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    const three = (await captureLaneScene(page, server, { scene: SCENE, engine: "three", flags: "none" })).pixels;
    const threeOff = (await captureLaneScene(page, server, { scene: SCENE, engine: "three", flags: "none", control: "no-shadows" })).pixels;
    const receiver = shadowReceiverMask(three, threeOff);
    expect(maskPixelCount(receiver), "three shadow region on the ground").toBeGreaterThan(500);

    const auraOff = (await captureLaneScene(page, server, { scene: SCENE, flags: "lighting", control: "no-shadows" })).pixels;
    const receiveOff = (await captureLaneScene(page, server, { scene: SCENE, flags: "lighting", control: "receive-shadow-off" })).pixels;
    const matchedOff = await fixtureMatched(page);
    const receiveOn = (await captureLaneScene(page, server, { scene: SCENE, flags: "lighting", control: "receive-shadow-on" })).pixels;
    const matchedOn = await fixtureMatched(page);

    const report = {
      receiverPixels: maskPixelCount(receiver),
      dropReceiveFalse: shadowDrop(receiveOff, auraOff, receiver),
      dropReceiveTrue: shadowDrop(receiveOn, auraOff, receiver),
      fixtureMatched: { off: matchedOff, on: matchedOn }
    };
    await testInfo.attach("02-T1923-receive-shadow.json", { body: JSON.stringify(report), contentType: "application/json" });
    expect(matchedOff, "fixture must reach the ground render items").toBeGreaterThan(0);
    expect(matchedOn, "fixture must reach the ground render items").toBeGreaterThan(0);
    expect(report.dropReceiveFalse, JSON.stringify(report)).toBeLessThan(0.02);
    expect(report.dropReceiveTrue, JSON.stringify(report)).toBeGreaterThan(0.2);
  });
});
