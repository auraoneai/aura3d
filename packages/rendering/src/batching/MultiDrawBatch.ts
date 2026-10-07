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
import { DrawDataTexture } from "./DrawDataTexture";
import type { MultiDrawGroup } from "./StaticMergePlanner";
import type { RenderItem } from "../contracts/renderItem";
import { MaterialInstance } from "../MaterialInstance";

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

function renderStateOf(item: RenderItem): RenderCommandState | undefined {
  const material = item.material;
  if (!material) return undefined;
  const base = material instanceof MaterialInstance ? material.baseMaterial : material;
  return base.renderState;
}

function modelOf(item: RenderItem): ArrayLike<number> {
  return item.modelMatrix ?? identityModel;
}

function colorOf(item: RenderItem): readonly number[] | undefined {
  const value = item.material?.getParameters().get("u_baseColor");
  return value && typeof value !== "number" ? (value as readonly number[]) : undefined;
}

/**
 * Packs `group` into `pool` (or a fresh one) and writes the draw-data rows.
 * All members share `vertexLayoutKey`, so one pool per group is the norm.
 */
export function buildMultiDrawBatch(group: MultiDrawGroup, pool = new BatchedGeometryPool()): MultiDrawBatch {
  const drawData = new DrawDataTexture(Math.max(group.members.length, 1));
  const entries: PackedGeometryEntry[] = [];
  group.members.forEach((item, drawIndex) => {
    const entry = pool.pack(item.geometry);
    entries.push(entry);
    drawData.setDraw(drawIndex, {
      model: modelOf(item),
      baseColor: colorOf(item),
      meta: [entry.firstIndex, entry.baseVertex, entry.indexCount, 0]
    });
  });
  return { group, entries, drawData, pool };
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
  return batch.entries.map((entry, drawIndex) => {
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
