// GU47 WP-16 (G06) PBL-M2: crusted scrolling lava shader, iridescent crystal shards and gold seeds in the
// diorama; the original look keeps today's materials. Reduced motion slows the lava flow to 30%.
import { describe, expect, it } from "vitest";
import { buildWorld, nodeName } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { WORLD_IDS } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { CRYSTAL_OVERRIDES, LAVA_FRAGMENT_GLSL, LAVA_FRAGMENT_WGSL, LAVA_LOOK, LAVA_VERTEX_WGSL, SEED_OVERRIDES, SURFACES, hazardMaterial, heroCapeMaterial, instancedSurface, lavaMaterial } from "../../../apps/showcase-pips-big-leap/src/game/diorama";

type Node = {
  readonly kind: string;
  readonly name?: string;
  readonly asset?: { readonly id?: string };
  readonly material?: Record<string, unknown> & { readonly custom?: { readonly uniforms?: Record<string, { readonly value: unknown }> } };
  readonly materialOverrides?: readonly unknown[];
  readonly children?: readonly Node[];
};
const flat = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...(n.kind === "group" ? flat(n.children ?? []) : [])]);
const sceneOf = (id: (typeof WORLD_IDS)[number], opts: { look?: "original"; reducedMotion?: boolean } = {}) =>
  flat((buildWorld(worldSpec(id), opts).scene.toJSON() as unknown as { nodes: Node[] }).nodes);

const uniformsOf = (m: unknown): Record<string, { value: unknown }> | undefined => {
  const json = JSON.stringify(m);
  return json.includes("flowSpeed") ? (JSON.parse(json) as { custom?: { uniforms?: Record<string, { value: unknown }> }; uniforms?: Record<string, { value: unknown }> }).custom?.uniforms ?? (JSON.parse(json) as { uniforms?: Record<string, { value: unknown }> }).uniforms : undefined;
};

describe("pips-big-leap materials (PBL-M2)", () => {
  it("draws lava and the shoulder cape as dual-backend GLSL + WGSL shaders, and keeps instanced surfaces extension-free", () => {
    const m = lavaMaterial();
    expect(m.practical).toBe(true);
    expect(LAVA_LOOK.glowIntensity).toBeGreaterThan(1);
    expect(LAVA_FRAGMENT_GLSL).toMatch(/uTime \* flowSpeed/);
    expect(LAVA_VERTEX_WGSL).toContain("a3dRasterPosition");
    expect(LAVA_FRAGMENT_WGSL).toContain("aura.u_flowSpeed");
    expect(JSON.stringify(m)).toContain("flowSpeed");
    expect(hazardMaterial("lava")).toEqual(m);

    const cape = heroCapeMaterial("#3f8cff", 1);
    expect(JSON.stringify(cape)).toContain("a3dRasterPosition");
    expect(JSON.stringify(cape)).toContain("capeColor");

    for (const pair of Object.values(SURFACES)) {
      for (const spec of [instancedSurface(pair.body), instancedSurface(pair.top)]) {
        expect(spec.clearcoat ?? 0).toBe(0);
        expect(spec.sheen ?? 0).toBe(0);
        expect(spec.iridescence ?? 0).toBe(0);
        expect(spec.anisotropy ?? 0).toBe(0);
      }
    }
  });

  it("slows the lava flow to 30% under reduced motion", () => {
    const full = uniformsOf(lavaMaterial(1));
    const reduced = uniformsOf(lavaMaterial(0.3));
    expect(full?.flowSpeed?.value).toBeCloseTo(LAVA_LOOK.flowSpeed, 9);
    expect(reduced?.flowSpeed?.value).toBeCloseTo(LAVA_LOOK.flowSpeed * 0.3, 9);
  });

  it("puts the lava shader on every lava hazard in the diorama and keeps today's emissive slab in the original", () => {
    let lavaPools = 0;
    for (const id of WORLD_IDS) {
      const lava = worldSpec(id).hazards.filter((h) => h.type === "lava");
      lavaPools += lava.length;
      for (const hz of lava) {
        const d = sceneOf(id).find((n) => n.name === `hazard:${hz.id}`)!;
        const o = sceneOf(id, { look: "original" }).find((n) => n.name === `hazard:${hz.id}`)!;
        expect(JSON.stringify(d.material)).toContain("flowSpeed");
        expect(JSON.stringify(o.material)).not.toContain("flowSpeed");
      }
    }
    expect(lavaPools).toBeGreaterThan(0);
  });

  it("gives the procedural quartz crystal clusters an iridescent clearcoat finish in the diorama", () => {
    let crystalMeshes = 0;
    for (const id of WORLD_IDS) {
      for (const n of sceneOf(id)) {
        if (n.material?.name === "faceted quartz crystal") {
          crystalMeshes += 1;
          expect(n.material.clearcoat).toBeGreaterThan(0.5);
          expect(n.material.iridescence).toBeGreaterThan(0.5);
          expect(n.material.practical).toBe(true);
        }
      }
    }
    expect(crystalMeshes).toBeGreaterThan(0);
    expect(CRYSTAL_OVERRIDES[0]?.iridescence).toBe(1);
  });

  it("sculpts the seeds with sun-seed gold studioMetal + practical solar ribs in the diorama only", () => {
    for (const id of WORLD_IDS) {
      for (const s of worldSpec(id).seeds) {
        const dSeed = sceneOf(id).find((n) => n.name === nodeName.seed(s.id));
        expect(dSeed?.kind).toBe("group");
        expect(JSON.stringify(dSeed?.children)).toContain("#ffc23d");
        expect(sceneOf(id, { look: "original" }).find((n) => n.name === nodeName.seed(s.id))?.materialOverrides).toBeUndefined();
      }
    }
    expect(JSON.stringify(SEED_OVERRIDES)).toContain("#ffc23d");
  });
});
