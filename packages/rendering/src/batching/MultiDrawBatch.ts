/**
 * PRD 11 Phase 3 (§6.6 layer 3) — `MultiDrawBatch` is the device-facing side of
 * a `MultiDrawGroup`: it packs every member into a `BatchedGeometryPool`,
 * records each member's transform/colour/meta into a `DrawDataTexture`, and
 * materializes the `DrawCommand[]` the submit path hands to
 * `device.multiDrawElementsInstanced` (extension path) or issues one-by-one
 * with `u_drawId` bound (loop fallback).
 *
 * While the C-02 program generator is a stub the planner marks leftover
 * members `multi-draw-generator-pending` and this builder stays test-side;
 * its shapes are exactly what the generated `prd11.drawId` program consumes.
 */

import type { DrawCommand, PrimitiveTopology, RenderBuffer, RenderDevice, RenderShaderProgram, UniformValue } from "../RenderDevice";
import type { VertexFormat } from "../VertexFormat";
import type { RenderCommandState } from "../RenderDevice";
import { BatchedGeometryPool, type PackedGeometryEntry } from "./BatchedGeometryPool";
import { DrawDataTexture, packDrawDataFlags } from "./DrawDataTexture";
import type { MultiDrawGroup } from "./StaticMergePlanner";
import type { RenderItem } from "../contracts/renderItem";
import { MaterialInstance } from "../MaterialInstance";
import { sharedResourceRegistry } from "../resources/ResourceRegistry";
import { createEnginePackedBatchItem, rememberBatchMembers } from "./BatchMembers";

export interface MultiDrawBatch {
  readonly group: MultiDrawGroup;
  readonly entries: readonly PackedGeometryEntry[];
  readonly drawData: DrawDataTexture;
  readonly pool: BatchedGeometryPool;
}

export interface PackedDrawCommand {
  readonly label?: string;
  readonly topology: PrimitiveTopology;
  readonly renderState?: RenderCommandState;
  readonly vertexBuffer: RenderBuffer;
  readonly vertexFormat: VertexFormat;
  readonly vertexCount: number;
  readonly indexBuffer?: RenderBuffer;
  readonly indexType?: "uint16" | "uint32";
  readonly indexCount?: number;
  readonly firstIndex?: number;
  readonly firstVertex?: number;
  readonly drawIndex: number;
  readonly shader?: RenderShaderProgram;
  readonly uniforms?: ReadonlyMap<string, UniformValue>;
  readonly item: RenderItem;
}

const identityModel = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const borrowedDrawDataOwners = new WeakMap<DrawDataTexture, { device?: RenderDevice }>();

/** A failed standalone build retains only its unfinished, internally owned cleanup. */
export class MultiDrawBatchBuildError extends AggregateError {
  private readonly pendingCleanup: Set<{ dispose(): void }>;
  private cleaning = false;

  constructor(readonly originalError: unknown, errors: readonly unknown[], pending: readonly { dispose(): void }[]) {
    const detail = originalError instanceof Error ? `: ${originalError.message}` : "";
    super([originalError, ...errors], `MultiDrawBatch construction and cleanup failed${detail}`, { cause: originalError });
    this.pendingCleanup = new Set(pending);
  }

  /** Retry after the registry/device is available; completed work is not repeated. */
  retryCleanup(): void {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const errors: unknown[] = [];
      for (const resource of [...this.pendingCleanup]) {
        if (!this.pendingCleanup.delete(resource)) continue;
        try { resource.dispose(); } catch (error) {
          this.pendingCleanup.add(resource);
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "MultiDrawBatch cleanup retry failed");
    } finally {
      this.cleaning = false;
    }
  }
}

function renderStateOf(item: RenderItem): RenderCommandState | undefined {
  const material = item.material;
  if (!material) return undefined;
  const base = material instanceof MaterialInstance ? material.baseMaterial : material;
  return base.renderState;
}

function modelOf(item: RenderItem): ArrayLike<number> {
  const model = item.modelMatrix ?? identityModel;
  const transforms = item.instanceTransforms;
  if ((item.instanceCount !== undefined && item.instanceCount !== 1) || item.instanceAttributes?.length) {
    throw new RangeError("Multi-draw members require a single instance without custom instance attributes");
  }
  if (transforms === undefined) return model;
  if (transforms.length !== 16 || model.length !== 16 ||
      !Array.from(transforms).every(Number.isFinite) || !Array.from(model).every(Number.isFinite)) {
    throw new RangeError("Multi-draw members require one finite model and instance matrix");
  }
  // A draw-data row represents a single logical draw. Fold that instance
  // into its model in the same column-major order as the ordinary path:
  // model * instance * geometry. The synthesized marker no longer needs an
  // instance-matrix attribute for this member.
  const combined = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) value += model[index * 4 + row]! * transforms[column * 4 + index]!;
      combined[column * 4 + row] = value;
      if (!Number.isFinite(combined[column * 4 + row])) {
        throw new RangeError("Multi-draw member matrix exceeds the finite float32 range");
      }
    }
  }
  return combined;
}

function colorOf(item: RenderItem): ArrayLike<number> | undefined {
  // The marker keeps its own material, whose base color is already bound by
  // the ordinary material path. A row is only the extra per-instance tint;
  // copying u_baseColor here would multiply the same material color twice.
  // Reading the parameters also validates material liveness before a batch
  // owns its restore registrations.
  const parameters = item.material?.getParameters();
  const colors = item.instanceColors;
  if (colors === undefined) return undefined;
  if (item.instanceTransforms === undefined || colors.length !== 4 || !Array.from(colors).every(Number.isFinite)) {
    throw new RangeError("Multi-draw member color requires one finite RGBA instance color and transform");
  }
  const target = parameters?.get("u_a3dInstanceColorTarget");
  const baseTarget = item.material instanceof MaterialInstance
    ? item.material.baseMaterial.getParameter("u_a3dInstanceColorTarget") : target;
  if (target === 1 || target === 2 || baseTarget === 1 || baseTarget === 2) {
    throw new RangeError("Multi-draw member color only supports the base color target");
  }
  return colors;
}

/**
 * Packs `group` into `pool` (or a fresh one) and writes the draw-data rows.
 * All members share `vertexLayoutKey`, so one pool per group is the norm.
 * If construction and its cleanup both fail, the thrown error retains a
 * `retryCleanup()` method and the original exception as its `cause`.
 */
export function buildMultiDrawBatch(group: MultiDrawGroup, pool?: BatchedGeometryPool, device?: RenderDevice): MultiDrawBatch {
  return buildMultiDrawBatchInternal(group, pool, device);
}

/** Internal owner path: transfer only this build's failed cleanup to its cache. */
export function buildMultiDrawBatchForOwner(
  group: MultiDrawGroup,
  pool: BatchedGeometryPool | undefined,
  device: RenderDevice | undefined,
  retainFailedCleanup: (resource: { dispose(): void }) => void
): MultiDrawBatch {
  return buildMultiDrawBatchInternal(group, pool, device, retainFailedCleanup);
}

function buildMultiDrawBatchInternal(
  group: MultiDrawGroup,
  pool?: BatchedGeometryPool,
  device?: RenderDevice,
  retainFailedCleanup?: (resource: { dispose(): void }) => void
): MultiDrawBatch {
  const ownsPool = pool === undefined;
  const targetPool = pool ?? new BatchedGeometryPool();
  const drawData = new DrawDataTexture(Math.max(group.members.length, 1));
  const poolOwner = targetPool.restoreDeviceOwner(device);
  const batchOwner: { device?: RenderDevice } = { device };
  try {
    return targetPool.withPackingTransaction(() => {
      const entries: PackedGeometryEntry[] = [];
      group.members.forEach((item, drawIndex) => {
        const entry = targetPool.pack(item.geometry);
        entries.push(entry);
        drawData.setDraw(drawIndex, {
          model: modelOf(item),
          baseColor: colorOf(item),
          // meta.w = visible bit | geometryId (parity-L5). Planner members are
          // always visible; a `batchedVisible` marker lets batched.mesh hide rows.
          meta: [
            entry.firstIndex,
            entry.baseVertex,
            entry.indexCount,
            packDrawDataFlags(batchedVisible(item), entry.geometryId)
          ]
        });
      });
      // Only completed groups get restore handles. A supplied pool stays
      // caller-owned and its earlier content survives any construction error.
      const registry = sharedResourceRegistry();
      drawData.registerForRestore(registry, ownsPool ? poolOwner : () => batchOwner.device ?? poolOwner());
      targetPool.registerForRestore(registry, device);
      const batch = { group, entries, drawData, pool: targetPool };
      if (!ownsPool) borrowedDrawDataOwners.set(drawData, batchOwner);
      return batch;
    });
  } catch (error) {
    // A caller-provided pool stays caller-owned; the packing transaction has
    // already restored its previous content.
    const errors: unknown[] = [];
    const pending: { dispose(): void }[] = [];
    try { drawData.dispose(); } catch (cleanupError) {
      errors.push(cleanupError);
      pending.push(drawData);
    }
    if (ownsPool) {
      try { targetPool.dispose(); } catch (cleanupError) {
        errors.push(cleanupError);
        pending.push(targetPool);
      }
    }
    if (errors.length) {
      if (retainFailedCleanup) {
        for (const resource of pending) retainFailedCleanup(resource);
        throw error;
      }
      throw new MultiDrawBatchBuildError(error, errors, pending);
    }
    throw error;
  }
}

function batchedVisible(item: RenderItem): boolean {
  return (item as RenderItem & { readonly batchedVisible?: boolean }).batchedVisible !== false;
}

/**
 * Signature-hit refresh (mirrors `refreshInstancedBatch`): member
 * matrices/colours may change while the item SET is unchanged — rewrite the
 * draw rows in place and let `upload()` mark the texture dirty for the next
 * bind. Cheap: no re-pack, no texture object churn.
 */
export function refreshMultiDrawBatch(batch: MultiDrawBatch): void {
  batch.group.members.forEach((item, drawIndex) => {
    const entry = batch.entries[drawIndex]!;
    batch.drawData.setDraw(drawIndex, {
      model: modelOf(item),
      baseColor: colorOf(item),
      meta: [
        entry.firstIndex,
        entry.baseVertex,
        entry.indexCount,
        packDrawDataFlags(batchedVisible(item), entry.geometryId)
      ]
    });
  });
  batch.drawData.upload();
}

const SHARED_IDENTITY_MODEL = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export interface SynthesizeMultiDrawItemsOptions {
  /** Marker mode — `"multi-draw"` enqueues for `device.multiDrawElementsInstanced`; `"loop"` binds `u_drawId` per draw. */
  readonly mode?: "multi-draw" | "loop";
  /** Bounds override for the pooled `Geometry` (BatchedMesh supplies its own). */
  readonly bounds?: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
}

/**
 * Synthesize the `RenderItem`s a `MultiDrawBatch` renders as: one item per
 * member, all sharing the pool's materialized `Geometry`, each addressing its
 * slice through `drawRange` and its per-draw data through the
 * `multiDraw` marker (`drawIndex` selects the `DrawDataTexture` row). The
 * marker's shared model matrix is identity; each draw-data row carries the
 * folded node × instance transform for the `a3d_draw_id` fetch.
 */
export function synthesizeMultiDrawItems(batch: MultiDrawBatch, options: SynthesizeMultiDrawItemsOptions = {}): RenderItem[] {
  const pooledGeometry = batch.pool.asGeometry(options.bounds);
  const drawDataTexture = batch.drawData.upload();
  const mode = options.mode ?? "multi-draw";
  const items: RenderItem[] = [];
  batch.group.members.forEach((member, drawIndex) => {
    const entry = batch.entries[drawIndex]!;
    const range = entry.firstIndex >= 0
      ? { start: entry.firstIndex, count: entry.indexCount }
      : { start: entry.baseVertex, count: entry.vertexCount };
    // The row already owns this member's single instance matrix and color.
    // Keeping the original instance attributes on the marker would apply
    // them a second time and prevent otherwise compatible draws from merging.
    const { instanceTransforms: _transforms, instanceColors: _colors, ...drawMember } = member;
    const item = createEnginePackedBatchItem({
      ...drawMember,
      geometry: pooledGeometry,
      drawRange: range,
      modelMatrix: SHARED_IDENTITY_MODEL,
      multiDraw: { mode, drawIndex, drawData: drawDataTexture }
    });
    rememberBatchMembers(item, [member]);
    items.push(item);
  });
  return items;
}

/**
 * One `DrawCommand`-shaped entry per member against the shared arenas. The
 * `u_drawId` uniform loop binds `drawIndex` itself; the extension path reads
 * `gl_DrawID` in-shader. `u_a3dDrawData` is bound on every command either way
 * so the same program source works for both.
 */
export function multiDrawCommands(device: RenderDevice, batch: MultiDrawBatch, shared?: { shader?: RenderShaderProgram; uniforms?: ReadonlyMap<string, UniformValue> }): PackedDrawCommand[] {
  const { vertexBuffer, indexBuffer, indexType } = batch.pool.upload(device);
  const vertexFormat = batch.pool.vertexFormat;
  if (!vertexFormat) throw new Error("MultiDrawBatch has no packed geometry");
  const dataBinding = batch.drawData.asUniform();
  const commands = batch.entries.map((entry, drawIndex) => {
    const uniforms = new Map<string, UniformValue>(shared?.uniforms ?? []);
    uniforms.set("u_drawId", drawIndex);
    uniforms.set("u_a3dDrawData", dataBinding);
    return {
      label: batch.group.members[drawIndex]!.label,
      topology: batch.group.members[drawIndex]!.geometry.topology,
      renderState: renderStateOf(batch.group.members[drawIndex]!),
      vertexBuffer,
      vertexFormat,
      vertexCount: entry.vertexCount,
      firstVertex: entry.firstIndex >= 0 ? undefined : entry.baseVertex,
      indexBuffer: indexBuffer ?? undefined,
      indexType: indexBuffer ? indexType : undefined,
      indexCount: entry.firstIndex >= 0 ? entry.indexCount : undefined,
      firstIndex: entry.firstIndex >= 0 ? entry.firstIndex : undefined,
      drawIndex,
      shader: shared?.shader,
      uniforms,
      item: batch.group.members[drawIndex]!
    };
  });
  const owner = borrowedDrawDataOwners.get(batch.drawData);
  if (owner) owner.device = device;
  return commands;
}

/**
 * Issues the batch. Extension present → one `multiDrawElementsInstanced` call;
 * absent → the same commands go through `device.draw` (identical pixels via
 * the `u_drawId` uniform fallback) so the loop path is correct everywhere.
 */
export function submitMultiDrawBatch(device: RenderDevice, batch: MultiDrawBatch, commands: readonly PackedDrawCommand[], multiDrawExtension: boolean): void {
  if (multiDrawExtension && typeof device.multiDrawElementsInstanced === "function") {
    device.multiDrawElementsInstanced(commands as readonly DrawCommand[]);
    return;
  }
  for (const command of commands) {
    device.draw(command as DrawCommand);
  }
}
