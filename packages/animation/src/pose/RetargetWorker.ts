/**
 * T3.8 (PRD-06 §7.2) — worker-side retarget baking plumbing. `createRetargetWorker`
 * returns a module `Worker` bound to `retarget.worker.ts` when the platform has
 * workers (bundlers resolve the `new URL(..., import.meta.url)` form); Node/test
 * environments get `undefined` and callers fall back to an in-process bake.
 */

import type { CompiledClip } from "./CompiledClip.js";
import type { SkeletonBinding } from "./SkeletonBinding.js";
import type { BakeRetargetedClipsOptions } from "./Retarget.js";
import type { RetargetWorkerRequest, RetargetWorkerResponse } from "./retarget.worker.js";

export function createRetargetWorker(): Worker | undefined {
  if (typeof Worker === "undefined") return undefined;
  try {
    return new Worker(new URL("./retarget.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return undefined;
  }
}

/**
 * Run one bake on `worker`. The worker is single-use: it is terminated after
 * the response so a caller-side leak can't accumulate bake threads.
 */
export function bakeClipsInWorker(
  worker: Worker,
  request: {
    readonly sourceSkeleton: SkeletonBinding;
    readonly targetSkeleton: SkeletonBinding;
    readonly clips: ReadonlyMap<string, CompiledClip>;
    readonly options?: BakeRetargetedClipsOptions;
  }
): Promise<ReadonlyMap<string, CompiledClip>> {
  return new Promise((resolve, reject) => {
    const requestId = Math.floor(Math.random() * 0xffffffff);
    const done = (fn: () => void) => {
      worker.onmessage = null;
      worker.onerror = null;
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
    const request_: RetargetWorkerRequest = {
      kind: "bake",
      requestId,
      sourceSkeleton: request.sourceSkeleton,
      targetSkeleton: request.targetSkeleton,
      clips: request.clips,
      ...(request.options !== undefined ? { options: request.options } : {})
    };
    worker.postMessage(request_);
  });
}
