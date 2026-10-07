/**
 * nodes/game/instanceTransforms.ts — PRD-09 (C-37 extension).
 *
 * `setInstanceTransforms(matrices, count, colors?)` for instanced nodes.
 * `INSTANCE_NODE_REQUIRED` when the handle's scene node carries no
 * `instances` array; `INSTANCE_CAPACITY_EXCEEDED` when `count` exceeds the
 * authored capacity (`instances.length`). Writes are applied onto the
 * scene node's `instances`/`instanceColors` slots so the live registry and
 * the compiled render path see the same data.
 */

import type { AuraApp, AuraRuntimeNodeHandle, AuraSceneNode, AuraVec3 } from "../../index";
import {
  registerNodeHandleExtension,
  type NodeHandleExtension
} from "../../../contracts/runtimeNodes";

export const INSTANCE_NODE_REQUIRED = "INSTANCE_NODE_REQUIRED";
export const INSTANCE_CAPACITY_EXCEEDED = "INSTANCE_CAPACITY_EXCEEDED";

type InstancedSceneNode = AuraSceneNode & {
  instances?: unknown[];
  instanceColors?: unknown[];
};

const findSceneNode = (app: AuraApp, id: string): InstancedSceneNode | undefined => {
  const nodes = (app.scene?.nodes ?? []) as readonly InstancedSceneNode[];
  return nodes.find((node) => {
    const runtime = (node as { runtime?: { id?: unknown } }).runtime;
    return runtime?.id === id;
  });
};

/** Compose a 4x4 column-major matrix into position/rotation/scale — TRS extraction for AuraTransformSpec. */
const composeEntry = (matrix: Float32Array, offset: number, node: { position?: AuraVec3; rotation?: AuraVec3; scale?: number | AuraVec3 }) => {
  // Column-major m[0..15]. Translation lives at 12..14.
  const t: AuraVec3 = [matrix[offset + 12] ?? 0, matrix[offset + 13] ?? 0, matrix[offset + 14] ?? 0];
  const sx = Math.hypot(matrix[offset + 0] ?? 1, matrix[offset + 1] ?? 0, matrix[offset + 2] ?? 0);
  const sy = Math.hypot(matrix[offset + 4] ?? 0, matrix[offset + 5] ?? 1, matrix[offset + 6] ?? 0);
  const sz = Math.hypot(matrix[offset + 8] ?? 0, matrix[offset + 9] ?? 0, matrix[offset + 10] ?? 1);
  void node;
  return { position: t, scale: [sx, sy, sz] as AuraVec3 };
};

const extension: NodeHandleExtension<"setInstanceTransforms"> = {
  id: "prd09.setInstanceTransforms",
  owner: "prd09",
  flag: "A3D_QR_GAME",
  member: "setInstanceTransforms",
  appliesTo: ["primitive", "model"],
  create(handle: AuraRuntimeNodeHandle, app: AuraApp) {
    return (matrices: Float32Array, count: number, colors?: Float32Array) => {
      const node = findSceneNode(app, handle.id);
      const capacity = Array.isArray(node?.instances) ? node.instances.length : 0;
      if (node === undefined || capacity === 0) {
        throw new Error(`${INSTANCE_NODE_REQUIRED}:${handle.id} — node carries no instances array; author it via instances.<kind>({ transforms }).`);
      }
      if (count > capacity) {
        throw new Error(`${INSTANCE_CAPACITY_EXCEEDED}:${handle.id} count=${count} capacity=${capacity}`);
      }
      if (matrices.length < count * 16) {
        throw new Error(`AURA_INSTANCE_MATRIX_UNDERFLOW:${handle.id} matrices.length=${matrices.length} need=${count * 16}`);
      }
      const instances = node.instances as { position?: AuraVec3; rotation?: AuraVec3; scale?: number | AuraVec3 }[];
      for (let i = 0; i < count; i += 1) {
        instances[i] = composeEntry(matrices, i * 16, instances[i] ?? {});
      }
      if (colors !== undefined) {
        if (colors.length < count * 3) {
          throw new Error(`AURA_INSTANCE_COLOR_UNDERFLOW:${handle.id} colors.length=${colors.length} need=${count * 3}`);
        }
        const instanceColors = node.instanceColors as AuraVec3[] | undefined;
        if (instanceColors !== undefined) {
          for (let i = 0; i < count; i += 1) {
            instanceColors[i] = [colors[i * 3] ?? 1, colors[i * 3 + 1] ?? 1, colors[i * 3 + 2] ?? 1];
          }
        }
      }
      return handle;
    };
  }
};

/** Registers the extension; returns its disposer. Called from lanes/prd09.ts. */
export function registerPrd09InstanceTransforms(): () => void {
  return registerNodeHandleExtension(extension);
}
