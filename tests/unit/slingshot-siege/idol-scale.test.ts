// FIX-CHECKLIST rule 2: every Idol GLB on every chapter's stage (both looks, incl. instanced prop pools) renders at its
// authored metres: model() / instances.model() normalise to 1 m unless the node carries scaleMode "world" or a target size.
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { buildStage } from "../../../apps/showcase-slingshot-siege/src/game/stage";

type Node = { kind?: string; name?: string; asset?: { url?: string }; scaleMode?: string; targetHeight?: number; targetLength?: number; targetMaxDimension?: number; children?: readonly Node[] };
const json = (n: unknown): Node => (typeof (n as { toJSON?: () => unknown }).toJSON === "function" ? (n as { toJSON: () => Node }).toJSON() : (n as Node));
const walk = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);

describe("slingshot-siege Idol models are world-scale (FIX-CHECKLIST)", () => {
  it("every node drawing an Idol GLB in every chapter uses scaleMode \"world\" or a target size", () => {
    let count = 0;
    for (const chapter of CHAPTERS) {
      for (const reducedMotion of [false, true]) {
        const nodes = walk(buildStage(chapter, { reducedMotion }).nodes.map(json));
        for (const n of nodes.filter((x) => /\/aura-assets\/siege[A-Z]\w*\.[0-9a-f]+\.glb$/.test(x.asset?.url ?? ""))) {
          count += 1;
          const sized = n.scaleMode === "world" || n.targetHeight !== undefined || n.targetLength !== undefined || n.targetMaxDimension !== undefined;
          expect(sized, `${n.kind} ${n.name} ${n.asset?.url}`).toBe(true);
        }
      }
    }
    expect(count).toBeGreaterThan(20);
  });
});
