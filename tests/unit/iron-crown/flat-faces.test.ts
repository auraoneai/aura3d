import { describe, expect, it } from "vitest";
import type { AuraSceneNode } from "@aura3d/engine";
import { createFighterNode, FIGHTERS } from "../../../apps/showcase-iron-crown/src/game/fighters";

function collectMeshes(node: AuraSceneNode, out: AuraSceneNode[] = []): AuraSceneNode[] {
  const k = (node as { kind?: string }).kind;
  if (k === "primitive" || k === "mesh") out.push(node);
  const children = (node as { children?: readonly AuraSceneNode[] }).children;
  if (children) {
    for (const child of children) collectMeshes(child, out);
  }
  return out;
}

describe("iron crown fighters: sculpted visored helms & multi-material gladiator anatomy", () => {
  for (const fighter of FIGHTERS) {
    it(`${fighter.id}: builds grounded sabatons, greaves, cuirass, pauldrons, articulated arms, weapon, shield and visored helm without external textures`, () => {
      const root = createFighterNode("player", fighter, fighter.name, [0, 0, 0], 1, {}).toJSON();
      expect(root.kind).toBe("group");
      const meshes = collectMeshes(root);
      expect(meshes.length).toBeGreaterThanOrEqual(24);
      const json = JSON.stringify(root);
      expect(json).toContain(`"id":"player-head"`);
      expect(json).toContain(`"id":"player-torso"`);
      expect(json).toContain(`"id":"player-weapon"`);
      expect(json).toContain(`"id":"player-shield"`);
      expect(json).toContain(`"id":"player-ankle-l"`);
      expect(json).toContain(`"id":"player-ankle-r"`);
      expect(json).not.toContain(".glb");
    });
  }
});
