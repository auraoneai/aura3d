// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraCustomGeometrySpec } from "../RootGeometry.js";
import type { AuraPrimitiveOptions } from "./types.js";
import {
  auraGeometryToNonIndexed,
  defineAuraCustomGeometry,
  defineAuraDynamicGeometry,
  mergeAuraGeometries,
  normalizeGeometryAttributes
} from "../RootGeometry.js";
import { convexParityMesh, edgesParityMesh, wireframeParityMesh, type ConvexPointInput } from "@aura3d/rendering";
import { primitive } from "./primitives.js";
import { lazyNamespace } from "../lazyNamespace.js";


export const geometry = lazyNamespace(() => ({
  define: defineAuraCustomGeometry,
  custom: (spec: AuraCustomGeometrySpec, options: Omit<AuraPrimitiveOptions, "geometry"> = {}) => primitive("custom", { ...options, geometry: defineAuraCustomGeometry(spec) }),
  /**
   * threejs-parity SG-05 (L2-03): typed-array dynamic geometry — `geometry.dynamic`
   * validates + tags the spec so `handle.setGeometry(spec)`/`updateAttribute`
   * rewrite the live buffers in place (no realloc while vertex count is stable).
   */
  dynamic: defineAuraDynamicGeometry,
  /**
   * threejs-parity SG-04 (L2-06): three's `EdgesGeometry(geometry, thresholdAngle)` —
   * emits a `"lines"` topology spec holding one segment per sharp edge.
   */
  edges: (source: AuraCustomGeometrySpec, thresholdAngle = 1): AuraCustomGeometrySpec => {
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
    const normalized = normalizeGeometryAttributes(source);
    const mesh = wireframeParityMesh({
      positions: normalized.positions,
      indices: normalized.indices ? Array.from(normalized.indices) : undefined
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
