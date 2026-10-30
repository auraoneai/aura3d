// GU47 WP-6 (E-F) item 6: genre-coloured variants of spark, dust and pickup.

import { describe, expect, it, vi } from "vitest";
import type { AuraVfxGenreVariant } from "../../../../packages/engine/src/contracts/effects";
import type { EffectNodeLike } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { ProductionEffectSystem, type AppLike } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";
import { AURA_VFX_GENRE_VARIANTS, createAppEffects } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

function harness() {
  const appLike: AppLike = { scene: { nodes: [] }, onFrame: () => () => undefined };
  const system = new ProductionEffectSystem(appLike, { tier: "high" });
  const added: EffectNodeLike[] = [];
  const addInstance = system.addInstance.bind(system);
  vi.spyOn(system, "addInstance").mockImplementation((id, node) => { added.push(node); return addInstance(id, node); });
  return { fx: createAppEffects({ onFrame: appLike.onFrame } as never, system), added };
}

const EXPECTED: readonly AuraVfxGenreVariant[] = [
  "spark-fire", "spark-electric", "spark-gold", "spark-magic", "spark-ice",
  "dust-sand", "dust-turf", "dust-snow", "dust-ash", "dust-clay",
  "pickup-gold", "pickup-gem", "pickup-power", "pickup-star", "pickup-heart"
];

describe("GU47 E-F item 6: genre-coloured variants", () => {
  it("ships five variants each of spark, dust and pickup", () => {
    expect([...AURA_VFX_GENRE_VARIANTS]).toEqual(EXPECTED);
  });

  it("each variant keeps its base motion, life, size and blend and changes only the colour", () => {
    const { fx, added } = harness();
    for (const variant of EXPECTED) {
      const base = variant.split("-")[0] as "spark" | "dust" | "pickup";
      fx.burst(base, [0, 0, 0]);
      fx.burst(variant, [0, 0, 0]);
      const [baseNode, variantNode] = added.splice(0, 2);
      const { color: baseColor, id: _baseId, ...baseRest } = baseNode as EffectNodeLike & { id: string };
      const { color: variantColor, id: _variantId, ...variantRest } = variantNode as EffectNodeLike & { id: string };
      expect(variantRest, variant).toEqual(baseRest);
      expect(variantColor, variant).not.toEqual(baseColor);
    }
  });

  it("variants are listed in presets and colours stay distinct within a family", () => {
    const { fx } = harness();
    for (const variant of EXPECTED) expect(fx.presets).toHaveProperty(variant);
    for (const family of ["spark", "dust", "pickup"]) {
      const colors = EXPECTED.filter((name) => name.startsWith(`${family}-`)).map((name) => JSON.stringify((fx.presets as unknown as Record<string, { layers: { color?: unknown }[] }>)[name].layers[0].color));
      expect(new Set(colors).size).toBe(5);
    }
  });

  it("dust variants stay LDR, spark and pickup variants keep HDR energy near their base", () => {
    const { fx } = harness();
    const colorOf = (name: string) => (fx.presets as unknown as Record<string, { layers: { color: number[] }[] }>)[name].layers[0].color;
    const energy = (c: number[]) => c[0] + c[1] + c[2];
    for (const variant of EXPECTED) {
      const c = colorOf(variant);
      if (variant.startsWith("dust-")) expect(Math.max(...c)).toBeLessThanOrEqual(1);
      else expect(energy(c) / energy(colorOf(variant.split("-")[0]))).toBeGreaterThan(0.75);
    }
  });
});
