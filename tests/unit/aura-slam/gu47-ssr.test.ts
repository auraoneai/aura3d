import { describe, expect, it } from "vitest";
import { renderer, scene } from "../../../packages/engine/src";
import { ssrRoughnessGate } from "../../../packages/engine/src/agent-api/rendererDiagnostics";
import { VENUE_LOOK_ORDER } from "../../../examples/aura-slam/view/look";
import { postEffects, ssrFor } from "../../../examples/aura-slam/view/lighting";

/**
 * GU47 phase 7 (lane e6 handoff): the S3 trace reads `screenSpaceReflections({ roughness })` as the frame-wide surface
 * roughness, so the 0.5 Aura Slam authored zeroed every reflection. Every venue's post chain now runs SSR at full gate.
 */
describe("Aura Slam SSR is not roughness-gated", () => {
  for (const venue of VENUE_LOOK_ORDER) {
    it(`${venue}: SSR node at full strength, no SSR_ROUGHNESS_GATED warning`, () => {
      const s = scene();
      for (const effect of postEffects(venue)) s.add(effect);
      const report = renderer.diagnostics(s);
      expect(report.warnings.some((w) => w.startsWith("SSR_ROUGHNESS_GATED"))).toBe(false);
      expect(ssrRoughnessGate(0.3)).toBe(1);
      expect(ssrFor(venue).intensity).toBeGreaterThan(0);
    });
  }

  it("acrylic courts reflect more than turf and clay", () => {
    expect(ssrFor("hard").intensity).toBeGreaterThan(ssrFor("grass").intensity);
    expect(ssrFor("clay")).toEqual(ssrFor("grass"));
    expect(ssrFor(null)).toEqual(ssrFor("hard"));
  });
});
