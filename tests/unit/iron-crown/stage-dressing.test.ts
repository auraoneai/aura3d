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

const STAGE_PREFIX: Record<string, string> = {
  "neo-tokyo-rooftop": "nt-",
  "bangkok-dock": "bk-",
  "colosseum-ruins": "co-",
  "desert-airbase": "ab-",
  "himalayan-monastery": "mo-",
  "crown-arena": "cr-"
};

describe("iron-crown venue dressing (GU47 WP-15 / WP-05)", () => {
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

    it(`${stage.id}: mounts bespoke procedural set-pieces with canonical prefix behind the fight lane (z <= -1.1) and zero static GLB props`, () => {
      const models = (stage.dressing as Node[]).filter((node) => node.kind === "model");
      expect(models).toHaveLength(0);
      const prefix = STAGE_PREFIX[stage.id]!;
      const props = (stage.dressing as (Node & { position?: readonly number[]; instances?: { position: readonly number[] }[] })[]).filter((node) =>
        node.name?.startsWith(prefix)
      );
      expect(props.length).toBeGreaterThanOrEqual(8);
      for (const prop of props) {
        if (prop.position) {
          expect(prop.position[2], prop.name).toBeLessThanOrEqual(-1.1);
        }
        for (const inst of prop.instances ?? []) {
          expect(inst.position[2], prop.name).toBeLessThanOrEqual(-1.1);
        }
      }
    });
  }
});
