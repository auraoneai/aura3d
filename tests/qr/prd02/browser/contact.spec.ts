/**
 * 02-S11 — contact shadows (PRD-02 §16.1 S11, item 1949) on prd02-contact-cube.
 *
 * Pass on  = `a3d-qr=lighting,lighting.contact` (A3D_QR_LIGHTING_CONTACT opt-in);
 * pass off = `a3d-qr=lighting,-lighting.contact` (explicit veto).
 *
 * Darkening of the sun-lit ground strip within 3 cm of the cube's front base
 * edge, relative to the same-width ground strip 0.5-0.7 m in front of it:
 *   ≥ 30 % with the pass on, < 5 % with it off.
 * The sun-facing front face of the cube changes < 1 % between on and off.
 * Measured on the beauty frame (no public R8 debug view in the lane page).
 */
import { expect, test } from "@playwright/test";
import { maskPixelCount } from "../../../../benchmarks/quality-rebuild/scenes/prd02/masks";
import { getPrd02Spec } from "../../../../benchmarks/quality-rebuild/scenes/prd02/specs";
import { meanLuma } from "../metrics/regionMetrics";
import { captureLaneScene, startLaneServer, type LaneServer } from "./lane-page";
import { worldQuadMask } from "./shadow-helpers";

const SCENE = "prd02-contact-cube";
const PASS_ON = "lighting,lighting.contact";
const PASS_OFF = "lighting,-lighting.contact";

test.describe("02-S11 contact shadows", () => {
  let server: LaneServer;
  test.beforeAll(async () => {
    server = await startLaneServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("contact pass darkens the base seam >= 30 %, < 5 % off, < 1 % on the lit face", async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    const spec = getPrd02Spec(SCENE);
    const cube = spec.objects.find((object) => object.name === "cube");
    if (!cube || cube.kind !== "primitive") throw new Error("prd02-contact-cube: missing cube");
    const half = cube.size[0] / 2;
    const [cx, , cz] = cube.position;
    const front = cz + half;
    const x0 = cx - half * 0.9;
    const x1 = cx + half * 0.9;
    const size = spec.resolution;
    const seam = worldQuadMask(spec, size, [[x0, 0, front + 0.002], [x1, 0, front + 0.002], [x1, 0, front + 0.03], [x0, 0, front + 0.03]]);
    const far = worldQuadMask(spec, size, [[x0, 0, front + 0.5], [x1, 0, front + 0.5], [x1, 0, front + 0.7], [x0, 0, front + 0.7]]);
    const face = worldQuadMask(spec, size, [
      [x0, cube.position[1] + half * 0.8, front],
      [x1, cube.position[1] + half * 0.8, front],
      [x1, cube.position[1] - half * 0.6, front],
      [x0, cube.position[1] - half * 0.6, front]
    ]);
    expect(maskPixelCount(seam), "3 cm seam strip").toBeGreaterThan(100);
    expect(maskPixelCount(far), "reference ground strip").toBeGreaterThan(100);
    expect(maskPixelCount(face), "lit face").toBeGreaterThan(1000);

    const on = (await captureLaneScene(page, server, { scene: SCENE, flags: PASS_ON })).pixels;
    const off = (await captureLaneScene(page, server, { scene: SCENE, flags: PASS_OFF })).pixels;
    const darkening = (img: typeof on) => 1 - meanLuma(img, seam) / Math.max(meanLuma(img, far), 1e-6);
    const report = {
      darkeningOn: darkening(on),
      darkeningOff: darkening(off),
      litFaceChange: Math.abs(meanLuma(on, face) - meanLuma(off, face)) / Math.max(meanLuma(off, face), 1e-6)
    };
    await testInfo.attach("02-S11-contact.json", { body: JSON.stringify(report), contentType: "application/json" });
    expect(report.darkeningOn, JSON.stringify(report)).toBeGreaterThanOrEqual(0.3);
    expect(report.darkeningOff, JSON.stringify(report)).toBeLessThan(0.05);
    expect(report.litFaceChange, JSON.stringify(report)).toBeLessThan(0.01);
  });
});
