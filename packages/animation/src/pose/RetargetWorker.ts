/**
 * T3.8 (PRD-06 §7.2) — worker-side retarget baking plumbing. `createRetargetWorker`
 * returns a module `Worker` bound to `retarget.worker.js` (the emitted JS;
 * bundlers resolve the `new URL(..., import.meta.url)` form); Node/test
 * environments get `undefined` and callers fall back to an in-process bake.
 */

import type { CompiledClip } from "./CompiledClip.js";
import type { SkeletonBinding } from "./SkeletonBinding.js";
import type { BakeRetargetedClipsOptions } from "./Retarget.js";
import type { RetargetWorkerRequest, RetargetWorkerResponse } from "./retarget.worker.js";

export function createRetargetWorker(): Worker | undefined {
  if (typeof Worker === "undefined") return undefined;
  try {
    return new Worker(new URL("./retarget.worker.js", import.meta.url), { type: "module" });
  } catch {
    return undefined;
  }
}

/** Default time a worker bake may take before it is abandoned (anim-phys-09). */
export const RETARGET_WORKER_TIMEOUT_MS = 20_000;

/**
 * Run one bake on `worker`. The worker is single-use: it is terminated after
 * the response so a caller-side leak can't accumulate bake threads.
 *
 * The promise always settles: a worker that errors, sends a message that
 * cannot be deserialized (`messageerror`), cannot receive the request, or does
 * not reply within `timeoutMs` (default {@link RETARGET_WORKER_TIMEOUT_MS})
 * rejects, and the caller falls back to the in-process bake (anim-phys-09).
 */
export function bakeClipsInWorker(
  worker: Worker,
  request: {
    readonly sourceSkeleton: SkeletonBinding;
    readonly targetSkeleton: SkeletonBinding;
    readonly clips: ReadonlyMap<string, CompiledClip>;
    readonly options?: BakeRetargetedClipsOptions;
  },
  timeoutMs: number = RETARGET_WORKER_TIMEOUT_MS
): Promise<ReadonlyMap<string, CompiledClip>> {
  return new Promise((resolve, reject) => {
    const requestId = Math.floor(Math.random() * 0xffffffff);
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      fn();
    };
    worker.onmessage = (event: MessageEvent<RetargetWorkerResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId) return;
      const clips = response.clips;
      if (response.kind === "baked" && clips !== undefined) {
        done(() => resolve(clips));
      } else {
        done(() => reject(new Error(response.error ?? "retarget worker bake failed")));
      }
    };
    worker.onerror = (event) => {
      done(() => reject(new Error(event.message || "retarget worker error")));
    };
    worker.onmessageerror = () => {
      done(() => reject(new Error("retarget worker reply could not be deserialized")));
    };
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        done(() => reject(new Error(`retarget worker did not reply within ${timeoutMs} ms`)));
      }, timeoutMs);
    }
    const request_: RetargetWorkerRequest = {
      kind: "bake",
      requestId,
      sourceSkeleton: request.sourceSkeleton,
      targetSkeleton: request.targetSkeleton,
      clips: request.clips,
      ...(request.options !== undefined ? { options: request.options } : {})
    };
    try {
      worker.postMessage(request_);
    } catch (error) {
      done(() => reject(error instanceof Error ? error : new Error(String(error))));
    }
  });
}
