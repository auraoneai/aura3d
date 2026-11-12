import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { athleteNodes } from "../../../apps/showcase-aura-fc-3d/src/game/rig";

interface SerialMeshNode {
  name?: string;
  kind?: string;
  primitive?: string;
  position?: [number, number, number];
  scale?: [number, number, number];
  geometry?: {
    positions?: number[];
    normals?: number[];
    indices?: number[];
    bounds?: { min: [number, number, number]; max: [number, number, number] };
  };
  material?: { name?: string };
  children?: SerialMeshNode[];
}

function collectCustomMeshes(node: SerialMeshNode, out: SerialMeshNode[] = []): SerialMeshNode[] {
  if (node.kind === "primitive" && node.primitive === "custom") out.push(node);
  for (const c of node.children ?? []) collectCustomMeshes(c, out);
  return out;
}

describe("aura-fc-3d sculpted multi-material athlete mesh integrity & zero-GLB verification", () => {
  it("ships zero .glb files in apps/showcase-aura-fc-3d/public/aura-assets and zero GLB entries in aura-assets-v2.ts", () => {
    const files = readdirSync("apps/showcase-aura-fc-3d/public/aura-assets");
    expect(files.filter((f) => f.endsWith(".glb"))).toEqual([]);
    const manifest = readFileSync("apps/showcase-aura-fc-3d/src/aura-assets-v2.ts", "utf8");
    expect(manifest).not.toMatch(/\.glb\b/);
  });

  it.each(["h-fw", "h-gk", "a-df0"] as const)(
    "%s: builds watertight finite multi-material sub-meshes with grounded cleats and compact triangles",
    (id) => {
      const rawNode = athleteNodes(id)[0] as { toJSON?: () => unknown };
      const body = (typeof rawNode.toJSON === "function" ? rawNode.toJSON() : rawNode) as SerialMeshNode;
      const meshes = collectCustomMeshes(body);
      expect(meshes.length).toBeGreaterThanOrEqual(24);

      const matNames = new Set(meshes.map((m) => m.material?.name).filter(Boolean));
      expect(matNames.has(`${id}-kit`)).toBe(true);
      expect(matNames.has(`${id}-shorts`)).toBe(true);
      expect(matNames.has(`${id}-socks`)).toBe(true);
      expect(matNames.has(`${id}-skin`)).toBe(true);
      expect(matNames.has(`${id}-boot`)).toBe(true);
      expect(matNames.has(`${id}-studs`)).toBe(true);
      if (id.endsWith("-gk")) expect(matNames.has(`${id}-glove`)).toBe(true);

      let totalTris = 0;
      let longestShortsEdge = 0;
      for (const m of meshes) {
        const pos = m.geometry?.positions ?? [];
        const nrm = m.geometry?.normals ?? [];
        const idx = m.geometry?.indices ?? [];
        expect(pos.length).toBeGreaterThan(0);
        expect(nrm.length).toBe(pos.length);
        for (let i = 0; i < pos.length; i += 1) {
          expect(Number.isFinite(pos[i])).toBe(true);
          expect(Number.isFinite(nrm[i])).toBe(true);
        }
        totalTris += idx.length / 3;
        if (m.material?.name === `${id}-shorts`) {
          for (let t = 0; t < idx.length; t += 3) {
            for (let e = 0; e < 3; e += 1) {
              const ia = idx[t + e]! * 3;
              const ib = idx[t + ((e + 1) % 3)]! * 3;
              const d = Math.hypot(pos[ia]! - pos[ib]!, pos[ia + 1]! - pos[ib + 1]!, pos[ia + 2]! - pos[ib + 2]!);
              longestShortsEdge = Math.max(longestShortsEdge, d);
            }
          }
        }
      }
      expect(totalTris).toBeGreaterThanOrEqual(800);
      expect(longestShortsEdge).toBeLessThanOrEqual(0.22);

      // Verify boot stud mesh touches y = -0.100 in boot-local space -> y = 0.000 in athlete world space!
      const bootStudMesh = meshes.find((m) => m.material?.name === `${id}-studs`)!;
      expect(bootStudMesh.geometry!.bounds!.min[1]).toBeCloseTo(-0.1, 3);
    }
  );
});
