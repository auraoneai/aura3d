/**
 * T3.8 (PRD-06 §7.2, R11) — bake worker entry. `actor.animation.addClipsFrom`
 * posts the source skeleton + compiled clips here; the bake runs off the main
 * thread and structured-clone returns the baked `CompiledClip` map. Everything
 * on the wire is plain data (Float32Array/Uint8Array/Map), so no marshal layer
 * is needed.
 */

import { bakeRetargetedClipMap, type BakeRetargetedClipsOptions } from "./Retarget.js";
import type { CompiledClip } from "./CompiledClip.js";
import type { SkeletonBinding } from "./SkeletonBinding.js";

export interface RetargetWorkerRequest {
  readonly kind: "bake";
  readonly requestId: number;
  readonly sourceSkeleton: SkeletonBinding;
  readonly targetSkeleton: SkeletonBinding;
  readonly clips: ReadonlyMap<string, CompiledClip>;
  readonly options?: BakeRetargetedClipsOptions;
}

export interface RetargetWorkerResponse {
  readonly kind: "baked" | "error";
  readonly requestId: number;
  readonly clips?: ReadonlyMap<string, CompiledClip>;
  readonly error?: string;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RetargetWorkerRequest>) => void) | null;
  postMessage: (message: RetargetWorkerResponse) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  if (request.kind !== "bake") return;
  try {
    const clips = bakeRetargetedClipMap(
      { skeleton: request.sourceSkeleton, clips: request.clips },
      request.targetSkeleton,
      request.options ?? {}
    );
    scope.postMessage({ kind: "baked", requestId: request.requestId, clips });
  } catch (error) {
    scope.postMessage({ kind: "error", requestId: request.requestId, error: error instanceof Error ? error.message : String(error) });
  }
};
