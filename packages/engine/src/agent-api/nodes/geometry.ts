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
   */
  define: defineAuraCustomGeometry,
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
    const slots = splitAuraGeometryGroups(source);
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

function splitAuraGeometryGroups(source: AuraCustomGeometrySpec): readonly { readonly materialIndex: number; readonly geometry: AuraCustomGeometrySpec }[] {
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
  return [...bySlot.entries()].sort(([a], [b]) => a - b).map(([materialIndex, indices]) => ({
    materialIndex,
    geometry: { ...attributes, indices: normalized.vertexCount > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices) }
  }));
}

function assertTriangleGeometry(source: AuraCustomGeometrySpec, operation: string, supportsGroups = false): void {
  if (source.topology !== undefined && source.topology !== "triangles") {
    throw new Error(`Aura3D geometry.${operation} requires triangle topology; received ${source.topology}.`);
  }
  if (source.drawRange || (!supportsGroups && source.groups?.length)) {
    throw new Error(`Aura3D geometry.${operation} cannot represent the supplied groups or drawRange; remove them explicitly before deriving edges.`);
  }
}
