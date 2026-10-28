import { describe, expect, it } from "vitest";
import { sceneKits } from "@aura3d/engine";

// L-K scene-kit receipts (PRD beat-three.js WP-K.2): a kit built with its own defaults must not
// report a problem against itself, otherwise the kit can never be promoted past "partial".
describe("scene kit default diagnostics", () => {
  const kitIds = ["physicsPlayground", "particleFountain", "solarSystem", "neonTunnel", "dataViz", "miniGolf", "materialLab", "cityBlock", "humanoidWalk"] as const;

  for (const id of kitIds) {
    it(`sceneKits.${id}() reports no problems on its defaults`, () => {
      const kit = sceneKits[id]();
      expect(kit.diagnostics.problems).toEqual([]);
    });
  }

  it("particleFountain reaches the full structural score on its defaults", () => {
    expect(sceneKits.particleFountain().diagnostics.structuralScore).toBe(5);
  });
});
