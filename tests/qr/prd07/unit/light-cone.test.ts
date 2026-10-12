// PRD-07 §6.2.10 / PRD 14 §8.9 — lightCone geometry builds (promote run
// 38202728178: a shadowed `axial` const threw "Cannot access before
// initialization" on prd07-volumetric-shafts) and the cone is a soft additive
// volume (axial² · 0.175), not a near-opaque surface.

import { describe, expect, it } from "vitest";
import { BeamPass } from "../../../../packages/rendering/src/vfx/BeamPass";

describe("lightCone geometry", () => {
  it("builds the cone geometry (no TDZ on the per-row falloff)", () => {
    const pass = new BeamPass({} as never);
    const ctx = { camera: { position: [0, 1.6, 10] } } as never;
    const items = pass.transparentItems([
      { nodeId: "shaft", kind: "lightCone", color: [1, 0.9, 0.8, 1], intensity: 0.7, position: [-1.7, 8.5, -11.4], direction: [-0.5, -1, 0.25], length: 10, coneAngle: 0.35, softness: 0.4 }
    ], ctx);
    expect(items).toHaveLength(1);
  });
});
