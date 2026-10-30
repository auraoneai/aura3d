// GU47 WP-16 (G06) PBL-PF1: the diorama draws decor, hazard dressing and pedestals as instanced models, one draw
// class per asset / fit / shadow flags, and every instance stands where today's model node stood at today's size.
import { describe, expect, it } from "vitest";
import { buildWorld, decorInstance, hazardInstance, propGroupKey } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { WORLD_IDS } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";

type Transform = { readonly position?: readonly number[]; readonly rotation?: readonly number[]; readonly scale?: number | readonly number[] };
type Node = {
  readonly kind: string;
  readonly name?: string;
  readonly asset?: { readonly id?: string };
  readonly position?: readonly number[];
  readonly rotation?: readonly number[];
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly targetHeight?: number;
  readonly targetMaxDimension?: number;
  readonly instances?: readonly Transform[];
  readonly runtime?: unknown;
  readonly children?: readonly Node[];
};

const flat = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...(n.kind === "group" ? flat(n.children ?? []) : [])]);
const sceneOf = (id: (typeof WORLD_IDS)[number], look?: "original") =>
  flat((buildWorld(worldSpec(id), look ? { look } : {}).scene.toJSON() as unknown as { nodes: Node[] }).nodes);
const propNodes = (nodes: readonly Node[]) => nodes.filter((n) => (n.name ?? "").startsWith("pbl-props:"));

describe("pips-big-leap instanced props (PBL-PF1)", () => {
  it("places every decor prop where the original look's model node stands, at its fitted size", () => {
    for (const id of WORLD_IDS) {
      const original = sceneOf(id, "original");
      for (const d of worldSpec(id).decor) {
        const node = original.find((n) => n.name === `${d.id}:${d.kind}`);
        const prop = decorInstance(d);
        expect(node, `${id} ${d.id}`).toBeDefined();
        expect(prop, `${id} ${d.id}`).not.toBeNull();
        expect(prop!.asset.id, `${id} ${d.id}`).toBe(node!.asset?.id);
        expect(prop!.size, `${id} ${d.id}`).toBeCloseTo(prop!.measure === "height" ? node!.targetHeight! : node!.targetMaxDimension!, 9);
        expect(prop!.position, `${id} ${d.id}`).toEqual(node!.position);
        expect(prop!.yaw).toBe(node!.rotation?.[1] ?? 0);
        expect(prop!.receiveShadow).toBe(node!.receiveShadow);
      }
      for (const hz of worldSpec(id).hazards) {
        const node = original.find((n) => n.name === `hazard:${hz.id}:mesh`);
        const prop = hazardInstance(hz);
        expect(prop.asset.id).toBe(node!.asset?.id);
        expect(prop.size).toBeCloseTo(node!.targetHeight!, 9);
        expect(prop.position).toEqual(node!.position);
      }
    }
  });

  it("draws the props through fewer instanced draw classes than props, one instance per prop", () => {
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const nodes = sceneOf(id);
      const props = propNodes(nodes);
      const expected = spec.decor.length + spec.hazards.length + spec.springs.length + spec.checkpoints.length;
      const instanced = props.reduce((sum, n) => sum + (n.instances?.length ?? 0), 0);
      expect(instanced, id).toBe(expected);
      expect(props.length, id).toBeLessThan(expected);
      expect(new Set(props.map((n) => n.name)).size).toBe(props.length);
      for (const n of props) {
        expect(n.runtime, n.name).toBeUndefined();
        expect(n.targetHeight === 1 || n.targetMaxDimension === 1, n.name).toBe(true);
      }
      // No per-prop model node is left in the diorama look.
      expect(nodes.filter((n) => /:(mesh|base|pad)$/.test(n.name ?? "") || spec.decor.some((d) => n.name === `${d.id}:${d.kind}`)).map((n) => n.name), id).toEqual([]);
    }
  });

  it("keeps tiny props (pedestals, crates, barrels, banners, star cores, flowers) out of the shadow map", () => {
    for (const id of WORLD_IDS) {
      for (const n of propNodes(sceneOf(id))) {
        const tiny = /pedestal|crate|barrel|checkpoint|flag|energy|core|sunseed/i.test(n.asset?.id ?? "");
        if (tiny) expect(n.castShadow, n.name).toBe(false);
      }
    }
  });

  it("groups by asset, fit measure and shadow flags", () => {
    const spec = worldSpec("w1");
    const trees = spec.decor.filter((d) => d.kind === "tree" || d.kind === "conifer").map((d) => decorInstance(d)!);
    expect(new Set(trees.map(propGroupKey)).size).toBe(1);
    const shard = spec.decor.find((d) => d.kind === "mushroom")!;
    expect(propGroupKey(decorInstance(shard)!)).toBe(propGroupKey(hazardInstance(spec.hazards[0]!)));
  });

  it("keeps the original look's one-model-per-prop scene", () => {
    for (const id of WORLD_IDS) {
      const nodes = sceneOf(id, "original");
      expect(propNodes(nodes), id).toEqual([]);
      for (const d of worldSpec(id).decor) expect(nodes.some((n) => n.name === `${d.id}:${d.kind}`), `${id} ${d.id}`).toBe(true);
    }
  });
});
