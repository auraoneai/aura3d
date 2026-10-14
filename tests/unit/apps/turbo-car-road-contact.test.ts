import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regression coverage for defects 43/45 and the owner-reported
 * tyres-in-cement defect, rewritten for the Live Fix B2 single-path
 * rebuild.
 *
 * History this file used to encode: defect 43 added `VISIBLE_ROAD_LIFT`
 * on a camera-confounded screen-space measurement; defect 45 retracted
 * it. The dual-path route then reintroduced the same class as
 * `ROAD_DETAIL_SURFACE_LIFT = 0.075` in src/v2/race-setup.ts, papering
 * over a rendered world mesh (`turboCircuitEnvironmentV2`) that differed
 * from the mesh the surface query sampled (`turboFormulaCircuit`
 * topology inside the generated game-geometry contract). Both files are
 * deleted. The behaviour-level proof now lives in
 * tests/qr/prd14/turbo-drift/grounding.test.ts (a driven lap sweep over
 * the extracted mesh); what remains here is route binding: the shipped
 * main.ts reaches the shared chassis/mesh-surface implementation, one
 * GLB both renders and grounds, and none of the banned constants return.
 */
describe("Turbo car is seated on the visible road", () => {
  const source = readFileSync("apps/showcase-turbo-drift-circuit/src/main.ts", "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("grounds the car on a chassis over the rendered track mesh", () => {
    expect(source).toContain("createVehicleChassis(chassisSpec, trackSurface)");
    expect(source).toContain("meshVehicleSurface(trackMeshQuery");
    // The query is built from the same GLB the scene renders
    // (src/track-surface.ts, extracted by scripts/extract-track-surface.mjs).
    expect(source).toContain("model(assets.trackModel");
    // World-mode rendering keeps GLB space identical to extraction space;
    // the normalized fit would rescale/recentre the mesh away from the
    // baked ground query.
    expect(source).toContain('scaleMode: "world"');
  });

  it("keeps every banned lift/underhang/analytic-surface constant deleted", () => {
    for (const banned of [
      "ROAD_DETAIL_SURFACE_LIFT",
      "VISIBLE_ROAD_LIFT",
      "CAR_ORIGIN_UNDERHANG_RATIO",
      "TRACK_SURFACE_Y",
      "CAR_GROUND_Y",
      "CAR_TYRE_CONTACT_Y",
      "VERGE_DROP",
      "SHOULDER_WIDTH",
      "CAR_REFERENCE_Y",
      "racingScene.vehicleSurface("
    ]) {
      expect(code, `${banned} must stay deleted`).not.toContain(banned);
    }
  });

  it("derives chassis geometry from the measured car asset, not tuned literals", () => {
    expect(source).toContain("vehicleChassisSpecFromBounds(CAR_MODEL_SIZE)");
    expect(source).toContain("groundedFittedModelPosition(pose, CAR_MODEL_SIZE");
  });

  it("publishes per-wheel ground clearance from sampled values", () => {
    expect(source).toContain("groundClearance");
    expect(source).toContain("trackSurface.sample(wheel.position[0], wheel.position[2])");
  });
});
