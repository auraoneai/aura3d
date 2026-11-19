// Idol grounding pass: every Idol model standing on the island, the cliffs, the launch deck, the fortress pad or in the
// shallows sits 0.1-0.2 m into the surface sampled under its footprint (no floating, no deep sinking); far islands sink
// their painted plinth 0.15 m under the sea; the pines are anchored render-only nodes.
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { SEA_LEVEL, buildStage } from "../../../apps/showcase-slingshot-siege/src/game/stage";
import { FAR_PIECE_ASSETS, FAR_PIECE_PLINTH, FAR_PIECE_SINK, FAR_SET_PIECES, SEA_STACK_PLACEMENT } from "../../../apps/showcase-slingshot-siege/src/art/setPieces";
import { footprintOf, footprintSamples, stageSurface } from "./stage-surface";

type Node = { kind?: string; name?: string; asset?: { url?: string }; position?: number[]; rotation?: number[]; scale?: number | number[];
  instances?: { position?: number[]; rotation?: number[]; scale?: number | number[] }[]; children?: Node[]; physics?: unknown; collider?: unknown; instanceWind?: unknown };
const json = (n: unknown): Node => (typeof (n as { toJSON?: () => unknown }).toJSON === "function" ? (n as { toJSON: () => Node }).toJSON() : (n as Node));
const walk = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);

/** Models that stand on a surface (wings, sails, the fork, pooled/parked actors and the far islands are checked elsewhere). */
const STANDING = /^(prop-watchtower|prop-gatehouse|prop-windmill|prop-stone-bridge|fortress-flag-bastion|slingshot-base|island-tree-\d|fg-crate-\d|fg-barrel-\d)$/;

describe("slingshot-siege Idol grounding", () => {
  for (const chapter of [CHAPTERS[0]!, CHAPTERS[5]!]) {
    const nodes = walk(buildStage(chapter, { reducedMotion: false }).nodes.map(json));
    const surface = stageSurface(nodes);

    it(`ch${chapter.id}: every standing Idol model is sunk 0.1-0.2 m into the surface under its footprint`, () => {
      const checked: string[] = [];
      for (const n of nodes) {
        if (n.kind !== "model" || !STANDING.test(n.name ?? "")) continue;
        const fp = footprintOf(n.asset!.url!);
        const places = n.instances?.length ? n.instances : [n];
        places.forEach((t, i) => {
          const label = `${n.name}${places.length > 1 ? `#${i}` : ""}`;
          // The stacked crate stands on the crate below it, not on the island.
          if (label === "fg-crate-1") {
            const below = nodes.find((m) => m.name === "fg-crate-0")!;
            const top = below.position![1]! + fp.max[1]! * (below.scale as number);
            expect(top - t.position![1]!, label).toBeGreaterThanOrEqual(0);
            expect(top - t.position![1]!, label).toBeLessThan(0.05);
            return;
          }
          const pts = footprintSamples(t, fp.min, fp.max);
          const H = pts.map((p) => surface.height(p[0], p[2]));
          const base = pts[0]![1];
          const lo = Math.min(...H), hi = Math.max(...H);
          // No gap anywhere under the footprint: the base is at least 0.1 m under the lowest sampled surface ...
          expect(lo - base, `${label}: min surface ${lo.toFixed(2)} vs base ${base.toFixed(2)}`).toBeGreaterThanOrEqual(0.095);
          // ... but not more than 0.2 m under it, and no more than 0.35 m under the highest point of a sloped footprint.
          expect(lo - base, `${label}: sunk too deep`).toBeLessThanOrEqual(0.205);
          expect(hi - base, `${label}: footprint straddles a step (${lo.toFixed(2)}..${hi.toFixed(2)})`).toBeLessThanOrEqual(0.35);
          checked.push(label);
        });
      }
      expect(checked.length).toBe(15);
    });
  }

  it("far islands sink their painted plinth 0.15 m under the sea", () => {
    expect(SEA_STACK_PLACEMENT.position[1] + FAR_PIECE_PLINTH.sling_seaStackIsland).toBeCloseTo(SEA_LEVEL - FAR_PIECE_SINK, 2);
    for (const p of FAR_SET_PIECES) {
      expect(p.position[1] + FAR_PIECE_PLINTH[p.key], p.key).toBeCloseTo(SEA_LEVEL - FAR_PIECE_SINK, 2);
      expect(FAR_PIECE_ASSETS[p.key]).toBeTruthy();
    }
  });

  it("decorative pines, crates and kegs are plain anchored nodes: no instancing, runtime id, physics, collider or wind", () => {
    const nodes = walk(buildStage(CHAPTERS[0]!, { reducedMotion: false }).nodes.map(json)) as (Node & { runtime?: unknown })[];
    const decor = nodes.filter((n) => /^(island-tree|fg-crate|fg-barrel)-\d$/.test(n.name ?? ""));
    expect(decor).toHaveLength(10);
    for (const n of decor) {
      expect(n.kind, n.name).toBe("model");
      expect(n.instances, n.name).toBeUndefined();
      expect(n.runtime, n.name).toBeUndefined();
      expect(n.physics, n.name).toBeUndefined();
      expect(n.collider, n.name).toBeUndefined();
      expect(n.instanceWind, n.name).toBeUndefined();
    }
  });
});
