import { batchStaticRenderItems, type StaticBatchInput, type StaticBatchOptions } from "./SceneOptimization";

/**
 * D1 instancing diagnostics (muse3jsparity-PRD).
 *
 * Kills the silent 4096-draw fallback class: when a batch expands to N
 * draws, the material + reason are logged once per material. Also owns the
 * instancing path matrix (skinned / normal-mapped / emissive) and the
 * BatchedMesh-equivalent consolidator with draw-call + memory telemetry.
 */

export type InstancingFallbackReason =
  | "instance-count-exceeds-device-limit"
  | "per-instance-attribute-missing"
  | "material-rejects-instancing"
  | "mixed-material-batch-split"
  | "skinned-palette-overflow-cpu-fallback";

export interface InstancingFallbackReport {
  readonly material: string;
  readonly requestedInstances: number;
  readonly drawnBatches: number;
  readonly reason: InstancingFallbackReason;
  readonly warned: boolean;
  readonly diagnostic: string;
}

const warnedMaterials = new Set<string>();

export function warnOnInstancingFallback(options: {
  readonly material: string;
  readonly requestedInstances: number;
  readonly drawnBatches: number;
  readonly reason: InstancingFallbackReason;
  readonly onWarning?: (message: string) => void;
}): InstancingFallbackReport {
  if (!options.material.trim()) throw new Error("Instancing fallback material name is required.");
  if (!Number.isInteger(options.requestedInstances) || options.requestedInstances <= 0) {
    throw new RangeError("Instancing fallback requestedInstances must be a positive integer.");
  }
  if (!Number.isInteger(options.drawnBatches) || options.drawnBatches <= 0) {
    throw new RangeError("Instancing fallback drawnBatches must be a positive integer.");
  }
  const key = `${options.material}::${options.reason}`;
  const warned = warnedMaterials.has(key);
  const diagnostic =
    `Instancing fallback for material "${options.material}": ` +
    `${options.requestedInstances} instances expanded to ${options.drawnBatches} draws (${options.reason}).`;
  if (!warned) {
    warnedMaterials.add(key);
    (options.onWarning ?? defaultWarn)(diagnostic);
  }
  return {
    material: options.material,
    requestedInstances: options.requestedInstances,
    drawnBatches: options.drawnBatches,
    reason: options.reason,
    warned: !warned,
    diagnostic,
  };
}

function defaultWarn(message: string): void {
  if (typeof console !== "undefined" && typeof console.warn === "function") console.warn(message);
}

/** Clears the once-per-material warning memory (tests + device reset). */
export function resetInstancingFallbackWarnings(): void {
  warnedMaterials.clear();
}

export type InstancingPathSupport = "supported" | "unsupported";

export interface InstancingPathEntry {
  readonly path: "skinned" | "normal-mapped" | "emissive" | "unlit" | "textured-pbr";
  readonly support: InstancingPathSupport;
  readonly notes: string;
}

/**
 * Instancing-aware variant matrix. Skinned instancing is unsupported
 * (per-instance joint palettes have no GPU path — E1 owns rigs); every
 * other game path instances through the shared instance-matrix attributes.
 */
export function instancingPathMatrix(): readonly InstancingPathEntry[] {
  return [
    { path: "unlit", support: "supported", notes: "Instance-matrix attributes on the unlit program." },
    { path: "textured-pbr", support: "supported", notes: "Per-instance matrix + color on the textured PBR program." },
    { path: "normal-mapped", support: "supported", notes: "Normal path re-orthogonalizes against the instance rotation." },
    { path: "emissive", support: "supported", notes: "Emissive term is per-material; instances share it." },
    {
      path: "skinned",
      support: "unsupported",
      notes: "Skinned instancing has no GPU path: joint palettes are per-mesh. Split skinned crowds into individual draws (E1).",
    },
  ];
}

export interface BatchedMeshTelemetry {
  readonly inputMeshes: number;
  readonly outputDraws: number;
  readonly drawsSaved: number;
  readonly indexBytes: number;
  readonly vertexBytes: number;
  /**
   * Instanced-memory view (D1 shootout): bytes for the UNIQUE geometries
   * actually uploaded once, plus the per-instance transform buffer
   * (`admittedInstances × 16 × 4` bytes). `indexBytes`/`vertexBytes` keep
   * the legacy summed-over-inputs meaning (the naive-scene cost); these
   * fields describe what the consolidated scene uploads.
   */
  readonly sharedIndexBytes: number;
  readonly sharedVertexBytes: number;
  readonly instanceTransformBytes: number;
  readonly consolidatedBytes: number;
  readonly diagnostic: string;
}

export interface BatchedMeshResult {
  readonly draws: number;
  readonly telemetry: BatchedMeshTelemetry;
}

/**
 * BatchedMesh-equivalent static-geometry consolidator over
 * `MeshConsolidation.ts` (`batchStaticRenderItems`), with draw-call +
 * memory telemetry for the three.js `BatchedMesh` comparison.
 */
export function consolidateBatchedMeshes(
  items: readonly StaticBatchInput[],
  options: StaticBatchOptions = {}
): BatchedMeshResult {
  const result = batchStaticRenderItems(items, options);
  const inputMeshes = items.length;
  const draws = result.submittedItems;
  let indexBytes = 0;
  let vertexBytes = 0;
  const seenGeometries = new Set<unknown>();
  let sharedIndexBytes = 0;
  let sharedVertexBytes = 0;
  for (const item of items) {
    indexBytes += (item.geometry.indexBuffer?.count ?? 0) * 4;
    vertexBytes += item.geometry.vertexBuffer.vertexCount * item.geometry.vertexBuffer.format.stride;
    if (!seenGeometries.has(item.geometry)) {
      seenGeometries.add(item.geometry);
      sharedIndexBytes += (item.geometry.indexBuffer?.count ?? 0) * 4;
      sharedVertexBytes += item.geometry.vertexBuffer.vertexCount * item.geometry.vertexBuffer.format.stride;
    }
  }
  const instanceTransformBytes = inputMeshes * 16 * 4;
  const consolidatedBytes = sharedIndexBytes + sharedVertexBytes + instanceTransformBytes;
  return {
    draws,
    telemetry: {
      inputMeshes,
      outputDraws: draws,
      drawsSaved: result.drawCallReduction,
      indexBytes,
      vertexBytes,
      sharedIndexBytes,
      sharedVertexBytes,
      instanceTransformBytes,
      consolidatedBytes,
      diagnostic:
        `Batched ${inputMeshes} static meshes into ${draws} draws ` +
        `(saved ${result.drawCallReduction}); ~${indexBytes} index bytes + ~${vertexBytes} vertex bytes naive, ` +
        `~${consolidatedBytes} bytes consolidated (shared ${sharedIndexBytes + sharedVertexBytes} + ${instanceTransformBytes} instance transforms).`,
    },
  };
}
