import { game, geometry, type AuraCustomGeometrySpec, type AuraMaterialSpec } from "@aura3d/engine";
import type { Vec3 } from "../contract/units";
import type { NodeInput } from "./rigPort";

/** Unit cube centred on the origin (24 vertices with face normals), the geometry every static box is stamped from. */
export function unitBoxGeometry(): AuraCustomGeometrySpec {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const faces: Array<{ n: Vec3; u: Vec3; v: Vec3 }> = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] }
  ];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      positions.push(0.5 * (f.n[0] + a * f.u[0] + b * f.v[0]), 0.5 * (f.n[1] + a * f.u[1] + b * f.v[1]), 0.5 * (f.n[2] + a * f.u[2] + b * f.v[2]));
      normals.push(...f.n);
      uvs.push((a + 1) / 2, (b + 1) / 2);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { kind: "aura-custom-geometry", positions, normals, uvs, indices } as unknown as AuraCustomGeometrySpec;
}

/** Bake axis-aligned boxes (size + centre) into one geometry; an empty list returns undefined (nothing to draw). */
export function mergeBoxes(parts: ReadonlyArray<{ size: Vec3; position: Vec3 }>): AuraCustomGeometrySpec | undefined {
  if (parts.length === 0) return undefined;
  const unit = unitBoxGeometry() as unknown as { positions: number[]; normals: number[]; uvs: number[]; indices: number[] };
  const vertexCount = unit.positions.length / 3;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  parts.forEach((part, k) => {
    for (let i = 0; i < vertexCount; i++) {
      positions.push(unit.positions[i * 3]! * part.size[0] + part.position[0], unit.positions[i * 3 + 1]! * part.size[1] + part.position[1], unit.positions[i * 3 + 2]! * part.size[2] + part.position[2]);
      normals.push(unit.normals[i * 3]!, unit.normals[i * 3 + 1]!, unit.normals[i * 3 + 2]!);
      uvs.push(unit.uvs[i * 2]!, unit.uvs[i * 2 + 1]!);
    }
    for (const idx of unit.indices) indices.push(idx + k * vertexCount);
  });
  return { kind: "aura-custom-geometry", positions, normals, uvs, indices } as unknown as AuraCustomGeometrySpec;
}

/** Collects static boxes per material and bakes each group into a single mesh (one draw call per material). */
export function createStaticBoxes() {
  const groups = new Map<string, { material: AuraMaterialSpec; castShadow: boolean; parts: Array<{ size: Vec3; position: Vec3 }> }>();
  return {
    /** Solid decor (stands, boards, chair, net) casts the sun shadows the live page shows; the flat court lines never do. */
    box(key: string, material: AuraMaterialSpec, size: Vec3, position: Vec3, castShadow: boolean = key !== "lines"): void {
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { material, castShadow, parts: [] }));
      g.parts.push({ size, position });
    },
    count(): number {
      let n = 0;
      for (const g of groups.values()) n += g.parts.length;
      return n;
    },
    /** One node per material group; empty groups are skipped (never an empty draw). Groups named in `runtimeIds` get a runtime handle (venue recolours). */
    build(prefix = "static", runtimeIds: Readonly<Record<string, string>> = {}): NodeInput[] {
      const nodes: NodeInput[] = [];
      for (const [key, g] of groups) {
        const merged = mergeBoxes(g.parts);
        if (!merged) continue;
        const node = geometry.custom(merged, { name: `${prefix}-${key}`, material: g.material, castShadow: g.castShadow });
        const id = runtimeIds[key];
        nodes.push((id ? node.runtime(game.runtimeNode(id)) : node) as unknown as NodeInput);
      }
      return nodes;
    }
  };
}
