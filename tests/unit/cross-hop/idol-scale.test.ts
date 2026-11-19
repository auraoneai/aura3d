// FIX-CHECKLIST rule 2: every Idol GLB in every Cross Hop look renders at its authored metres. model() / instances.model()
// normalise to a 1 m max dimension unless the node carries scaleMode "world" (or a target* option), so assert it on the
// built scenes, including the per-frame instanced mover pools.
import { describe, expect, it } from "vitest";
import { buildScene, setLookMode } from "../../../apps/showcase-cross-hop/src/game/core";

type Node = { kind?: string; name?: string; asset?: { url?: string }; scaleMode?: string; targetHeight?: number; targetLength?: number; targetMaxDimension?: number; children?: readonly Node[] };
const walk = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);

describe("cross-hop Idol models are world-scale (FIX-CHECKLIST)", () => {
  for (const look of ["diorama", "vivid", "original"] as const) {
    it(`${look}: every node drawing an Idol GLB uses scaleMode "world" or a target size`, () => {
      setLookMode(look as never);
      const nodes = walk((buildScene() as { nodes: Node[] }).nodes);
      const idol = nodes.filter((n) => /\/aura-assets\/hop[A-Z]\w*\.[0-9a-f]+\.glb$/.test(n.asset?.url ?? ""));
      expect(idol.length, look).toBeGreaterThan(0);
      for (const n of idol) {
        const sized = n.scaleMode === "world" || n.targetHeight !== undefined || n.targetLength !== undefined || n.targetMaxDimension !== undefined;
        expect(sized, `${look} ${n.kind} ${n.name} ${n.asset?.url}`).toBe(true);
      }
    });
  }
});
