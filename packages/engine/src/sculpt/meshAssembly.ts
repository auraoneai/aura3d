/**
 * `@aura3d/engine/sculpt` kernel module: Geometry memoization, bounds, `geometry.define` / `geometry.multiMaterial` spec builders and multi-material node assembly.
 * Re-exported unchanged through `proceduralKernel.ts`; split out of the 5.5.6 kernel with no behaviour change.
 */
import { geometry } from "../agent-api/nodes/geometry.js";
import type { AuraNodeBuilder } from "../agent-api/nodes/builder.js";
import type { AuraMaterialSpec } from "../agent-api/nodes/types.js";
import type { AuraCustomGeometrySpec } from "../agent-api/RootGeometry.js";
import type { AuraGroupNode, MultiMatSlot, RawMesh, V3 } from "./kernelMath.js";
import { bakeMeshCavityAO, paintMeshColors } from "./meshFairing.js";

// ---------------------------------------------------------------------------
// Spec & Multi-Material Node Assemblers (`geometry.define` / `geometry.multiMaterial`)
// ---------------------------------------------------------------------------

const sharedProceduralGeometryMemo = new Map<string, unknown>();

/** Process/page-level bounded cache (`<= 512` entries) so procedural models never rebuild across spawns or restarts. */
export function memoizeGeometry<T>(key: string, build: () => T): T {
  const existing = sharedProceduralGeometryMemo.get(key) as T | undefined;
  if (existing !== undefined) return existing;
  const built = build();
  if (sharedProceduralGeometryMemo.size >= 512) {
    const oldest = sharedProceduralGeometryMemo.keys().next().value;
    if (oldest !== undefined) sharedProceduralGeometryMemo.delete(oldest);
  }
  sharedProceduralGeometryMemo.set(key, built);
  return built;
}

export function computePositionsBounds(positions: Float32Array): { readonly min: [number, number, number]; readonly max: [number, number, number] } | undefined {
  if (positions.length < 3) return undefined;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/** Merges multiple `RawMesh` parts into a single indexed `AuraCustomGeometrySpec` with precomputed bounds. */
export function mergeRawMeshes(meshes: readonly RawMesh[]): AuraCustomGeometrySpec {
  let totalVerts = 0;
  let totalIdx = 0;
  let hasAnyColors = false;
  for (const p of meshes) {
    totalVerts += p.positions.length / 3;
    totalIdx += p.indices.length;
    if (p.colors && p.colors.length > 0) hasAnyColors = true;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = hasAnyColors ? new Float32Array(totalVerts * 4) : undefined;
  const indices = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);

  let vOff = 0;
  let iOff = 0;
  for (const p of meshes) {
    const vCount = p.positions.length / 3;
    positions.set(p.positions, vOff * 3);
    normals.set(p.normals, vOff * 3);
    uvs.set(p.uvs, vOff * 2);
    if (colors) {
      if (p.colors && p.colors.length >= vCount * 4) {
        colors.set(p.colors.slice(0, vCount * 4), vOff * 4);
      } else {
        colors.fill(1, vOff * 4, (vOff + vCount) * 4);
      }
    }
    for (let k = 0; k < p.indices.length; k += 1) {
      indices[iOff + k] = p.indices[k]! + vOff;
    }
    vOff += vCount;
    iOff += p.indices.length;
  }

  return geometry.define({
    positions,
    normals,
    uvs,
    ...(colors ? { colors } : {}),
    indices,
    bounds: computePositionsBounds(positions)
  });
}

/** Packs multi-material `MultiMatSlot[]` into a grouped `AuraCustomGeometrySpec` for `geometry.multiMaterial`. */
export function buildGroupedGeometrySpec(slots: readonly MultiMatSlot[]): AuraCustomGeometrySpec {
  const byMat = new Map<number, RawMesh[]>();
  let hasAnyColors = false;
  for (const s of slots) {
    if (s.mesh.positions.length === 0 || s.mesh.indices.length === 0) continue;
    if (s.mesh.colors && s.mesh.colors.length > 0) hasAnyColors = true;
    let list = byMat.get(s.materialIndex);
    if (!list) byMat.set(s.materialIndex, (list = []));
    list.push(s.mesh);
  }
  const sorted = [...byMat.entries()].sort(([a], [b]) => a - b);

  let totalVerts = 0;
  let totalIdx = 0;
  for (const [, list] of sorted) {
    for (const m of list) {
      totalVerts += m.positions.length / 3;
      totalIdx += m.indices.length;
    }
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = hasAnyColors ? new Float32Array(totalVerts * 4) : undefined;
  const indices = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
  const groups: { start: number; count: number; materialIndex: number }[] = [];

  let vOff = 0;
  let iOff = 0;
  for (const [materialIndex, list] of sorted) {
    const start = iOff;
    for (const m of list) {
      const vCount = m.positions.length / 3;
      positions.set(m.positions, vOff * 3);
      normals.set(m.normals, vOff * 3);
      uvs.set(m.uvs, vOff * 2);
      if (colors) {
        if (m.colors && m.colors.length >= vCount * 4) {
          colors.set(m.colors.slice(0, vCount * 4), vOff * 4);
        } else {
          colors.fill(1, vOff * 4, (vOff + vCount) * 4);
        }
      }
      for (let k = 0; k < m.indices.length; k += 1) {
        indices[iOff + k] = m.indices[k]! + vOff;
      }
      vOff += vCount;
      iOff += m.indices.length;
    }
    groups.push({ start, count: iOff - start, materialIndex });
  }

  return geometry.define({
    positions,
    normals,
    uvs,
    ...(colors ? { colors } : {}),
    indices,
    groups,
    bounds: computePositionsBounds(positions)
  });
}

type PhysicalFinishBucket = "matte" | "coat" | "metallic-coat" | "polished-metal" | "brushed-metal";

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isAchromaticProceduralDetailMap(val: unknown): boolean {
  if (val === undefined) return true;
  if (!val || typeof val !== "object") return false;
  const rec = val as Record<string, unknown>;
  return rec.kind === "aura-procedural-texture" && rec.colorA === undefined && rec.colorB === undefined;
}

function classifyCoalesceableFinish(mat: AuraMaterialSpec | undefined): PhysicalFinishBucket | null {
  if (!mat) return null;
  const rec = mat as Record<string, unknown>;
  if (rec.kind !== undefined && rec.kind !== "standard" && rec.kind !== "physical") return null;
  if (rec.transparent === true) return null;
  if (typeof rec.opacity === "number" && rec.opacity < 0.999) return null;
  if (typeof rec.transmission === "number" && rec.transmission > 0) return null;
  if (typeof rec.emissiveIntensity === "number" && rec.emissiveIntensity > 0.001) return null;
  if (rec.emissive !== undefined) return null;
  if (rec.wireframe === true || rec.flatShading === true || rec.doubleSided === true || rec.side !== undefined) return null;
  if (rec.vertexColors === false || rec.custom !== undefined || rec.pbrMaps !== undefined) return null;
  if (
    rec.map !== undefined ||
    rec.metalnessMap !== undefined ||
    rec.aoMap !== undefined ||
    rec.emissiveMap !== undefined ||
    rec.alphaMap !== undefined
  ) {
    return null;
  }
  if (
    !isAchromaticProceduralDetailMap(rec.normal) ||
    !isAchromaticProceduralDetailMap(rec.normalMap) ||
    !isAchromaticProceduralDetailMap(rec.roughnessMap)
  ) {
    return null;
  }
  if (typeof mat.color !== "string" || !HEX_COLOR_RE.test(mat.color.trim())) return null;
  const metalness = typeof mat.metalness === "number" ? mat.metalness : (typeof rec.metallic === "number" ? rec.metallic : 0);
  const roughness = typeof mat.roughness === "number" ? mat.roughness : 0.5;
  const clearcoat = typeof rec.clearcoat === "number" ? rec.clearcoat : 0;
  if (metalness >= 0.45) {
    if (clearcoat >= 0.5) return "metallic-coat";
    return roughness <= 0.28 && rec.anisotropy === undefined ? "polished-metal" : "brushed-metal";
  }
  return clearcoat >= 0.25 || roughness <= 0.24 ? "coat" : "matte";
}

function coalesceMultiMaterialAssembly(
  slots: readonly MultiMatSlot[],
  materials: readonly AuraMaterialSpec[]
): { readonly slots: readonly MultiMatSlot[]; readonly materials: readonly AuraMaterialSpec[] } {
  const bucketMatIndices = new Map<PhysicalFinishBucket, Set<number>>();
  for (const s of slots) {
    if (s.mesh.positions.length === 0 || s.mesh.indices.length === 0) continue;
    const bucket = classifyCoalesceableFinish(materials[s.materialIndex]);
    if (!bucket) continue;
    let set = bucketMatIndices.get(bucket);
    if (!set) bucketMatIndices.set(bucket, (set = new Set<number>()));
    set.add(s.materialIndex);
  }

  const activeBuckets = new Set<PhysicalFinishBucket>();
  for (const [bucket, set] of bucketMatIndices) {
    if (set.size >= 2) activeBuckets.add(bucket);
  }
  if (activeBuckets.size === 0) {
    return { slots, materials };
  }

  const nextMaterials: AuraMaterialSpec[] = [];
  const passthroughRemap = new Map<number, number>();
  const bucketRemap = new Map<PhysicalFinishBucket, number>();
  const bucketAccum = new Map<
    PhysicalFinishBucket,
    {
      wSum: number;
      dominantWeight: number;
      dominantMat: AuraMaterialSpec;
      roughness: number;
      metalness: number;
      clearcoat: number;
      clearcoatRoughness: number;
      envMapIntensity: number;
    }
  >();

  for (const s of slots) {
    if (s.mesh.positions.length === 0 || s.mesh.indices.length === 0) continue;
    const mat = materials[s.materialIndex];
    const bucket = classifyCoalesceableFinish(mat);
    if (bucket && activeBuckets.has(bucket) && mat) {
      const rec = mat as Record<string, unknown>;
      const w = Math.max(1, s.mesh.positions.length / 3);
      let acc = bucketAccum.get(bucket);
      if (!acc) {
        acc = {
          wSum: 0,
          dominantWeight: 0,
          dominantMat: mat,
          roughness: 0,
          metalness: 0,
          clearcoat: 0,
          clearcoatRoughness: 0,
          envMapIntensity: 0
        };
        bucketAccum.set(bucket, acc);
      }
      if (w > acc.dominantWeight) {
        acc.dominantWeight = w;
        acc.dominantMat = mat;
      }
      const metalVal = typeof mat.metalness === "number" ? mat.metalness : (typeof rec.metallic === "number" ? rec.metallic : 0);
      acc.wSum += w;
      acc.roughness += (typeof mat.roughness === "number" ? mat.roughness : 0.5) * w;
      acc.metalness += metalVal * w;
      acc.clearcoat += (typeof rec.clearcoat === "number" ? rec.clearcoat : 0) * w;
      acc.clearcoatRoughness += (typeof rec.clearcoatRoughness === "number" ? rec.clearcoatRoughness : 0.12) * w;
      acc.envMapIntensity += (typeof rec.envMapIntensity === "number" ? rec.envMapIntensity : 0.85) * w;
    }
  }

  const outSlots: MultiMatSlot[] = [];
  for (const s of slots) {
    if (s.mesh.positions.length === 0 || s.mesh.indices.length === 0) continue;
    const mat = materials[s.materialIndex];
    const bucket = classifyCoalesceableFinish(mat);
    if (bucket && activeBuckets.has(bucket) && mat && typeof mat.color === "string") {
      let targetIdx = bucketRemap.get(bucket);
      if (targetIdx === undefined) {
        const acc = bucketAccum.get(bucket)!;
        const inv = 1 / Math.max(1, acc.wSum);
        const clearcoat = acc.clearcoat * inv;
        const metalAvg = Number((acc.metalness * inv).toFixed(3));
        const domRec = acc.dominantMat as Record<string, unknown>;
        targetIdx = nextMaterials.length;
        bucketRemap.set(bucket, targetIdx);
        nextMaterials.push({
          ...(typeof domRec.sheen === "number" ? { sheen: domRec.sheen } : {}),
          ...(typeof domRec.sheenRoughness === "number" ? { sheenRoughness: domRec.sheenRoughness } : {}),
          ...(typeof domRec.anisotropy === "number" ? { anisotropy: domRec.anisotropy } : {}),
          ...(typeof domRec.anisotropyRotation === "number" ? { anisotropyRotation: domRec.anisotropyRotation } : {}),
          color: "#ffffff",
          roughness: Number((acc.roughness * inv).toFixed(3)),
          metalness: metalAvg,
          metallic: metalAvg,
          envMapIntensity: Number((acc.envMapIntensity * inv).toFixed(3)),
          ...(clearcoat > 0.02
            ? {
                clearcoat: Number(clearcoat.toFixed(3)),
                clearcoatRoughness: Number((acc.clearcoatRoughness * inv).toFixed(3))
              }
            : {})
        } as AuraMaterialSpec);
      }
      const painted = bakeMeshCavityAO(paintMeshColors(s.mesh, mat.color, true), 0.14);
      outSlots.push({ mesh: painted, materialIndex: targetIdx });
    } else {
      let targetIdx = passthroughRemap.get(s.materialIndex);
      if (targetIdx === undefined) {
        targetIdx = nextMaterials.length;
        passthroughRemap.set(s.materialIndex, targetIdx);
        nextMaterials.push(mat ?? { kind: "standard", color: "#cccccc", roughness: 0.5, metalness: 0 });
      }
      outSlots.push({ mesh: s.mesh, materialIndex: targetIdx });
    }
  }

  return { slots: outSlots, materials: nextMaterials };
}

/** Assembles a complete `@aura3d/engine` `geometry.multiMaterial` node with optional runtime ID, tags, and visibility. */
export function assembleMultiMaterialNode(
  name: string,
  slots: readonly MultiMatSlot[],
  materials: readonly AuraMaterialSpec[],
  options: {
    readonly id?: string;
    readonly tags?: readonly string[];
    readonly position?: V3;
    readonly rotation?: V3;
    readonly scale?: number | V3;
    readonly castShadow?: boolean;
    readonly receiveShadow?: boolean;
    readonly visible?: boolean;
    readonly coalesceColors?: boolean;
  } = {}
): AuraNodeBuilder<AuraGroupNode> {
  const coalesced =
    options.coalesceColors === false ? { slots, materials } : coalesceMultiMaterialAssembly(slots, materials);
  const spec = buildGroupedGeometrySpec(coalesced.slots);
  let builder = geometry.multiMaterial(spec, coalesced.materials, {
    name,
    ...(options.position ? { position: options.position } : {}),
    ...(options.rotation ? { rotation: options.rotation } : {}),
    ...(options.scale !== undefined ? { scale: options.scale } : {}),
    castShadow: options.castShadow ?? true,
    receiveShadow: options.receiveShadow ?? true
  });
  if (options.id) {
    builder = builder.runtime({
      id: options.id,
      ...(options.tags ? { tags: [...options.tags] } : {})
    });
  }
  if (options.visible === false) {
    const Ctor = builder.constructor as typeof AuraNodeBuilder<AuraGroupNode>;
    return new Ctor({ ...builder.toJSON(), visible: false });
  }
  return builder;
}
