/**
 * IRON CROWN venue dressing (GU47 WP-15): the hero floor deck takes each venue's finish from its look row (IC47-M1) and
 * is instanced (IC47-PF1: 38 draws to 14); static GLB props consolidate their meshes per material at load (IC47-PF1 /
 * IC47-A2 interim). Authored data only (no renderer).
 */
import { describe, expect, it } from "vitest";
import type { AuraSceneNode } from "@aura3d/engine";
import { STAGES } from "../../../apps/showcase-iron-crown/src/game/stages";
import { stageLook } from "../../../apps/showcase-iron-crown/src/game/look";

type Node = AuraSceneNode & { name?: string; role?: string; instances?: unknown[]; material?: { color?: string; emissive?: string; practical?: boolean } };

const isDraw = (node: Node) => node.kind === "primitive" || node.kind === "model";

describe("iron-crown venue dressing (GU47 WP-15)", () => {
  for (const stage of STAGES) {
    const deck = (stage.dressing as Node[]).filter((node) => node.name?.startsWith(`${stage.id}-`));
    const finish = stageLook(stage.id).floor;

    it(`${stage.id}: the floor deck is 14 draws in the venue's own finish (IC47-M1, IC47-PF1)`, () => {
      expect(deck.filter(isDraw)).toHaveLength(14);
      const plankA = deck.find((node) => node.name === `${stage.id}-floor-planks-a`);
      const plankB = deck.find((node) => node.name === `${stage.id}-floor-planks-b`);
      expect(plankA?.material?.color).toBe(finish.base);
      expect(plankB?.material?.color).toBe(finish.plank);
      expect(plankA?.instances?.length).toBe(7);
      expect(plankB?.instances?.length).toBe(6);
      const edge = deck.find((node) => node.name === `${stage.id}-inlay-combat-edge`);
      expect(edge?.material?.emissive).toBe(stageLook(stage.id).accent);
      expect(edge?.material?.practical).toBe(true);
      const courses = deck.find((node) => node.name === `${stage.id}-inlay-courses`);
      expect(courses?.material?.emissive).toBe(finish.inlay);
      expect(courses?.instances?.length).toBe(12);
    });

    it(`${stage.id}: every static GLB prop consolidates its meshes per material (role primaryWorld)`, () => {
      const props = (stage.dressing as Node[]).filter((node) => node.kind === "model" && node.name !== "cr-iron-crown");
      expect(props.length).toBeGreaterThan(0);
      for (const prop of props) expect(prop.role, prop.name).toBe("primaryWorld");
    });
  }
});
