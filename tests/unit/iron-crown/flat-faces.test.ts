import { describe, expect, it } from "vitest";
import type { AuraSceneNode } from "@aura3d/engine";
import { GLADIATOR_JOINT_SUFFIXES } from "../../../apps/showcase-iron-crown/src/art/proceduralModels";
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

function findRuntimeGroup(node: AuraSceneNode, runtimeId: string): AuraSceneNode | undefined {
  const rtId = (node as { runtime?: { id?: string } }).runtime?.id;
  if (rtId === runtimeId) return node;
  const children = (node as { children?: readonly AuraSceneNode[] }).children;
  if (children) {
    for (const child of children) {
      const hit = findRuntimeGroup(child, runtimeId);
      if (hit) return hit;
    }
  }
  return undefined;
}

function countSubtreeVertices(node: AuraSceneNode): number {
  let total = 0;
  for (const m of collectMeshes(node)) {
    const pos = (m as { geometry?: { positions?: ArrayLike<number> } }).geometry?.positions;
    if (pos) total += Math.floor(pos.length / 3);
  }
  return total;
}

type Vec3 = readonly [number, number, number];

function rotateX([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}
function rotateY([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}
function rotateZ([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c, z];
}

function applyNodeTransform(
  p: Vec3,
  node: AuraSceneNode
): Vec3 {
  const rec = node as {
    position?: readonly [number, number, number];
    rotation?: readonly [number, number, number];
    scale?: number | readonly [number, number, number];
  };
  let [x, y, z] = p;
  if (typeof rec.scale === "number") {
    x *= rec.scale;
    y *= rec.scale;
    z *= rec.scale;
  } else if (Array.isArray(rec.scale)) {
    x *= rec.scale[0];
    y *= rec.scale[1];
    z *= rec.scale[2];
  }
  if (rec.rotation) {
    [x, y, z] = rotateX([x, y, z], rec.rotation[0]);
    [x, y, z] = rotateY([x, y, z], rec.rotation[1]);
    [x, y, z] = rotateZ([x, y, z], rec.rotation[2]);
  }
  if (rec.position) {
    x += rec.position[0];
    y += rec.position[1];
    z += rec.position[2];
  }
  return [x, y, z];
}

function computeWorldYBounds(
  node: AuraSceneNode,
  ancestors: readonly AuraSceneNode[] = []
): { minY: number; maxY: number } {
  const chain = [...ancestors, node];
  let minY = Infinity;
  let maxY = -Infinity;
  const k = (node as { kind?: string }).kind;
  if (k === "primitive" || k === "mesh") {
    const pos = (node as { geometry?: { positions?: ArrayLike<number> } }).geometry?.positions;
    if (pos) {
      for (let i = 0; i < pos.length; i += 3) {
        let pt: Vec3 = [pos[i]!, pos[i + 1]!, pos[i + 2]!];
        for (let c = chain.length - 1; c >= 0; c -= 1) {
          pt = applyNodeTransform(pt, chain[c]!);
        }
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      }
    }
  }
  const children = (node as { children?: readonly AuraSceneNode[] }).children;
  if (children) {
    for (const child of children) {
      const b = computeWorldYBounds(child, chain);
      if (b.minY < minY) minY = b.minY;
      if (b.maxY > maxY) maxY = b.maxY;
    }
  }
  return { minY, maxY };
}

describe("iron crown fighters: sculpted visored helms & multi-material gladiator anatomy", () => {
  const helmSignatures = new Set<string>();
  const weaponSignatures = new Set<string>();
  const shieldSignatures = new Set<string>();

  for (const fighter of FIGHTERS) {
    it(`${fighter.id}: builds grounded sabatons, greaves, cuirass, pauldrons, articulated arms, weapon, shield and visored helm with baked cavity AO`, () => {
      const root = createFighterNode("player", fighter, fighter.name, [0, 0, 0], 1, {}).toJSON();
      expect(root.kind).toBe("group");
      const meshes = collectMeshes(root);
      expect(meshes.length).toBeGreaterThanOrEqual(40);

      const totalVerts = countSubtreeVertices(root);
      expect(totalVerts).toBeGreaterThanOrEqual(5000);

      for (const suffix of GLADIATOR_JOINT_SUFFIXES) {
        expect(findRuntimeGroup(root, `player-${suffix}`), `missing joint player-${suffix}`).toBeDefined();
      }

      // Verify baked linear RGBA cavity AO vertex colors across sculpted armor & cloth meshes
      let coloredMeshCount = 0;
      let minShade = Infinity;
      let maxShade = -Infinity;
      for (const m of meshes) {
        const colors = (m as { geometry?: { colors?: ArrayLike<number> } }).geometry?.colors;
        if (colors && colors.length >= 4) {
          coloredMeshCount += 1;
          for (let i = 0; i < colors.length; i += 4) {
            const r = colors[i]!;
            expect(Number.isFinite(r)).toBe(true);
            if (r < minShade) minShade = r;
            if (r > maxShade) maxShade = r;
          }
        }
      }
      expect(coloredMeshCount).toBe(meshes.length);
      expect(maxShade - minShade).toBeGreaterThan(0.12);

      // Verify exact sabaton grounding (`minY = 0`) and heroic silhouette height
      const bounds = computeWorldYBounds(root);
      expect(Math.abs(bounds.minY)).toBeLessThan(0.002);
      expect(bounds.maxY).toBeGreaterThan(1.65);
      expect(bounds.maxY).toBeLessThan(2.55);

      const headNode = findRuntimeGroup(root, "player-head")!;
      const weaponNode = findRuntimeGroup(root, "player-weapon")!;
      const shieldNode = findRuntimeGroup(root, "player-shield")!;
      helmSignatures.add(`${countSubtreeVertices(headNode)}:${collectMeshes(headNode).length}`);
      weaponSignatures.add(`${countSubtreeVertices(weaponNode)}:${collectMeshes(weaponNode).length}`);
      shieldSignatures.add(`${countSubtreeVertices(shieldNode)}:${collectMeshes(shieldNode).length}`);

      const json = JSON.stringify(root);
      expect(json).not.toContain(".glb");
    });
  }

  it("gives all 6 roster archetypes bespoke helm, weapon, and shield/offhand 3D silhouettes", () => {
    expect(helmSignatures.size).toBe(FIGHTERS.length);
    expect(weaponSignatures.size).toBe(FIGHTERS.length);
    expect(shieldSignatures.size).toBe(FIGHTERS.length);
  });
});
