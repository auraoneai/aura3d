/**
 * Per-primitive submission diagnostics.
 *
 * ## Why an aggregate draw-call count was not enough
 *
 * The renderer already reports `drawCalls`, and that single number is what finally *disproved* the
 * "renderer drops secondary glTF mesh primitives" diagnosis: `turboRaceCar` reported `drawCalls: 10` for a
 * 5-primitive asset (5 primitives x 2 passes), so nothing was being dropped.
 *
 * But arriving at that took reading a probe JSON and reasoning about pass multipliers by hand. A count cannot
 * answer the questions that actually matter when a part is missing from a frame:
 *
 *   - *which* primitive is absent, by label
 *   - whether it was skipped for a missing geometry/material binding rather than never enqueued
 *   - whether its transform is degenerate (a zero-scale matrix draws nothing and reports no error)
 *   - whether it is transparent, and therefore ordering-dependent
 *   - whether its index range exceeds its vertex count, which silently truncates
 *
 * Each of those was hypothesised during the false diagnosis and checked by hand. This module makes them a
 * measurement instead, so the next investigation starts from a table rather than from a count.
 *
 * ## Scope boundary, stated plainly
 *
 * This audits the **submission path**: what the renderer was asked to draw and whether each request is
 * internally coherent. It is not GPU evidence. It cannot prove a pixel was written, and it deliberately does
 * not claim to -- rendered proof comes from retained screenshots. `WebGL2Device`'s `errorCheckMode: "strict"`
 * remains the source of real `gl.getError()` results; a caller may pass those in via `glErrorsByLabel`.
 */

import type { Bounds3 } from "./Geometry.js";
import type { RenderItem } from "./ForwardPass.js";

/** Why a primitive would not reach the GPU, or `null` when it is submittable. */
export type PrimitiveSubmissionBlocker =
  /** Geometry carries no vertices, so there is nothing to rasterize. */
  | "empty-vertex-buffer"
  /** An index range reaches beyond the available indices and would truncate or read garbage. */
  | "index-range-overflow"
  /** An index value exceeds the vertex count, which draws undefined geometry. */
  | "index-out-of-vertex-range"
  /** The model matrix is not finite; a NaN transform silently removes geometry with no GL error. */
  | "non-finite-transform"
  /** The model matrix collapses the primitive to zero volume. */
  | "degenerate-transform"
  /** No material bound, so the pass has no shader to draw with. */
  | "missing-material";

/**
 * Per-primitive frustum result.
 *
 * ## Why a three-way verdict rather than a boolean
 *
 * The renderer already counts `culledObjects` and `frustumTestedObjects` in aggregate, but a count cannot say
 * *which* primitive was culled. That left a real ambiguity in the per-draw GL proof: a primitive reporting
 * `writtenPixels: 0` with a null pixel bounding box could equally be culled before submission, submitted but
 * drawn entirely off-screen, or genuinely broken. Those three demand different responses -- expected behaviour,
 * a camera-framing bug, and a renderer bug respectively -- and conflating them is how the original
 * "renderer drops wheel primitives" misdiagnosis became plausible.
 *
 * `not-tested` is distinct from `inside` on purpose: items with a draw range or morph targets are deliberately
 * exempt from culling, and reporting them as "inside the frustum" would claim a test that never ran.
 */
export type PrimitiveFrustumVerdict =
  /** World bounds intersect the frustum; the primitive should reach the rasterizer. */
  | "inside"
  /** World bounds lie entirely outside the frustum; the renderer would legitimately skip it. */
  | "culled"
  /** Exempt from culling (draw range or morph targets), so no test was performed. */
  | "not-tested"
  /** No camera was supplied, so the question was not asked. */
  | "no-camera";

/** One primitive's submission record. */
export interface PrimitiveSubmissionRecord {
  /** Caller-supplied label, or a synthesised index when absent. */
  readonly label: string;
  /**
   * Source identity, for correlating a record back to the asset and glTF primitive it came from.
   *
   * The original missing-wheel investigation had to correlate "which primitive did not draw" against a glTF by
   * hand, because the audit recorded only a label. `assetId` / `meshIndex` / `primitiveIndex` are optional
   * because a synthetic or procedurally-built primitive has no glTF provenance -- but when a loader supplies
   * them, "wheelBackL did not draw" becomes "mesh 3 primitive 0 of turboRaceCar did not draw".
   */
  readonly assetId: string | undefined;
  readonly meshIndex: number | undefined;
  readonly primitiveIndex: number | undefined;
  /** Submission order index, always present, so every record is addressable even without glTF provenance. */
  readonly submissionIndex: number;
  /**
   * Index component type as reported by the buffer, e.g. `uint16` / `uint32`.
   *
   * Recorded because an index-type downcast was one of the hypotheses for the missing wheels: a uint32 index
   * buffer silently narrowed to uint16 draws garbage or nothing for vertices past 65535.
   */
  readonly indexType: string | undefined;
  /**
   * Material alpha mode, cutoff and effective opacity.
   *
   * These three decide whether a primitive is discarded by blending or alpha testing rather than by geometry --
   * the failure mode where an opaque tyre mesh vanishes because it inherited a transparent material. `blended`
   * already records *that* a material blends; these record *why* and *how much*.
   */
  readonly alphaMode: string | undefined;
  readonly alphaCutoff: number | undefined;
  readonly effectiveOpacity: number;
  /**
   * Whether every texture the material references is uploaded and ready.
   *
   * `undefined` when the caller did not report texture state. A primitive drawing with an unready texture is a
   * distinct failure from one that never drew, and conflating them sent the original investigation down the
   * wrong path.
   */
  readonly texturesReady: boolean | undefined;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly topology: string;
  /** Instance count; 1 for non-instanced primitives. */
  readonly instanceCount: number;
  readonly materialName: string | undefined;
  /** True when the material blends, making draw order significant. */
  readonly blended: boolean;
  /** Local-space bounds as reported by the geometry. */
  readonly localBounds: Bounds3;
  /** Whether a model matrix was supplied at all. */
  readonly hasModelMatrix: boolean;
  /** Uniform scale magnitude implied by the model matrix, or 1 when none was supplied. */
  readonly transformScale: number;
  readonly skinned: boolean;
  readonly morphed: boolean;
  /** GL error reported for this primitive, when the caller supplied real device errors. */
  readonly glError: string | undefined;
  /** Frustum result for this primitive against the supplied camera matrix. */
  readonly frustum: PrimitiveFrustumVerdict;
  /** World-space bounds the frustum test used, so an unexpected verdict is diagnosable. */
  readonly worldBounds: Bounds3 | undefined;
  /** Reasons this primitive would not draw. Empty means submittable. */
  readonly blockers: readonly PrimitiveSubmissionBlocker[];
}

export interface PrimitiveSubmissionAudit {
  readonly kind: "aura-primitive-submission-audit";
  /** Every primitive handed in, in submission order. */
  readonly records: readonly PrimitiveSubmissionRecord[];
  /** Primitives with no blockers. */
  readonly submittable: number;
  /** Primitives that would not reach the GPU. */
  readonly blocked: number;
  /** Distinct materials in use, which bounds achievable batching. */
  readonly distinctMaterials: number;
  /** Labels of blocked primitives, so a failure names the missing part. */
  readonly blockedLabels: readonly string[];
  /** Primitives whose world bounds fall outside the frustum. */
  readonly culled: number;
  /** Labels of culled primitives, so "missing from the frame" is attributable rather than inferred. */
  readonly culledLabels: readonly string[];
  /**
   * Expected draw calls for a given pass count.
   *
   * Encoded because reading `drawCalls: 10` and knowing it means "5 primitives, 2 passes" required prior
   * knowledge of the pipeline. Making the multiplier explicit is what turns that number into evidence.
   */
  expectedDrawCalls(passCount: number): number;
}

export interface PrimitiveSubmissionAuditOptions {
  /** Real `gl.getError()` results keyed by primitive label, from a device in `strict` error-check mode. */
  readonly glErrorsByLabel?: Readonly<Record<string, string>> | undefined;
  /**
   * View-projection matrix to test each primitive's world bounds against.
   *
   * Supplied as a raw matrix rather than a camera object so a caller can audit against whatever matrix it actually
   * rendered with -- including one it built by hand -- instead of a reconstruction that might differ.
   */
  readonly viewProjectionMatrix?: Float32Array | readonly number[] | undefined;
  /**
   * glTF provenance per primitive label, so a record can name the asset and primitive it came from.
   *
   * Supplied by the caller rather than read off the render item because `RenderItem` is renderer-facing and
   * deliberately knows nothing about glTF. A loader that has the mapping can hand it in; one that does not
   * still gets a complete audit with `undefined` provenance.
   */
  readonly provenanceByLabel?: Readonly<Record<string, {
    readonly assetId?: string | undefined;
    readonly meshIndex?: number | undefined;
    readonly primitiveIndex?: number | undefined;
  }>> | undefined;
  /** Texture-readiness per primitive label, from whatever tracks upload state. */
  readonly texturesReadyByLabel?: Readonly<Record<string, boolean>> | undefined;
}

/**
 * Audit a render-item list for submission coherence.
 *
 * Pure and synchronous: it inspects the same structures the forward pass consumes, so it can run in a unit test
 * without a device, a canvas, or a browser. That matters because the failure it guards against was diagnosed
 * with a browser and still reached the wrong conclusion.
 */
export function auditPrimitiveSubmission(
  items: readonly RenderItem[],
  options: PrimitiveSubmissionAuditOptions = {}
): PrimitiveSubmissionAudit {
  const records: PrimitiveSubmissionRecord[] = [];

  for (const [index, item] of items.entries()) {
    const label = item.label ?? `primitive-${index}`;
    const geometry = item.geometry;
    const vertexCount = geometry.vertexBuffer.vertexCount;
    const indexBuffer = geometry.indexBuffer;
    const availableIndices = indexBuffer?.data.length ?? 0;
    const drawRange = item.drawRange;
    const indexCount = drawRange?.count ?? availableIndices;
    const material = item.material;
    /*
     * `RenderMaterial` is `Material | MaterialInstance`, and only `Material` carries `name`/`renderState`
     * directly -- an instance wraps a `baseMaterial`. Resolving through the wrapper means an instanced material
     * is audited by the same rules as a direct one, rather than silently reporting `<none>`.
     */
    const baseMaterial = material && "baseMaterial" in material ? material.baseMaterial : material;
    const blockers: PrimitiveSubmissionBlocker[] = [];

    if (vertexCount <= 0) blockers.push("empty-vertex-buffer");
    if (!material) blockers.push("missing-material");

    if (indexBuffer) {
      const start = drawRange?.start ?? 0;
      if (start + indexCount > availableIndices) blockers.push("index-range-overflow");
      // An index beyond the vertex count draws undefined geometry rather than failing loudly.
      let maxIndex = -1;
      for (const value of indexBuffer.data) maxIndex = Math.max(maxIndex, value);
      if (vertexCount > 0 && maxIndex >= vertexCount) blockers.push("index-out-of-vertex-range");
    }

    const modelMatrix = item.modelMatrix;
    let transformScale = 1;
    if (modelMatrix) {
      const values = Array.from(modelMatrix);
      if (values.length !== 16 || !values.every((value) => Number.isFinite(value))) {
        blockers.push("non-finite-transform");
      } else {
        // Magnitude of the three basis vectors: a zero on any axis flattens the primitive away.
        const axisLengths = [0, 1, 2].map((axis) => Math.hypot(
          values[axis * 4] ?? 0,
          values[axis * 4 + 1] ?? 0,
          values[axis * 4 + 2] ?? 0
        ));
        transformScale = Math.min(...axisLengths);
        if (transformScale <= 1e-9) blockers.push("degenerate-transform");
      }
    }

    /*
     * Alpha state, read from the real material APIs rather than guessed.
     *
     * These decide whether a primitive is discarded by blending or alpha testing rather than by geometry -- the
     * failure mode where an opaque tyre mesh vanishes because it inherited a transparent material. `blended`
     * already records *that* a material blends; these record why and by how much.
     *
     * `alphaCutoff` comes from the `u_alphaCutoff` uniform the PBR/unlit materials declare, and opacity from the
     * alpha channel of `u_baseColorFactor`. `effectiveOpacity` defaults to 1 when unstated: reporting an unknown
     * opacity as 0 would invent a discard reason the renderer never applied.
     */
    const cutoffParameter = baseMaterial?.getParameter?.("u_alphaCutoff");
    const alphaCutoff = typeof cutoffParameter === "number" ? cutoffParameter : undefined;
    const baseColorFactor = baseMaterial?.getParameter?.("u_baseColorFactor");
    const declaredAlpha = Array.isArray(baseColorFactor) && baseColorFactor.length >= 4
      ? baseColorFactor[3]
      : undefined;
    const effectiveOpacity = typeof declaredAlpha === "number" && Number.isFinite(declaredAlpha)
      ? Math.min(1, Math.max(0, declaredAlpha))
      : 1;
    /*
     * Alpha mode, derived from the state the renderer actually uses.
     *
     * There is no glTF-style `alphaMode` field on `RenderState`; the equivalent facts are `blend` plus a nonzero
     * cutoff. Mapping them to glTF's vocabulary keeps the record readable next to a source asset without
     * inventing a field the renderer does not have.
     */
    const alphaMode = baseMaterial?.renderState?.blend === true
      ? "BLEND"
      : alphaCutoff !== undefined && alphaCutoff > 0 ? "MASK" : "OPAQUE";
    // `IndexBuffer` already tracks its own component type, so this is read rather than inferred.
    const indexType = indexBuffer?.type;
    const provenance = options.provenanceByLabel?.[label];

    const frustumResult = evaluateFrustum(item, geometry.bounds, options.viewProjectionMatrix);

    records.push({
      label,
      assetId: provenance?.assetId,
      meshIndex: provenance?.meshIndex,
      primitiveIndex: provenance?.primitiveIndex,
      submissionIndex: index,
      indexType,
      alphaMode,
      alphaCutoff,
      effectiveOpacity,
      texturesReady: options.texturesReadyByLabel?.[label],
      vertexCount,
      indexCount,
      topology: geometry.topology,
      instanceCount: instanceCountFor(item),
      materialName: baseMaterial?.name,
      blended: baseMaterial?.renderState?.blend === true,
      localBounds: geometry.bounds,
      hasModelMatrix: Boolean(modelMatrix),
      transformScale: round4(transformScale),
      skinned: Boolean(item.skinning),
      morphed: Boolean(item.morphTargets && (item.morphWeights?.length ?? 0) > 0),
      glError: options.glErrorsByLabel?.[label],
      frustum: frustumResult.verdict,
      worldBounds: frustumResult.worldBounds,
      blockers
    });
  }

  const blockedRecords = records.filter((record) => record.blockers.length > 0);
  const culledRecords = records.filter((record) => record.frustum === "culled");
  const distinctMaterials = new Set(records.map((record) => record.materialName ?? "<none>")).size;

  return {
    kind: "aura-primitive-submission-audit",
    records,
    submittable: records.length - blockedRecords.length,
    blocked: blockedRecords.length,
    distinctMaterials,
    blockedLabels: blockedRecords.map((record) => record.label),
    culled: culledRecords.length,
    culledLabels: culledRecords.map((record) => record.label),
    expectedDrawCalls: (passCount: number) => Math.max(0, Math.trunc(passCount)) * (records.length - blockedRecords.length)
  };
}

/**
 * Instance count for a render item.
 *
 * `instanceTransforms` is a flat mat4 array, so its length divided by 16 is the instance count. Returns 1 for a
 * non-instanced item, matching how a single draw is counted.
 */
function instanceCountFor(item: RenderItem): number {
  const transforms = item.instanceTransforms;
  if (!transforms) return 1;
  const length = Array.isArray(transforms) ? transforms.length : transforms.length;
  return Math.max(1, Math.trunc(length / 16));
}

function round4(value: number): number {
  const rounded = Math.round(value * 10_000) / 10_000;
  return rounded === 0 ? 0 : rounded;
}

/** Render an audit as human-readable lines, one per primitive. */
export function formatPrimitiveSubmissionAudit(audit: PrimitiveSubmissionAudit): readonly string[] {
  const lines = [
    `primitives=${audit.records.length} submittable=${audit.submittable} blocked=${audit.blocked} ` +
    `culled=${audit.culled} materials=${audit.distinctMaterials}`
  ];
  for (const record of audit.records) {
    const status = record.blockers.length === 0 ? "OK     " : "BLOCKED";
    lines.push(
      `  ${status} ${record.label} verts=${record.vertexCount} idx=${record.indexCount} ` +
      `mat=${record.materialName ?? "<none>"}${record.blended ? " (blended)" : ""} scale=${record.transformScale} ` +
      `frustum=${record.frustum}`
    );
    for (const blocker of record.blockers) lines.push(`      x ${blocker}`);
    if (record.glError) lines.push(`      x gl-error: ${record.glError}`);
  }
  return lines;
}

/**
 * Classify one primitive against a view-projection frustum.
 *
 * Transforms the geometry's local bounds by the model matrix into world space, then tests the resulting AABB
 * against the six frustum planes extracted from the matrix. The transformed AABB is returned alongside the verdict
 * because "culled" is only actionable if you can see *where* the renderer thought the primitive was -- a wrong
 * model matrix and a wrong camera produce the same verdict but need different fixes.
 */
function evaluateFrustum(
  item: RenderItem,
  localBounds: Bounds3,
  viewProjectionMatrix: Float32Array | readonly number[] | undefined
): { readonly verdict: PrimitiveFrustumVerdict; readonly worldBounds: Bounds3 | undefined } {
  if (!viewProjectionMatrix) return { verdict: "no-camera", worldBounds: undefined };
  /*
   * Mirrors the renderer's own exemption rule (`isFrustumCullableRenderItem`): a draw range or morph targets make
   * the geometry's static bounds an unreliable proxy, so those items are never culled. Reporting them as `inside`
   * would claim a test that did not run.
   */
  if (item.drawRange !== undefined || item.morphTargets !== undefined || item.morphWeights !== undefined) {
    return { verdict: "not-tested", worldBounds: undefined };
  }

  const matrix = Array.from(viewProjectionMatrix);
  if (matrix.length !== 16 || !matrix.every((value) => Number.isFinite(value))) {
    return { verdict: "no-camera", worldBounds: undefined };
  }

  const worldBounds = transformBounds(localBounds, item.modelMatrix);
  if (!worldBounds) return { verdict: "not-tested", worldBounds: undefined };

  return {
    verdict: boundsIntersectFrustum(worldBounds, matrix) ? "inside" : "culled",
    worldBounds
  };
}

/** Transform local AABB corners by a model matrix and re-bound them in world space. */
function transformBounds(
  bounds: Bounds3,
  modelMatrix: Float32Array | readonly number[] | undefined
): Bounds3 | undefined {
  const matrix = modelMatrix ? Array.from(modelMatrix) : IDENTITY_MATRIX;
  if (matrix.length !== 16 || !matrix.every((value) => Number.isFinite(value))) return undefined;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const worldX = (matrix[0] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[8] ?? 0) * z + (matrix[12] ?? 0);
        const worldY = (matrix[1] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[9] ?? 0) * z + (matrix[13] ?? 0);
        const worldZ = (matrix[2] ?? 0) * x + (matrix[6] ?? 0) * y + (matrix[10] ?? 0) * z + (matrix[14] ?? 0);
        min[0] = Math.min(min[0], worldX); max[0] = Math.max(max[0], worldX);
        min[1] = Math.min(min[1], worldY); max[1] = Math.max(max[1], worldY);
        min[2] = Math.min(min[2], worldZ); max[2] = Math.max(max[2], worldZ);
      }
    }
  }
  return min.every(Number.isFinite) ? { min, max } : undefined;
}

/**
 * Six-plane AABB frustum test.
 *
 * Uses the standard clip-space plane extraction and the "nearest corner" test: for each plane, pick the AABB corner
 * furthest along the plane normal, and reject only when even that corner is behind the plane. Testing the nearest
 * corner instead would cull boxes that straddle a plane, which is a false negative that hides geometry.
 */
function boundsIntersectFrustum(bounds: Bounds3, m: readonly number[]): boolean {
  const planes: readonly (readonly [number, number, number, number])[] = [
    [(m[3] ?? 0) + (m[0] ?? 0), (m[7] ?? 0) + (m[4] ?? 0), (m[11] ?? 0) + (m[8] ?? 0), (m[15] ?? 0) + (m[12] ?? 0)],
    [(m[3] ?? 0) - (m[0] ?? 0), (m[7] ?? 0) - (m[4] ?? 0), (m[11] ?? 0) - (m[8] ?? 0), (m[15] ?? 0) - (m[12] ?? 0)],
    [(m[3] ?? 0) + (m[1] ?? 0), (m[7] ?? 0) + (m[5] ?? 0), (m[11] ?? 0) + (m[9] ?? 0), (m[15] ?? 0) + (m[13] ?? 0)],
    [(m[3] ?? 0) - (m[1] ?? 0), (m[7] ?? 0) - (m[5] ?? 0), (m[11] ?? 0) - (m[9] ?? 0), (m[15] ?? 0) - (m[13] ?? 0)],
    [(m[3] ?? 0) + (m[2] ?? 0), (m[7] ?? 0) + (m[6] ?? 0), (m[11] ?? 0) + (m[10] ?? 0), (m[15] ?? 0) + (m[14] ?? 0)],
    [(m[3] ?? 0) - (m[2] ?? 0), (m[7] ?? 0) - (m[6] ?? 0), (m[11] ?? 0) - (m[10] ?? 0), (m[15] ?? 0) - (m[14] ?? 0)]
  ];
  for (const [nx, ny, nz, d] of planes) {
    const length = Math.hypot(nx, ny, nz);
    if (length <= 1e-12) continue;
    const cornerX = nx >= 0 ? bounds.max[0] : bounds.min[0];
    const cornerY = ny >= 0 ? bounds.max[1] : bounds.min[1];
    const cornerZ = nz >= 0 ? bounds.max[2] : bounds.min[2];
    if ((nx * cornerX + ny * cornerY + nz * cornerZ + d) / length < 0) return false;
  }
  return true;
}

const IDENTITY_MATRIX: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
