/**
 * GPU back-to-front ordering for Gaussian splats through the bounded native
 * sorter. Camera distances are uploaded as f32 keys, sorted descending with
 * index-stable ties, and the permutation is read back once so the existing
 * instance packing and transparent-run merging stay unchanged.
 *
 * Keys are rounded to f32, so two splats whose f64 distances differ by less
 * than one f32 ulp tie and keep ascending asset order; the CPU path compares
 * the f64 distances. Every buffer created here is destroyed only after the
 * sorter's `safeToRelease` (a successful fence or confirmed device loss).
 */
import type { NativeGpuSort, NativeGpuSortBuffer, NativeGpuSortDevice } from "./NativeGpuSort";

const STORAGE = 0x0080;
const COPY_SRC = 0x0004;
const COPY_DST = 0x0008;
const MAP_READ = 0x0001;
const MAP_MODE_READ = 0x0001;

interface SplatOrderReadbackBuffer extends NativeGpuSortBuffer {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
}

/** Native device shape needed beyond the sorter contract: key upload and index readback. */
export interface GaussianSplatGpuOrderDevice {
  readonly queue: NativeGpuSortDevice["queue"] & {
    writeBuffer(buffer: NativeGpuSortBuffer, offset: number, data: ArrayBufferView): void;
  };
  createBuffer(descriptor: { readonly label?: string; readonly size: number; readonly usage: number }): NativeGpuSortBuffer;
  createCommandEncoder(descriptor?: { readonly label?: string }): {
    copyBufferToBuffer(source: NativeGpuSortBuffer, sourceOffset: number, destination: NativeGpuSortBuffer, destinationOffset: number, size: number): void;
    finish(): unknown;
  };
}

/** A sorter plus the native device it was created on. */
export interface GaussianSplatGpuSort {
  readonly device: GaussianSplatGpuOrderDevice;
  readonly sorter: NativeGpuSort;
}

function abortError(): Error {
  const error = new Error("Gaussian splat GPU sort was aborted");
  error.name = "AbortError";
  return error;
}

/**
 * Return `visible` reordered back-to-front by `distances[visible[i]]`.
 * Throws on any failure; callers decide whether to fall back to the CPU sort.
 */
export async function sortGaussianSplatOrderOnGpu(gpu: GaussianSplatGpuSort, distances: Float64Array, visible: Uint32Array, signal?: AbortSignal): Promise<Uint32Array> {
  if (signal?.aborted) throw abortError();
  const count = visible.length;
  if (count < 2) return visible.slice();
  const keys = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const key = Math.fround(distances[visible[i]!]!);
    if (!Number.isFinite(key)) throw new RangeError("splat GPU sort key must fit float32");
    keys[i] = key;
  }
  const bytes = count * 4;
  const { device } = gpu;
  const owned: NativeGpuSortBuffer[] = [];
  let safeToRelease: Promise<void> | undefined;
  try {
    const keyBuffer = device.createBuffer({ label: "aura3d-splat-sort-keys", size: bytes, usage: STORAGE | COPY_DST });
    owned.push(keyBuffer);
    const indexBuffer = device.createBuffer({ label: "aura3d-splat-sort-indices", size: bytes, usage: STORAGE | COPY_SRC });
    owned.push(indexBuffer);
    device.queue.writeBuffer(keyBuffer, 0, keys);
    const submission = gpu.sorter.sort({ keys: keyBuffer, indices: indexBuffer, count, direction: "descending", signal });
    safeToRelease = submission.safeToRelease;
    await submission.completion;
    const readback = device.createBuffer({ label: "aura3d-splat-sort-readback", size: bytes, usage: MAP_READ | COPY_DST }) as SplatOrderReadbackBuffer;
    owned.push(readback);
    if (typeof readback.mapAsync !== "function" || typeof readback.getMappedRange !== "function" || typeof readback.unmap !== "function") {
      throw new Error("splat GPU sort readback buffer is not mappable");
    }
    const encoder = device.createCommandEncoder({ label: "aura3d-splat-sort-readback" });
    encoder.copyBufferToBuffer(indexBuffer, 0, readback, 0, bytes);
    device.queue.submit([encoder.finish()]);
    // The copy is ordered after the sort; the next safe release must cover it too.
    safeToRelease = Promise.all([safeToRelease, device.queue.onSubmittedWorkDone()]).then(() => undefined);
    await readback.mapAsync(MAP_MODE_READ);
    let local: Uint32Array;
    try { local = new Uint32Array(readback.getMappedRange().slice(0, bytes)); }
    finally { readback.unmap(); }
    if (signal?.aborted) throw abortError();
    const seen = new Uint8Array(count);
    const order = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      const index = local[i]!;
      if (index >= count || seen[index]) throw new Error("splat GPU sort returned an invalid permutation");
      seen[index] = 1;
      order[i] = visible[index]!;
    }
    return order;
  } finally {
    const release = (): void => { for (const buffer of owned) { try { buffer.destroy(); } catch { /* Best-effort scratch release. */ } } };
    if (safeToRelease) void safeToRelease.then(release, () => undefined);
    else release();
  }
}
