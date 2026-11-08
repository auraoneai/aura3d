/**
 * Point sprites as screen-aligned quads (WebGPU has no `gl_PointSize`): quad geometry arrays for `n` points and a node
 * wrapper that writes whole-array point updates to the four corners of each quad. Used by the ports that draw their
 * sprites as quads on a requested WebGPU backend (Ion Circuit, Cumulus Dash); the default WebGL2 points are untouched.
 */

const CORNER_UV = [0, 0, 1, 0, 1, 1, 0, 1] as const;

/** Quad geometry arrays for `n` points: zero positions, corner uvs, two triangles per point. */
export function pointQuadArrays(n: number): { positions: Float32Array; uvs: Float32Array; indices: Uint32Array } {
  const uvs = new Float32Array(n * 8);
  const indices = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    uvs.set(CORNER_UV, i * 8);
    const v = i * 4;
    indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
  }
  return { positions: new Float32Array(n * 12), uvs, indices };
}

/** Repeats each `itemSize` item of `src` four times into `out` (one copy per quad corner); returns `out`. */
export function expandToCorners(src: ArrayLike<number>, itemSize: number, out: Float32Array): Float32Array {
  const items = Math.min(Math.floor(src.length / itemSize), Math.floor(out.length / (itemSize * 4)));
  let o = 0;
  for (let i = 0; i < items; i++) {
    const base = i * itemSize;
    for (let c = 0; c < 4; c++) for (let k = 0; k < itemSize; k++) out[o++] = src[base + k]!;
  }
  return out;
}

type AttributeUpdate = { array: Float32Array; offset: number };
interface UpdatableNode { updateAttribute?: (name: string, update: AttributeUpdate) => void }

/** Wraps a points node handle so whole-array point updates land on the quad corners (offset 0 only, as the port writes). */
export function quadUpdater<T extends UpdatableNode>(handle: T, itemSizes: Readonly<Record<string, number>>): UpdatableNode {
  const scratch = new Map<string, Float32Array>();
  return {
    updateAttribute(name, update) {
      const itemSize = itemSizes[name] ?? 1;
      let out = scratch.get(name);
      if (!out || out.length !== update.array.length * 4) scratch.set(name, out = new Float32Array(update.array.length * 4));
      handle.updateAttribute?.(name, { array: expandToCorners(update.array, itemSize, out), offset: update.offset * 4 });
    }
  };
}
