/**
 * IRON CROWN GU47 IC47-W1: every open-air venue has a far backdrop 10-60 m out within its draw budget (<= 60; here
 * <= 4 instanced draws), casting no shadows; lit parts are practicals; the enclosed Crown has none; layouts are fixed.
 */
import { describe, expect, it } from "vitest";
import type { AuraSceneNode } from "@aura3d/engine";
import { venueBackdrop } from "../../../apps/showcase-iron-crown/src/game/backdrop";
import { STAGES } from "../../../apps/showcase-iron-crown/src/game/stages";

type Inst = { position: [number, number, number] };
type Node = AuraSceneNode & { name?: string; castShadow?: boolean; instances?: Inst[]; material?: { emissive?: string; practical?: boolean } };

describe("iron-crown far backdrops (GU47 IC47-W1)", () => {
  for (const stage of STAGES) {
    const nodes = venueBackdrop(stage.id) as Node[];
    if (stage.id === "crown-arena") {
      it("crown-arena: enclosed, no far layer", () => expect(nodes).toHaveLength(0));
      continue;
    }
    it(`${stage.id}: 2-4 instanced draws, 10-60 m out, no shadow casting, mounted in the stage dressing`, () => {
      expect(nodes.length).toBeGreaterThanOrEqual(2);
      expect(nodes.length).toBeLessThanOrEqual(4);
      for (const node of nodes) {
        expect(node.name?.startsWith(`bd-${stage.id}-`), node.name).toBe(true);
        expect(node.castShadow).toBe(false);
        expect(node.instances?.length ?? 0).toBeGreaterThan(0);
        if (node.material?.emissive) expect(node.material.practical, node.name).toBe(true);
        for (const inst of node.instances ?? []) {
          // At least 10 m from the fight, at most 60 m behind it.
          expect(Math.hypot(inst.position[0], inst.position[2]), node.name).toBeGreaterThanOrEqual(10);
          expect(-inst.position[2], node.name).toBeLessThanOrEqual(60);
        }
      }
      const names = (stage.dressing as Node[]).map((n) => n.name);
      for (const node of nodes) expect(names).toContain(node.name);
    });
  }

  it("is deterministic", () => {
    for (const stage of STAGES) expect(JSON.stringify(venueBackdrop(stage.id))).toBe(JSON.stringify(venueBackdrop(stage.id)));
  });
});
