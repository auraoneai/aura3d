/**
 * IRON CROWN GU47 IC47-W1: every open-air venue has a far backdrop 10-60 m out within its draw budget (<= 60; here
 * <= 4 instanced draws), casting no shadows; lit parts are practicals; the enclosed Crown has none; layouts are fixed.
 */
import { describe, expect, it } from "vitest";
import type { AuraSceneNode } from "@aura3d/engine";
import { venueBackdrop } from "../../../apps/showcase-iron-crown/src/game/backdrop";
import { STAGES } from "../../../apps/showcase-iron-crown/src/game/stages";

type Inst = { position: [number, number, number] };
type Node = AuraSceneNode & {
  name?: string;
  kind?: string;
  castShadow?: boolean;
  instances?: Inst[];
  position?: [number, number, number];
  transform?: { position?: [number, number, number] };
  material?: { emissive?: string; practical?: boolean };
};

describe("iron-crown far backdrops (GU47 IC47-W1)", () => {
  for (const stage of STAGES) {
    const nodes = venueBackdrop(stage.id) as Node[];
    if (stage.id === "crown-arena") {
      it("crown-arena: enclosed, no far layer", () => expect(nodes).toHaveLength(0));
      continue;
    }
    it(`${stage.id}: 2-4 instanced draws plus single-draw Meshy models, 10-60 m out, no shadow casting, mounted in the stage dressing`, () => {
      // Wave 2: the Meshy backdrop models (one single-material draw each) sit beside the instanced primitive layers.
      const models = nodes.filter((node) => node.kind === "model");
      const layers = nodes.filter((node) => node.kind !== "model");
      expect(layers.length).toBeGreaterThanOrEqual(1);
      expect(layers.length).toBeLessThanOrEqual(4);
      expect(models.length).toBeLessThanOrEqual(6);
      expect(layers.length + models.length).toBeLessThanOrEqual(10);
      for (const node of nodes) {
        expect(node.name?.startsWith(`bd-${stage.id}-`), node.name).toBe(true);
        expect(node.castShadow).toBe(false);
        if (node.kind === "model") {
          const at = (node.position ?? node.transform?.position)!;
          expect(Math.hypot(at[0], at[2]), node.name).toBeGreaterThanOrEqual(10);
          expect(-at[2], node.name).toBeLessThanOrEqual(60);
          continue;
        }
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
