// GU47 WP-16 (G06) PBL-M2: crusted scrolling lava shader, iridescent crystal shards and gold seeds in the
// diorama; the original look keeps today's materials. Reduced motion slows the lava flow to 30%.
import { describe, expect, it } from "vitest";
import { buildWorld, nodeName } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { WORLD_IDS } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { CRYSTAL_OVERRIDES, LAVA_FRAGMENT_GLSL, LAVA_LOOK, SEED_OVERRIDES, hazardMaterial, lavaMaterial } from "../../../apps/showcase-pips-big-leap/src/game/diorama";

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
  it("draws lava as a practical custom shader with HDR cracks that scroll", () => {
    const m = lavaMaterial();
    expect(m.practical).toBe(true);
    expect(LAVA_LOOK.glowIntensity).toBeGreaterThan(1);
    expect(LAVA_FRAGMENT_GLSL).toMatch(/uTime \* flowSpeed/);
    expect(JSON.stringify(m)).toContain("flowSpeed");
    expect(hazardMaterial("lava")).toEqual(m);
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

  it("gives the crystal-shard instances the iridescent rim, and no other prop draw", () => {
    let shardDraws = 0;
    for (const id of WORLD_IDS) {
      for (const n of sceneOf(id).filter((x) => (x.name ?? "").startsWith("pbl-props:"))) {
        const shard = /crystalShard/i.test(n.asset?.id ?? "");
        if (shard) shardDraws += 1;
        expect(n.materialOverrides, n.name).toEqual(shard ? CRYSTAL_OVERRIDES : undefined);
      }
    }
    expect(shardDraws).toBeGreaterThan(0);
  });

  it("lifts the seeds to sun-seed gold in the diorama only", () => {
    for (const id of WORLD_IDS) {
      for (const s of worldSpec(id).seeds) {
        expect(sceneOf(id).find((n) => n.name === nodeName.seed(s.id))?.materialOverrides).toEqual(SEED_OVERRIDES);
        expect(sceneOf(id, { look: "original" }).find((n) => n.name === nodeName.seed(s.id))?.materialOverrides).toBeUndefined();
      }
    }
    expect(JSON.stringify(SEED_OVERRIDES)).toContain("#ffc23d");
  });
});
