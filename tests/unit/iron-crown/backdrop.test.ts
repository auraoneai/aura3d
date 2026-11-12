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
    it(`${stage.id}: procedural instanced layers and multi-material landmarks, 10-60 m out, no shadow casting, mounted in the stage dressing`, () => {
      const models = nodes.filter((node) => node.kind === "model");
      expect(models).toHaveLength(0);
      const landmarks = nodes.filter((node) => node.kind === "group");
      const layers = nodes.filter((node) => node.kind !== "group");
      expect(layers.length).toBeGreaterThanOrEqual(1);
      expect(layers.length).toBeLessThanOrEqual(5);
      expect(landmarks.length).toBeLessThanOrEqual(8);
      expect(layers.length + landmarks.length).toBeLessThanOrEqual(12);
      for (const node of nodes) {
        expect(node.name?.startsWith(`bd-${stage.id}-`), node.name).toBe(true);
        if (node.kind === "group") {
          const at = (node.position ?? node.transform?.position)!;
          expect(Math.hypot(at[0], at[2]), node.name).toBeGreaterThanOrEqual(10);
          expect(-at[2], node.name).toBeLessThanOrEqual(60);
          const children = ((node as unknown as { children?: Node[] }).children ?? []);
          expect(children.length, node.name).toBeGreaterThan(0);
          for (const child of children) {
            expect(child.castShadow, child.name).toBe(false);
            if (child.material?.emissive) expect(child.material.practical, child.name).toBe(true);
          }
          continue;
        }
        expect(node.castShadow, node.name).toBe(false);
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
