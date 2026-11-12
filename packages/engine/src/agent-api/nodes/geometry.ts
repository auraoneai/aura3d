// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraCustomGeometrySpec } from "../RootGeometry.js";
import type { AuraGroupNode, AuraPrimitiveOptions } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { group } from "./groups.js";
import {
  applyAuraGeometryMatrix4,
  auraGeometryToNonIndexed,
  computeAuraGeometryBounds,
  computeAuraGeometryNormals,
  defineAuraCustomGeometry,
  defineAuraDynamicGeometry,
  mergeAuraGeometries,
  normalizeGeometryAttributes
} from "../RootGeometry.js";
import { convexParityMesh, edgesParityMesh, wireframeParityMesh, type ConvexPointInput } from "@aura3d/rendering";
import { buildUVAtlas } from "../geometry/UVAtlas.js";
import { PRIMITIVE_OPTION_KEYS, primitive } from "./primitives.js";
import { lazyNamespace } from "../lazyNamespace.js";


export const geometry = lazyNamespace(() => ({
  /**
   * Define a mesh. Named attributes accept packed or interleaved typed data:
   * `itemSize` is the component count, while `stride` and `offset` are in
   * components, relative to the supplied typed-array view. Integer attributes
   * can request normalized conversion before they reach the shader.
   * S5-WP19-04: `dynamic` is only the marker `geometry.dynamic` sets; nothing
   * reads it (`handle.setGeometry` accepts any custom geometry), so an authored
   * `dynamic` is rejected instead of being carried as a silent no-op.
   */
  define: (spec: Omit<AuraCustomGeometrySpec, "kind">): AuraCustomGeometrySpec => {
    if (spec && typeof spec === "object" && spec.dynamic !== undefined) {
      throw Object.assign(new Error(
        "AURA_GEOMETRY_OPTION_UNSUPPORTED: geometry.define does not read \"dynamic\"; the flag has no runtime effect " +
        "(handle.setGeometry accepts any custom geometry). Remove it, or build a runtime-mutable spec with geometry.dynamic(spec)."
      ), { code: "AURA_GEOMETRY_OPTION_UNSUPPORTED", field: "dynamic" });
    }
    return defineAuraCustomGeometry(spec);
  },
  // S5-WP19-04: the positional spec is the geometry; an untyped `geometry` option would be overwritten, so it is reported as OPTION_IGNORED.
  custom: (spec: AuraCustomGeometrySpec, options: Omit<AuraPrimitiveOptions, "geometry"> = {}) => primitive("custom", { ...options, geometry: defineAuraCustomGeometry(spec) }, {
    builder: "geometry.custom", validKeys: PRIMITIVE_OPTION_KEYS.filter((key) => key !== "geometry"), options
  }),
  /**
   * threejs-parity SG-05 (L2-03): typed-array dynamic geometry — `geometry.dynamic`
   * validates + tags the spec so `handle.setGeometry(spec)`/`updateAttribute`
   * rewrite the live buffers in place (no realloc while vertex count is stable).
   */
  dynamic: defineAuraDynamicGeometry,
  /** Compute an axis-aligned position bound in geometry-local coordinates. */
  computeBounds: computeAuraGeometryBounds,
  /** Compute area-weighted normals from a triangle stream. */
  computeNormals: computeAuraGeometryNormals,
  /** Transform positions and inverse-transpose normals; rejects singular matrices. */
  applyMatrix4: applyAuraGeometryMatrix4,
  /**
   * Generate a bounded UV atlas for triangle geometry. By default charts are
   * planar; folded, non-manifold and caller-selected edges become seams. Select an
   * explicit destination channel; authored UVs are preserved unless overwrite
   * is requested. The result owns its arrays and does not allocate GPU assets.
   * `maxNormalDeviationRadians` opts into projecting gently curved faces onto
   * each chart's seed plane, subject to `planeTolerance` and bounded overlap
   * checks. Projection may shorten edges and areas; the option caps that loss
   * at 5%, plus at most 1% float32 quantization allowance. Omit it to keep the
   * existing planar behavior. Alternatively, `unfoldMaxDihedralRadians` opts
   * into bounded intrinsic unfolding of adjacent triangles, preserving their
   * edge lengths and area within float32 precision limits. Sharp folds,
   * overlaps and incompatible loops split; this is not general unwrapping.
   * Invalid, degenerate, cancelled or over-budget inputs are rejected.
   */
  buildUVAtlas,
  /**
   * threejs-parity SG-04 (L2-06): three's `EdgesGeometry(geometry, thresholdAngle)` —
   * emits a `"lines"` topology spec holding one segment per sharp edge.
   */
  edges: (source: AuraCustomGeometrySpec, thresholdAngle = 1): AuraCustomGeometrySpec => {
    assertTriangleGeometry(source, "edges");
    const normalized = normalizeGeometryAttributes(source);
    const mesh = edgesParityMesh(
      { positions: normalized.positions, indices: normalized.indices ? Array.from(normalized.indices) : undefined },
      thresholdAngle
    );
    return {
      kind: "aura-custom-geometry",
      positions: mesh.positions,
      indices: mesh.indices ?? [],
      topology: "lines"
    };
  },
  /**
   * threejs-parity SG-04 (L2-06): three's `WireframeGeometry` — every triangle
   * edge once, in traversal order, honoring the source groups.
   */
  wireframe: (source: AuraCustomGeometrySpec): AuraCustomGeometrySpec => {
    assertTriangleGeometry(source, "wireframe", true);
    const normalized = normalizeGeometryAttributes(source);
    // The edge generator accepts index ranges for groups. Provide sequential
    // indices for a non-indexed source so its groups have the same meaning.
    const indices = normalized.indices
      ? Array.from(normalized.indices)
      : source.groups?.length ? Array.from({ length: normalized.vertexCount }, (_, i) => i) : undefined;
    const mesh = wireframeParityMesh({
      positions: normalized.positions,
      indices,
      groups: source.groups
    });
    return {
      kind: "aura-custom-geometry",
      positions: mesh.positions,
      indices: mesh.indices ?? [],
      topology: "lines"
    };
  },
  /**
   * threejs-parity AD-07 (L2-07): three's `ConvexGeometry(points)` — QuickHull
   * hull as a non-indexed triangle list with flat face normals. Needs ≥ 4
   * non-coplanar points.
   */
  convex: (points: readonly ConvexPointInput[]): AuraCustomGeometrySpec => {
    if (points.length < 4) throw new Error("Aura3D geometry.convex requires at least four points.");
    const mesh = convexParityMesh({ points });
    if (mesh.positions.length === 0) throw new Error("Aura3D geometry.convex points are degenerate (coplanar or coincident); no hull could be built.");
    return {
      kind: "aura-custom-geometry",
      positions: mesh.positions,
      normals: mesh.normals,
      indices: []
    };
  },
  /** threejs-parity SG-05 (L2-05): `geometry.toNonIndexed` — BufferGeometry.toNonIndexed, one vertex per index in index order. */
  toNonIndexed: (source: AuraCustomGeometrySpec): AuraCustomGeometrySpec => auraGeometryToNonIndexed(source),
  /** threejs-parity SG-05 (L2-05): `geometry.merge` — BufferGeometryUtils.mergeGeometries over specs. */
  merge: (specs: readonly AuraCustomGeometrySpec[]): AuraCustomGeometrySpec => mergeAuraGeometries(specs),
  /**
   * Split a grouped geometry (three's `geometry.groups`) into one spec per
   * material slot, ascending by `materialIndex`. Each slot keeps the shared
   * vertex attributes and only the index ranges of its groups.
   */
  splitGroups: (source: AuraCustomGeometrySpec): readonly { readonly materialIndex: number; readonly geometry: AuraCustomGeometrySpec }[] =>
    splitAuraGeometryGroups(source),
  /**
   * three's `new Mesh(geometry, [materialA, materialB, ...])`: each geometry
   * group is drawn with `materials[group.materialIndex]` (for example the
   * per-sample material slots of a `@aura3d/addons` MarchingCubes
   * isosurface). Lowered to a transform group holding one ordinary custom
   * primitive per used slot, so every slot is a separate material in the
   * normal scene draw path.
   */
  multiMaterial: (
    source: AuraCustomGeometrySpec,
    materials: readonly NonNullable<AuraPrimitiveOptions["material"]>[],
    options: Omit<AuraPrimitiveOptions, "geometry" | "material" | "instances" | "instanceColors" | "lod"> = {}
  ): AuraNodeBuilder<AuraGroupNode> => {
    if (materials.length === 0) throw new Error("Aura3D geometry.multiMaterial requires at least one material.");
    const slots = splitAuraGeometryGroups(source, true);
    for (const slot of slots) {
      if (materials[slot.materialIndex] === undefined) {
        throw new RangeError(`Aura3D geometry.multiMaterial: group materialIndex ${slot.materialIndex} has no material (received ${materials.length}).`);
      }
    }
    const { name, position, pivot, rotation, scale, lookAt, quaternion, rotationOrder, physics: _physics, ...shared } = options;
    if (_physics !== undefined) throw new Error("Aura3D geometry.multiMaterial cannot attach physics to a multi-material group; add a separate collider node.");
    const base = name ?? "multi-material";
    const children = slots.map((slot) => primitive("custom", {
      ...shared,
      name: `${base} material ${slot.materialIndex}`,
      material: materials[slot.materialIndex],
      geometry: defineAuraCustomGeometry(slot.geometry)
    }));
    const builder = group(base, children, {
      ...(position ? { position } : {}),
      ...(pivot ? { pivot } : {}),
      ...(rotation ? { rotation } : {}),
      ...(scale !== undefined ? { scale } : {}),
      ...(lookAt ? { lookAt } : {})
    });
    if (quaternion === undefined && rotationOrder === undefined) return builder;
    return new AuraNodeBuilder<AuraGroupNode>({ ...builder.toJSON(), ...(quaternion ? { quaternion } : {}), ...(rotationOrder ? { rotationOrder } : {}) });
  }
} as const));

function splitAuraGeometryGroups(
  source: AuraCustomGeometrySpec,
  compactVertices = false
): readonly { readonly materialIndex: number; readonly geometry: AuraCustomGeometrySpec }[] {
  if (!source.groups?.length) throw new Error("Aura3D geometry.splitGroups requires geometry groups.");
  if (source.drawRange) throw new Error("Aura3D geometry.splitGroups cannot combine groups with a drawRange; remove the drawRange first.");
  const normalized = normalizeGeometryAttributes(source);
  const indexCount = normalized.indices ? normalized.indices.length : normalized.vertexCount;
  const bySlot = new Map<number, number[]>();
  for (const [index, group] of source.groups.entries()) {
    const materialIndex = group.materialIndex ?? 0;
    if (!Number.isInteger(group.start) || !Number.isInteger(group.count) || group.start < 0 || group.count < 0 ||
        group.start + group.count > indexCount || !Number.isInteger(materialIndex) || materialIndex < 0) {
      throw new RangeError(`Aura3D geometry.splitGroups: groups[${index}] must be an integer range inside the index stream with a non-negative material index.`);
    }
    let list = bySlot.get(materialIndex);
    if (!list) bySlot.set(materialIndex, list = []);
    for (let offset = group.start; offset < group.start + group.count; offset += 1) {
      list.push(normalized.indices ? normalized.indices[offset]! : offset);
    }
  }
  const { groups: _groups, bounds: _bounds, ...attributes } = source;
  const canCompactStreams = compactVertices && source.attributes === undefined && source.morphTargets === undefined;
  const remap = compactVertices ? new Int32Array(normalized.vertexCount) : null;
  const usedOrigins = canCompactStreams ? new Int32Array(normalized.vertexCount) : null;
  return [...bySlot.entries()].sort(([a], [b]) => a - b).map(([materialIndex, indices]) => {
    if (!compactVertices || indices.length === 0 || !remap) {
      return {
        materialIndex,
        geometry: { ...attributes, indices: normalized.vertexCount > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices) }
      };
    }
    remap.fill(-1);
    let usedCount = 0;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const remapped = new Uint32Array(indices.length);
    for (let i = 0; i < indices.length; i += 1) {
      const oldIdx = indices[i]!;
      let nextIdx = remap[oldIdx]!;
      if (nextIdx < 0) {
        nextIdx = usedCount++;
        remap[oldIdx] = nextIdx;
        if (usedOrigins) usedOrigins[nextIdx] = oldIdx;
        const pBase = oldIdx * 3;
        const px = normalized.positions[pBase]!;
        const py = normalized.positions[pBase + 1]!;
        const pz = normalized.positions[pBase + 2]!;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (pz < minZ) minZ = pz;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
        if (pz > maxZ) maxZ = pz;
      }
      remapped[i] = nextIdx;
    }
    const slotBounds = { min: [minX, minY, minZ] as const, max: [maxX, maxY, maxZ] as const };
    if (!canCompactStreams || !usedOrigins) {
      return {
        materialIndex,
        geometry: {
          ...attributes,
          bounds: slotBounds,
          indices: normalized.vertexCount > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices)
        }
      };
    }
    const positions = new Float32Array(usedCount * 3);
    const normals = normalized.normals ? new Float32Array(usedCount * 3) : undefined;
    const uvs = normalized.uvs ? new Float32Array(usedCount * 2) : undefined;
    const uv1s = normalized.uv1s ? new Float32Array(usedCount * 2) : undefined;
    const colors = normalized.colors ? new Float32Array(usedCount * 4) : undefined;
    for (let v = 0; v < usedCount; v += 1) {
      const orig = usedOrigins[v]!;
      const pSrc = orig * 3;
      const pDst = v * 3;
      positions[pDst] = normalized.positions[pSrc]!;
      positions[pDst + 1] = normalized.positions[pSrc + 1]!;
      positions[pDst + 2] = normalized.positions[pSrc + 2]!;
      if (normals && normalized.normals) {
        normals[pDst] = normalized.normals[pSrc]!;
        normals[pDst + 1] = normalized.normals[pSrc + 1]!;
        normals[pDst + 2] = normalized.normals[pSrc + 2]!;
      }
      if (uvs && normalized.uvs) {
        const uSrc = orig * 2, uDst = v * 2;
        uvs[uDst] = normalized.uvs[uSrc]!;
        uvs[uDst + 1] = normalized.uvs[uSrc + 1]!;
      }
      if (uv1s && normalized.uv1s) {
        const uSrc = orig * 2, uDst = v * 2;
        uv1s[uDst] = normalized.uv1s[uSrc]!;
        uv1s[uDst + 1] = normalized.uv1s[uSrc + 1]!;
      }
      if (colors && normalized.colors) {
        const cSrc = orig * 4, cDst = v * 4;
        colors[cDst] = normalized.colors[cSrc]!;
        colors[cDst + 1] = normalized.colors[cSrc + 1]!;
        colors[cDst + 2] = normalized.colors[cSrc + 2]!;
        colors[cDst + 3] = normalized.colors[cSrc + 3]!;
      }
    }
    return {
      materialIndex,
      geometry: {
        kind: "aura-custom-geometry" as const,
        positions,
        ...(normals ? { normals } : {}),
        ...(uvs ? { uvs } : {}),
        ...(uv1s ? { uv1s } : {}),
        ...(colors ? { colors } : {}),
        ...(source.topology ? { topology: source.topology } : {}),
        bounds: slotBounds,
        indices: usedCount > 65535 ? remapped : Uint16Array.from(remapped)
      }
    };
  });
}

function assertTriangleGeometry(source: AuraCustomGeometrySpec, operation: string, supportsGroups = false): void {
  if (source.topology !== undefined && source.topology !== "triangles") {
    throw new Error(`Aura3D geometry.${operation} requires triangle topology; received ${source.topology}.`);
  }
  if (source.drawRange || (!supportsGroups && source.groups?.length)) {
    throw new Error(`Aura3D geometry.${operation} cannot represent the supplied groups or drawRange; remove them explicitly before deriving edges.`);
  }
}
