/**
 * MikkTSpaceTangents.ts — MikkTSpace tangent generation seam (PRD-04 §7.3,
 * P1-6; R8). The wasm module is injected (r185's
 * `examples/jsm/libs/mikktspace.module.js`, vendored by PRD 05 under
 * `packages/assets/vendor/mikktspace/` — request Q-05-1).
 *
 * - `setMikkTSpaceModule` stores the module; `mikkTSpaceAvailable` reports it.
 * - `generateMikkTSpaceTangents` unwelds indexed input (MikkTSpace requires
 *   non-indexed streams), runs the module, then flips `.w` — the glTF UV
 *   convention, matching `computeMikkTSpaceTangents(geometry, mikk, true)`.
 * - Runs in a module Worker when `Worker` is defined and a worker factory was
 *   supplied via `setMikkTSpaceWorkerFactory` (PRD-05 vendored wrapper wires
 *   `new Worker(new URL("./mikktspace.worker.js", import.meta.url))`); falls
 *   back to the inline call otherwise.
 */

export interface MikkTSpaceModule {
  generateTangents(positions: Float32Array, normals: Float32Array, uvs: Float32Array): Float32Array;
  /** r185's module exposes a thenable; `await` covers both. */
  ready?: PromiseLike<void>;
}

export interface MikkTSpaceTangentInput {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices?: Uint32Array | Uint16Array;
}

interface UnweldedInput {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
}

let module_: MikkTSpaceModule | undefined;
let workerFactory: (() => Worker) | undefined;
let worker: Worker | undefined;
let requestSeq = 0;
const pending = new Map<number, { resolve: (t: Float32Array) => void; reject: (e: unknown) => void }>();

export function setMikkTSpaceModule(mod: MikkTSpaceModule): void {
  module_ = mod;
}

/**
 * Optional: supply a factory that returns the MikkTSpace worker
 * (`new Worker(new URL("...mikktspace.worker.js", import.meta.url), {type:"module"})`).
 * The worker implements the `{id, positions, normals, uvs}` → `{id, tangents}`
 * message protocol defined below.
 */
export function setMikkTSpaceWorkerFactory(factory: (() => Worker) | undefined): void {
  workerFactory = factory;
  if (!factory && worker) {
    worker.terminate();
    worker = undefined;
  }
}

export function mikkTSpaceAvailable(): boolean {
  return module_ !== undefined;
}

function unweld(input: MikkTSpaceTangentInput): UnweldedInput {
  const indices = input.indices;
  if (!indices) {
    return { positions: input.positions, normals: input.normals, uvs: input.uvs };
  }
  const count = indices.length;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const v = indices[i];
    positions[i * 3] = input.positions[v * 3];
    positions[i * 3 + 1] = input.positions[v * 3 + 1];
    positions[i * 3 + 2] = input.positions[v * 3 + 2];
    normals[i * 3] = input.normals[v * 3];
    normals[i * 3 + 1] = input.normals[v * 3 + 1];
    normals[i * 3 + 2] = input.normals[v * 3 + 2];
    uvs[i * 2] = input.uvs[v * 2];
    uvs[i * 2 + 1] = input.uvs[v * 2 + 1];
  }
  return { positions, normals, uvs };
}

/** glTF UV convention: flip the handedness sign (three's `negateSign = true`). */
function applyGltfSign(tangents: Float32Array): Float32Array {
  for (let i = 3; i < tangents.length; i += 4) {
    tangents[i] *= -1;
  }
  return tangents;
}

function acquireWorker(): Worker | undefined {
  if (typeof Worker === "undefined" || !workerFactory) return undefined;
  if (worker) return worker;
  const instance = workerFactory();
  instance.onmessage = (event: MessageEvent<{ id: number; tangents?: ArrayBuffer; error?: string }>) => {
    const { id, tangents, error } = event.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (error !== undefined) entry.reject(new Error(error));
    else entry.resolve(new Float32Array(tangents!));
  };
  instance.onerror = (event) => {
    for (const entry of pending.values()) entry.reject(event);
    pending.clear();
  };
  worker = instance;
  return worker;
}

function runInWorker(w: Worker, input: UnweldedInput): Promise<Float32Array> {
  const id = requestSeq++;
  // Copy into tight buffers: caller arrays may be views into larger buffers.
  const positions = new Float32Array(input.positions);
  const normals = new Float32Array(input.normals);
  const uvs = new Float32Array(input.uvs);
  return new Promise<Float32Array>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(
      { id, positions: positions.buffer, normals: normals.buffer, uvs: uvs.buffer },
      [positions.buffer, normals.buffer, uvs.buffer]
    );
  });
}

/**
 * Generate per-vertex tangents (`xyzw`; `w` = handedness sign, glTF
 * convention). When `indices` are present the stream is unwelded first, so
 * the returned array is `indices.length` × 4 — matching three's
 * `computeMikkTSpaceTangents` non-indexed output exactly.
 */
export async function generateMikkTSpaceTangents(input: MikkTSpaceTangentInput): Promise<Float32Array> {
  if (!module_) {
    throw new Error("MikkTSpace module not installed: call setMikkTSpaceModule() first");
  }
  await module_.ready;
  const streams = unweld(input);
  const w = acquireWorker();
  if (w) {
    const tangents = await runInWorker(w, streams);
    return applyGltfSign(tangents);
  }
  const tangents = module_.generateTangents(streams.positions, streams.normals, streams.uvs);
  return applyGltfSign(tangents);
}
