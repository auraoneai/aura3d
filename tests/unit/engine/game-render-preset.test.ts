import { describe, expect, it } from "vitest";
import { createSideViewGameRenderPreset } from "@aura3d/engine/production-runtime";

describe("production runtime side-view game render preset", () => {
  it("owns reusable stage geometry, particle, and debug-overlay policy", () => {
    const normal = createSideViewGameRenderPreset();

    expect(normal.stageGeometry.floor).toMatchObject({
      label: "side-view-game-floor",
      materialRole: "gameplay-floor",
      receiveShadow: true
    });
    expect(normal.stageGeometry.laneBounds).toEqual({
      minX: -3.85,
      maxX: 3.85,
      minZ: -0.46,
      maxZ: 0.46
    });
    expect(normal.particles).toMatchObject({
      enabled: true,
      layerId: "arena-ambient-particles",
      count: 128,
      normalPassOnly: true
    });
    expect(normal.debugOverlays).toMatchObject({
      enabled: false,
      normalPassVisible: false,
      collisionVolumeKinds: ["hitbox", "hurtbox", "guardbox", "pushbox"],
      label: "collision-volumes"
    });

    const debug = createSideViewGameRenderPreset({ debugVolumesEnabled: true, reducedMotion: true });
    if (debug.environmentFog === false || normal.environmentFog === false) {
      throw new Error("side-view game preset should provide concrete fog options.");
    }
    const debugBloom = debug.postprocess.bloom;
    const normalBloom = normal.postprocess.bloom;
    if (
      typeof debugBloom !== "object" ||
      debugBloom === null ||
      typeof debugBloom.intensity !== "number" ||
      typeof normalBloom !== "object" ||
      normalBloom === null ||
      typeof normalBloom.intensity !== "number"
    ) {
      throw new Error("side-view game preset should provide concrete bloom options.");
    }

    expect(debug.debugOverlays.enabled).toBe(true);
    expect(debug.debugOverlays.normalPassVisible).toBe(false);
    expect(debug.particles.count).toBe(debug.particles.reducedMotionCount);
    expect(debug.environmentFog.density).toBeLessThan(normal.environmentFog.density);
    expect(debugBloom.intensity).toBeLessThan(normalBloom.intensity);
  });
});
