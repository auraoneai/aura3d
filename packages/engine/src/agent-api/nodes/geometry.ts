// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraCustomGeometrySpec } from "../RootGeometry.js";
import type { AuraPrimitiveOptions } from "./types.js";
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
import { primitive } from "./primitives.js";
import { lazyNamespace } from "../lazyNamespace.js";


export const geometry = lazyNamespace(() => ({
  /**
   * Define a mesh. Named attributes accept packed or interleaved typed data:
   * `itemSize` is the component count, while `stride` and `offset` are in
   * components, relative to the supplied typed-array view. Integer attributes
   * can request normalized conversion before they reach the shader.
   */
  define: defineAuraCustomGeometry,
  custom: (spec: AuraCustomGeometrySpec, options: Omit<AuraPrimitiveOptions, "geometry"> = {}) => primitive("custom", { ...options, geometry: defineAuraCustomGeometry(spec) }),
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
  merge: (specs: readonly AuraCustomGeometrySpec[]): AuraCustomGeometrySpec => mergeAuraGeometries(specs)
} as const));

function assertTriangleGeometry(source: AuraCustomGeometrySpec, operation: string, supportsGroups = false): void {
  if (source.topology !== undefined && source.topology !== "triangles") {
    throw new Error(`Aura3D geometry.${operation} requires triangle topology; received ${source.topology}.`);
  }
  if (source.drawRange || (!supportsGroups && source.groups?.length)) {
    throw new Error(`Aura3D geometry.${operation} cannot represent the supplied groups or drawRange; remove them explicitly before deriving edges.`);
  }
}
