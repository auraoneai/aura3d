/**
 * Building blocks for a future renderer-owned WebGL pair submission.
 *
 * None of these helpers authenticates a device, context, resource, callback,
 * or renderer packet. In particular, a submission record is bookkeeping,
 * not permission to issue GL commands. A real capability must establish those
 * properties independently before any of these plans can be consumed.
 */

export type WebGLBatchUnavailable = "native-attestation-unavailable";

/**
 * No native bootstrap or shared-context state proof is installed yet. Do not
 * inspect the candidate: even reading a property of a foreign device can run
 * a callback. This function neither touches GL nor consumes its error queue.
 */
export function acquireWebGLBatchCapability(_candidate: unknown): WebGLBatchUnavailable {
  return "native-attestation-unavailable";
}

export type WebGLBatchSubmissionPhase = "prepared" | "attempted" | "submitted" | "completed" | "invalidated";

/**
 * Track a single already-authorized attempt without issuing GL or changing
 * counters. Mark the attempt immediately before invoking the native draw;
 * after that point an exception cannot establish that nothing was submitted.
 * The ordinary public device draw remains the owner of submission counters.
 *
 * `mayFallBackBeforeSubmission` speaks only to submission ownership. A caller
 * must independently verify that the device/frame is still valid and that no
 * speculative user callback or other visible side effect occurred before
 * considering a logical fallback.
 */
export class WebGLBatchSubmissionState {
  #phaseValue: WebGLBatchSubmissionPhase = "prepared";
  #attempted = false;
  readonly #frameToken: object;
  readonly #generation: number;

  constructor(frameToken: object, generation: number) {
    if (typeof frameToken !== "object" || frameToken === null || typeof generation !== "number"
      || generation < 0 || generation > 9007199254740991 || generation % 1 !== 0) {
      throw new Error("A WebGL batch needs a live frame identity and generation");
    }
    this.#frameToken = frameToken;
    this.#generation = generation;
  }

  get phase(): WebGLBatchSubmissionPhase { return this.#phaseValue; }

  get mayFallBackBeforeSubmission(): boolean { return !this.#attempted; }

  /** Revalidate frame identity before crossing the native-submission boundary. */
  beginAttempt(currentFrame: object | null, currentGeneration: number): boolean {
    if (this.#phaseValue !== "prepared") return false;
    if (currentFrame !== this.#frameToken || currentGeneration !== this.#generation) {
      this.#phaseValue = "invalidated";
      return false;
    }
    this.#attempted = true;
    this.#phaseValue = "attempted";
    return true;
  }

  /** The native draw returned; restoration still has to finish. */
  markSubmitted(): void {
    if (this.#phaseValue !== "attempted") throw new Error("WebGL batch was not attempted");
    this.#phaseValue = "submitted";
  }

  /** The original draw's externally visible state has been restored. */
  markRestored(): void {
    if (this.#phaseValue !== "submitted") throw new Error("WebGL batch has not been submitted");
    this.#phaseValue = "completed";
  }

  /** Invalidation after an attempted draw must never permit replay. */
  invalidate(): void {
    if (this.#phaseValue !== "completed") this.#phaseValue = "invalidated";
  }
}

/** The MVP state the ordinary binder would use for two consecutive draws. */
export interface WebGLBatchMvpPlan {
  /** Effective first and second matrices, suitable for a `mat4[2]` packet. */
  readonly matrices: Float32Array;
  /** Last cached and native values after the two ordinary draws. */
  readonly finalCached: Float32Array;
  readonly finalNative: Float32Array;
  /** Whether the ordinary binder would upload each matrix. */
  readonly uploads: readonly [boolean, boolean];
}

const MATRIX_ELEMENTS = 16;
const Float32ArrayIntrinsic = Float32Array;
const arrayBufferIsView = ArrayBuffer.isView;
const getPrototypeOf = Object.getPrototypeOf;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const typedArrayPrototype = getPrototypeOf(Float32ArrayIntrinsic.prototype);
const typedArrayLength = getOwnPropertyDescriptor(typedArrayPrototype, "length")!.get!;
const typedArrayBuffer = getOwnPropertyDescriptor(typedArrayPrototype, "buffer")!.get!;
const arrayBufferByteLength = getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!;
const reflectApply = Reflect.apply;

/**
 * Matrix inputs must be genuine Float32Arrays over non-shared ArrayBuffers.
 * `ArrayBuffer.isView` rejects Proxy wrappers before prototype inspection;
 * a shared buffer could otherwise change concurrently during the plan. This
 * is a data-shape check, not native-context attestation: an eventual fast path
 * must also authenticate the intrinsics and all other reachable operations.
 */
function isMatrix(value: unknown): value is Float32Array {
  if (!arrayBufferIsView(value) || getPrototypeOf(value) !== Float32ArrayIntrinsic.prototype) return false;
  // The ordinary binder reads `.length`; an own override may execute code or
  // change that value, so do not bypass it while planning.
  if (getOwnPropertyDescriptor(value, "length") !== undefined) return false;
  if (reflectApply(typedArrayLength, value, []) !== MATRIX_ELEMENTS) return false;
  try {
    const buffer: unknown = reflectApply(typedArrayBuffer, value, []);
    // The ArrayBuffer getter's native brand check rejects SharedArrayBuffer.
    reflectApply(arrayBufferByteLength, buffer, []);
  } catch { return false; }
  const matrix = value as Float32Array;
  for (let index = 0; index < MATRIX_ELEMENTS; index += 1) {
    const component = matrix[index]!;
    if (component !== component || component === Infinity || component === -Infinity) return false;
  }
  return true;
}

/**
 * Model the existing `uploadUniforms` array cache exactly. It compares entries
 * using `===`, so +0 and -0 are equal: on a cache hit the actual native value,
 * not necessarily the incoming value or the cached bits, is used for the draw.
 * Inputs are never mutated. A non-finite or unsupported-shaped matrix returns null
 * and must follow ordinary drawing instead.
 *
 * This only plans the MVP uniform. It does not validate or restore any other
 * GL state, prove the native snapshot was read safely, or authorize batching.
 */
export function planWebGLBatchMvpPair(
  first: unknown,
  second: unknown,
  cached: unknown,
  native: unknown
): WebGLBatchMvpPlan | null {
  if (!isMatrix(first) || !isMatrix(second) || (cached !== undefined && !isMatrix(cached)) || !isMatrix(native)) return null;
  const matrices = new Float32ArrayIntrinsic(MATRIX_ELEMENTS * 2);
  const finalCached = new Float32ArrayIntrinsic(MATRIX_ELEMENTS);
  const finalNative = new Float32ArrayIntrinsic(MATRIX_ELEMENTS);
  const uploads: [boolean, boolean] = [false, false];
  let hasCache = cached !== undefined;
  for (let index = 0; index < MATRIX_ELEMENTS; index += 1) {
    if (hasCache) finalCached[index] = (cached as Float32Array)[index]!;
    finalNative[index] = native[index]!;
  }
  for (let draw = 0; draw < 2; draw += 1) {
    const input = draw === 0 ? first : second;
    let same = hasCache;
    if (same) {
      for (let index = 0; index < MATRIX_ELEMENTS; index += 1) {
        if (finalCached[index] !== input[index]) { same = false; break; }
      }
    }
    if (!same) {
      uploads[draw] = true;
      hasCache = true;
      for (let index = 0; index < MATRIX_ELEMENTS; index += 1) {
        finalCached[index] = input[index]!;
        finalNative[index] = input[index]!;
      }
    }
    for (let index = 0; index < MATRIX_ELEMENTS; index += 1) matrices[draw * MATRIX_ELEMENTS + index] = finalNative[index]!;
  }
  return { matrices, finalCached, finalNative, uploads };
}
