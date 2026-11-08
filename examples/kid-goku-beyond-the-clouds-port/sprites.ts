/** Pooled glow / puff sprite geometry for the Cloud Runner (star orbs and the FX pools): points, or quads on WebGPU. */
import { geometry } from "@aura3d/engine";
import { readLabFlags, resolveLabBackend } from "../shared/lab-flags";
import { pointQuadArrays, quadUpdater } from "../shared/point-quads";

const f32 = (a: ArrayLike<number>): Float32Array => Float32Array.from(a as ArrayLike<number>);

/**
 * A3/W6: draw the glow / puff sprites as quads (WebGPU has no `gl_PointSize`) whenever a WebGPU-capable backend is
 * requested. The showcase wrapper (apps/showcase-cloud-runner-port/src/lab.ts) decides that, including its `auto`
 * default; without the wrapper only `?backend=webgpu|auto` does. `?backend=webgl2` keeps the points.
 */
export const spriteQuads = (): boolean => {
  const wrapped = (globalThis as { __AURA_LAB_APP_OPTIONS__?: { readonly renderer?: unknown } }).__AURA_LAB_APP_OPTIONS__;
  return wrapped ? wrapped.renderer !== undefined : resolveLabBackend(readLabFlags()) !== undefined;
};
/** A pooled sprite geometry of `n` points (`tone`, `aSize`, `aAlpha`), as points or (quads) four corners per point. */
export function spritePoolGeometry(n: number, quads: boolean) {
  const count = quads ? n * 4 : n;
  const attributes = { tone: { itemSize: 3 as const, data: f32(new Array(count * 3).fill(1)) }, aSize: { itemSize: 1 as const, data: f32(new Array(count).fill(0)) }, aAlpha: { itemSize: 1 as const, data: f32(new Array(count).fill(0)) } };
  if (!quads) return geometry.dynamic({ positions: f32(new Array(n * 3).fill(0)), topology: "points", attributes });
  const q = pointQuadArrays(n);
  return geometry.dynamic({ positions: q.positions, uvs: q.uvs, indices: q.indices, attributes });
}
/** A sprite pool's runtime handle: point-array updates, written to the quad corners when the sprites are quads. */
export function spritePoolHandle<T extends { updateAttribute?: (name: string, update: { array: Float32Array; offset: number }) => void }>(handle: T, quads: boolean): Pick<T, "updateAttribute"> {
  return quads ? quadUpdater(handle, { position: 3, tone: 3, aSize: 1, aAlpha: 1 }) : handle;
}
