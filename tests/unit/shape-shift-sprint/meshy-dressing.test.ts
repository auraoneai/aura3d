import { describe, expect, it } from "vitest";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { LAYERS, MESHY_PIECES, meshyPose } from "../../../apps/showcase-shape-shift-sprint/src/scenery";
import { ROAD_DIMS } from "../../../apps/showcase-shape-shift-sprint/src/meshes";
import { assets } from "../../../apps/showcase-shape-shift-sprint/src/aura-model-assets";

const app = resolve(__dirname, "../../../apps/showcase-shape-shift-sprint");

describe("shape shift sprint Meshy backdrop dressing", () => {
  it("keeps every piece well clear of the road at every clock and never hides it", () => {
    for (const p of MESHY_PIECES) {
      const halfWidth = (p.size / 2) * 1.05;
      expect(Math.abs(p.x) - halfWidth, p.id).toBeGreaterThan(ROAD_DIMS.width / 2 + 10);
      const { span, near } = LAYERS[p.layer];
      for (let t = 0; t < 40; t += 0.37) {
        const pose = meshyPose(p, t, false);
        expect(pose.z, p.id).toBeGreaterThanOrEqual(near - span);
        expect(pose.z, p.id).toBeLessThanOrEqual(near);
        expect(pose.scale, p.id).toBeGreaterThan(0);
        expect(pose.scale, p.id).toBeLessThanOrEqual(1);
      }
      const still = meshyPose(p, 12, true);
      expect(still.yaw, p.id).toBe(p.yaw);
      expect(still.y, p.id).toBeCloseTo(p.y + Math.sin(p.z0) * p.bob, 9);
    }
  });

  it("ships route-local GLBs under the per-model size cap", () => {
    for (const kind of new Set(MESHY_PIECES.map((p) => p.kind))) {
      const url = assets[kind].url;
      expect(url.startsWith("/aura-assets/")).toBe(true);
      expect(statSync(resolve(app, "public", url.slice(1))).size).toBeLessThanOrEqual(1.5 * 1024 * 1024);
    }
  });
});
