// PRD-07 §8.8 / I3 — the merged decal pass shades with the scene's own lights
// (promote run 38196483050: fixed half-Lambert sun + SH stub + unweighted GGX
// lit dark marks brighter than the floor beneath them).

import { describe, expect, it } from "vitest";
import { decalLightsFrom, resolveDecalLighting } from "../../../../packages/rendering/src/vfx/decalLighting";
import { packDecalLighting } from "../../../../packages/rendering/src/vfx/DecalPass";
import { decalFragmentSource } from "../../../../packages/rendering/src/vfx/shaders/decal.glsl";
import type { CollectedLight } from "../../../../packages/rendering/src/LightCollector";

function light(partial: Partial<CollectedLight>): CollectedLight {
  return {
    kind: "directional", color: [1, 1, 1], intensity: 1, position: [0, 0, 0], direction: [0, -1, 0],
    range: Infinity, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 1, source: { visible: true } as never,
    ...partial
  } as CollectedLight;
}

describe("decal scene lighting", () => {
  it("directional travel direction becomes L toward the light; brightest first", () => {
    const lights = decalLightsFrom([
      light({ kind: "point", position: [1, 2, 3], intensity: 0.5, range: 14 }),
      light({ direction: [-0.6, -0.8, 0], intensity: 2, color: [1, 0.9, 0.8] })
    ]);
    expect(lights[0]!.kind).toBe("directional");
    expect(lights[0]!.vector[0]).toBeCloseTo(0.6, 5);
    expect(lights[0]!.vector[1]).toBeCloseTo(0.8, 5);
    expect(lights[0]!.radiance).toEqual([2, 1.8, 1.6]);
    expect(lights[1]!).toMatchObject({ kind: "point", vector: [1, 2, 3], range: 14 });
  });

  it("drops invisible / zero lights and caps at DECAL_MAX_LIGHTS", () => {
    const many = Array.from({ length: 8 }, (_, i) => light({ intensity: i + 1 }));
    expect(decalLightsFrom(many)).toHaveLength(5);
    expect(decalLightsFrom([light({ intensity: 0 }), light({ source: { visible: false } as never })])).toHaveLength(0);
  });

  it("packs uniforms and reads ambient from environmentLighting", () => {
    const packed = packDecalLighting({ lights: [{ kind: "point", vector: [1, 2, 3], radiance: [4, 5, 6], range: 7 }], ambient: [0, 0, 0] });
    expect(packed.count).toBe(1);
    expect(Array.from(packed.vector.subarray(0, 4))).toEqual([1, 2, 3, 1]);
    expect(Array.from(packed.radiance.subarray(0, 4))).toEqual([4, 5, 6, 7]);
    const resolved = resolveDecalLighting({
      source: { collectedLights: [light({})], environmentLighting: { color: [1, 1, 1], intensity: 0.2 } }
    } as never);
    expect(resolved?.ambient).toEqual([0.2, 0.2, 0.2]);
    expect(resolved?.lights).toHaveLength(1);
  });

  it("fragment uses the scene-light BRDF, not the fixed half-Lambert sun", () => {
    const src = decalFragmentSource({ albedoTexture: false, normalTexture: false, multiply: false, fog: true });
    expect(src).toContain("u_lightVector[5]");
    // A 16-float array binds as mat4 in the WebGL2 binder (0x502 on draw).
    expect(packDecalLighting({ lights: [], ambient: [0, 0, 0] }).vector.length).not.toBe(16);
    expect(src).toContain("u_ambientIrradiance");
    expect(src).not.toContain("halfLambert");
  });
});
