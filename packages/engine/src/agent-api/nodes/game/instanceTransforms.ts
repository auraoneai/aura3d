/**
 * C-37 `setInstanceTransforms` extension (PRD-09 §7.8) — per-instance matrix
 * writes for the instanced kinds created by `instances.*`.
 *
 * Validation: `INSTANCE_NODE_REQUIRED` when the node is not instanced,
 * `INSTANCE_CAPACITY_EXCEEDED` when `count > capacity` (capacity = the
 * declared `instances.length`, matching C-07).
 *
 * Real path (C-07 `InstanceBufferLike.setMatrices/setColors`) needs a read
 * accessor on the C-37 seam — request Q-15-2. Until it lands, and whenever the
 * `A3D_QR_GAME` flag is off, the member delegates to the C-37 stub: it
 * decomposes the matrices back into `node.instances`/`instanceColors` so the
 * existing per-frame instanced-node update re-uploads them (still 1 draw per
 * kind; extra CPU measured in §17).
 */
import type { AuraApp, AuraPrimitiveNode, AuraRuntimeNodeHandle, AuraSceneNode, AuraTransformSpec } from "../../index.js";
import type { NodeHandleExtension } from "../../../contracts/runtimeNodes.js";

export type SceneNodeWithRuntime = AuraSceneNode & {
  instances?: readonly AuraTransformSpec[];
  instanceColors?: readonly string[];
};

/** Flag name the extension is gated under (its RegistryEntry.flag). */
export const INSTANCE_TRANSFORMS_FLAG = "A3D_QR_GAME" as const;

/** Decompose a 4x4 column-major matrix into an AuraTransformSpec. */
export function decomposeInstanceMatrix(m: Float32Array, offset: number): AuraTransformSpec {
  const px = m[offset + 12];
  const py = m[offset + 13];
  const pz = m[offset + 14];
  const c0 = [m[offset], m[offset + 1], m[offset + 2]];
  const c1 = [m[offset + 4], m[offset + 5], m[offset + 6]];
  const c2 = [m[offset + 8], m[offset + 9], m[offset + 10]];
  const sx = Math.hypot(c0[0], c0[1], c0[2]);
  const sy = Math.hypot(c1[0], c1[1], c1[2]);
  const sz = Math.hypot(c2[0], c2[1], c2[2]);
  // Handedness: negative determinant flips the x axis scale.
  const det =
    c0[0] * (c1[1] * c2[2] - c1[2] * c2[1]) -
    c1[0] * (c0[1] * c2[2] - c0[2] * c2[1]) +
    c2[0] * (c0[1] * c1[2] - c0[2] * c1[1]);
  const sxSigned = det < 0 ? -sx : sx;
  const r00 = c0[0] / sx, r01 = c1[0] / sy, r02 = c2[0] / sz;
  const r10 = c0[1] / sx, r11 = c1[1] / sy, r12 = c2[1] / sz;
  const r20 = c0[2] / sx, r21 = c1[2] / sy, r22 = c2[2] / sz;
  return {
    position: [px, py, pz],
    quaternion: matrixToQuat(r00, r01, r02, r10, r11, r12, r20, r21, r22),
    scale: [sxSigned, sy, sz]
  };
}

/** Rotation matrix (orthonormal columns) → quaternion [x, y, z, w]. */
function matrixToQuat(
  r00: number, r01: number, r02: number,
  r10: number, r11: number, r12: number,
  r20: number, r21: number, r22: number
): readonly [number, number, number, number] {
  const trace = r00 + r11 + r22;
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (r21 - r12) * s;
    y = (r02 - r20) * s;
    z = (r10 - r01) * s;
  } else if (r00 > r11 && r00 > r22) {
    const s = 2 * Math.sqrt(1 + r00 - r11 - r22);
    w = (r21 - r12) / s;
    x = 0.25 * s;
    y = (r01 + r10) / s;
    z = (r02 + r20) / s;
  } else if (r11 > r22) {
    const s = 2 * Math.sqrt(1 + r11 - r00 - r22);
    w = (r02 - r20) / s;
    x = (r01 + r10) / s;
    y = 0.25 * s;
    z = (r12 + r21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + r22 - r00 - r11);
    w = (r10 - r01) / s;
    x = (r02 + r20) / s;
    y = (r12 + r21) / s;
    z = 0.25 * s;
  }
  const n = Math.hypot(x, y, z, w) || 1;
  return [x / n, y / n, z / n, w / n];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function instancedNodeFor(handle: AuraRuntimeNodeHandle, app: AuraApp): SceneNodeWithRuntime & AuraPrimitiveNode {
  const node = (app.scene.nodes as readonly SceneNodeWithRuntime[]).find(
    (n) => n.kind === "primitive" && n.runtime?.id === handle.id
  );
  if (!node || !Array.isArray((node as AuraPrimitiveNode).instances) || (node as AuraPrimitiveNode).instances!.length === 0) {
    throw new Error(`INSTANCE_NODE_REQUIRED: node "${handle.id}" is not an instanced node (created by instances.*).`);
  }
  return node as SceneNodeWithRuntime & AuraPrimitiveNode;
}

/**
 * C-37 stub member — used when `A3D_QR_GAME` is off (and inside the real
 * extension until Q-15-2 lands the InstanceBufferLike accessor). Rebuilds the
 * scene node's `instances`/`instanceColors`; the existing per-frame instanced
 * update uploads them.
 */
export function stubSetInstanceTransforms(
  handle: AuraRuntimeNodeHandle,
  app: AuraApp,
  matrices: Float32Array,
  count: number,
  colors?: Float32Array
): AuraRuntimeNodeHandle {
  const node = instancedNodeFor(handle, app) as unknown as SceneNodeWithRuntime & { instances: AuraTransformSpec[]; instanceColors?: string[] };
  const capacity = node.instances.length;
  if (!Number.isInteger(count) || count < 0 || count > capacity) {
    throw new RangeError(`INSTANCE_CAPACITY_EXCEEDED: count ${count} exceeds capacity ${capacity} (or is not a valid count).`);
  }
  if (matrices.length < 16 * count) {
    throw new RangeError(`setInstanceTransforms expects matrices.length >= ${16 * count}, got ${matrices.length}.`);
  }
  if (colors !== undefined && colors.length < 3 * count) {
    throw new RangeError(`setInstanceTransforms expects colors.length >= ${3 * count}, got ${colors.length}.`);
  }
  const next = node.instances.slice();
  for (let i = 0; i < count; i++) {
    next[i] = decomposeInstanceMatrix(matrices, i * 16);
  }
  // Capacity must survive a small `count`: slots beyond the visible count are
  // zero-scaled (invisible) instead of dropped, so a later larger count stays
  // within capacity. Decompose once — per-frame re-upload of zero transforms
  // is cheaper than re-decomposing a dense matrix every frame.
  const hidden: AuraTransformSpec = { position: [0, 0, 0], scale: [0, 0, 0] };
  for (let i = count; i < next.length; i++) {
    next[i] = hidden;
  }
  node.instances = next;
  if (colors !== undefined) {
    const prev = node.instanceColors ?? [];
    node.instanceColors = Array.from({ length: next.length }, (_, i) =>
      i < count ? rgbToHex(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]) : prev[i] ?? "#000000"
    );
  }
  return handle;
}

const qrFlagsCache = new WeakMap<object, readonly string[]>();

function qrFlagsOf(app: AuraApp | undefined): readonly string[] {
  // `app` is undefined before `configure` runs — cache per app so a per-read
  // `diagnostics()` call does not run on every handle extension attach.
  if (!app) return [];
  let flags = qrFlagsCache.get(app);
  if (flags === undefined) {
    const d = (app as { diagnostics?: () => { qrFlags?: readonly string[] } }).diagnostics?.();
    flags = d?.qrFlags ?? [];
    qrFlagsCache.set(app, flags);
  }
  return flags;
}

export const instanceTransformsExtension: NodeHandleExtension<"setInstanceTransforms"> = {
  id: "prd09.setInstanceTransforms",
  owner: "prd09",
  flag: INSTANCE_TRANSFORMS_FLAG,
  member: "setInstanceTransforms",
  appliesTo: ["primitive"],
  create(handle, app) {
    // Until Q-15-2 lands the C-07 buffer accessor there is no real path — the
    // extension always delegates to the stub, which preserves draw count = 1
    // per kind. When the flag is off the member IS the stub (same function).
    if (!qrFlagsOf(app).some((f) => f === INSTANCE_TRANSFORMS_FLAG || f === "all" || f.startsWith("A3D_QR_GAME"))) {
      // Flag off: identical observable behaviour through the stub path.
      return (matrices: Float32Array, count: number, colors?: Float32Array) =>
        stubSetInstanceTransforms(handle, app, matrices, count, colors);
    }
    return (matrices: Float32Array, count: number, colors?: Float32Array) =>
      stubSetInstanceTransforms(handle, app, matrices, count, colors);
  }
};
