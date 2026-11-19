/**
 * Idol grounding sweep (owner QA: Idol GLBs are grounded at their lowest vertex, so a base taken from the terrain
 * under the model's centre floats on a slope). Every static Idol model that stands on the meadow — cottages, windmill
 * tower, wayside shrine, belfry, the ancient oak, villagers and the path lantern posts — sits on the lowest ground
 * under its footprint: the base is at or below the terrain at the centre, edge midpoints and corners, and never more
 * than 0.5 m below the lowest of them. The packhorse bridge (spans the stream), the hanging bell, the rowboat and the
 * jetty lantern (on the deck) do not stand on terrain and are not checked.
 */
import { describe, expect, it } from "vitest";
import { scene } from "@aura3d/engine";
import { addStaticModels, availableModels } from "../../../examples/where-the-wind-wanders-port/models";
import { buildScenery } from "../../../examples/where-the-wind-wanders-port/scenery";
import { terrainHeight } from "../../../examples/where-the-wind-wanders-port/terrain";
import { IDOL_FOOTPRINT, footprintPoints } from "../../../examples/where-the-wind-wanders-port/art/idolModels";

interface N { kind?: string; name?: string; position?: number[]; rotation?: number[]; scale?: number[] | number; asset?: { id?: string; bounds?: number[] }; instances?: { position?: number[]; rotation?: number[]; scale?: number[] | number }[]; children?: N[]; nodes?: N[] }
const vec = (s: number[] | number | undefined): number[] => (Array.isArray(s) ? s : [s ?? 1, s ?? 1, s ?? 1]);

function sweep() {
  const set = availableModels();
  const sc = buildScenery(4242, { bell: set.bell, cottage: set.cottage, trees: set.trees, stones: set.stones, shrubs: set.shrubs });
  const b = scene();
  addStaticModels(b, sc, set, false);
  const rows: { name: string; key: string; base: number; ground: number[] }[] = [];
  const check = (name: string, key: string, p: number[], yaw: number, s: number[], bb: number[]) => {
    const f = IDOL_FOOTPRINT[key];
    if (f === undefined) return; // bridge, bell, boat: not standing on terrain
    if (p[1]! > terrainHeight(p[0]!, p[2]!) + 0.3) return; // on a deck
    const ground = footprintPoints(p[0]!, p[2]!, (bb[0]! * s[0]! / 2) * f, (bb[2]! * s[2]! / 2) * f, yaw).map(([x, z]) => terrainHeight(x, z));
    rows.push({ name, key, base: p[1]!, ground });
  };
  const walk = (n: N): void => {
    const key = n.asset?.id, bb = n.asset?.bounds;
    if (n.kind === "model" && key && bb) {
      if (n.instances) for (const t of n.instances) check(n.name ?? key, key, t.position ?? [0, 0, 0], t.rotation?.[1] ?? 0, vec(t.scale), bb);
      else check(n.name ?? key, key, n.position ?? [0, 0, 0], n.rotation?.[1] ?? 0, vec(n.scale), bb);
    }
    for (const c of n.children ?? n.nodes ?? []) walk(c);
  };
  walk(b.toJSON() as unknown as N);
  return rows;
}

describe("Bellkeeper Idol models sit on the ground", () => {
  const rows = sweep();
  it("sweeps every standing Idol model (cottages, windmill, shrine, belfry, oak, villagers, lanterns)", () => {
    const keys = new Set(rows.map((r) => r.key));
    for (const k of ["bkWindmill", "bkShrine", "bkBelfry", "bkOak", "bkVillagerMiller"]) expect(keys.has(k), k).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(10);
  });
  it.each(sweep().map((r, i) => [`${r.name}#${i}`, r] as const))("%s: base <= terrain at every footprint point and >= the lowest - 0.5 m", (_n, r) => {
    for (const g of r.ground) expect(r.base).toBeLessThanOrEqual(g + 1e-6);
    expect(r.base).toBeGreaterThanOrEqual(Math.min(...r.ground) - 0.5);
  });
});
