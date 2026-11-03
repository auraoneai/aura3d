import { describe, expect, it } from "vitest";
import {
  acquireWebGLBatchCapability,
  planWebGLBatchMvpPair,
  WebGLBatchSubmissionState
} from "../../../packages/rendering/src/webgl2/BatchExecutionCapability";

function matrix(seed: number): Float32Array {
  return Float32Array.from({ length: 16 }, (_, index) => seed + index);
}

describe("WebGL batch capability availability", () => {
  it("rejects a foreign device without reading it or its GL error state", () => {
    const foreign = new Proxy({}, {
      get() { throw new Error("candidate property was inspected"); },
      getPrototypeOf() { throw new Error("candidate prototype was inspected"); },
      ownKeys() { throw new Error("candidate keys were inspected"); }
    });
    expect(acquireWebGLBatchCapability(foreign)).toBe("native-attestation-unavailable");
    expect(acquireWebGLBatchCapability(null)).toBe("native-attestation-unavailable");
  });
});

describe("WebGL batch MVP planning", () => {
  it("models the ordinary cache hit followed by an upload without changing its inputs", () => {
    const cached = matrix(1), native = matrix(1), first = matrix(1), second = matrix(21);
    const plan = planWebGLBatchMvpPair(first, second, cached, native)!;
    expect(plan.uploads).toEqual([false, true]);
    expect([...plan.matrices]).toEqual([...first, ...second]);
    expect([...plan.finalCached]).toEqual([...second]);
    expect([...plan.finalNative]).toEqual([...second]);
    expect([...cached]).toEqual([...matrix(1)]);
    expect([...native]).toEqual([...matrix(1)]);
  });

  it("uploads the first matrix on a cache miss and reuses it for an equal second draw", () => {
    const first = matrix(2), native = matrix(99);
    const plan = planWebGLBatchMvpPair(first, matrix(2), undefined, native)!;
    expect(plan.uploads).toEqual([true, false]);
    expect([...plan.matrices]).toEqual([...first, ...first]);
    expect([...plan.finalCached]).toEqual([...first]);
    expect([...plan.finalNative]).toEqual([...first]);
  });

  it("uses the native value when a cache hit hides an external uniform change", () => {
    const cached = matrix(1), native = matrix(10), first = matrix(1), second = matrix(20);
    const plan = planWebGLBatchMvpPair(first, second, cached, native)!;
    expect(plan.uploads).toEqual([false, true]);
    expect([...plan.matrices]).toEqual([...native, ...second]);
    expect([...plan.finalCached]).toEqual([...second]);
    expect([...plan.finalNative]).toEqual([...second]);
  });

  it("preserves the native signed-zero bits across cache hits", () => {
    const cached = matrix(1), native = matrix(1), first = matrix(1), second = matrix(1);
    cached[0] = 0;
    native[0] = -0;
    first[0] = 0;
    second[0] = -0;
    const plan = planWebGLBatchMvpPair(first, second, cached, native)!;
    expect(plan.uploads).toEqual([false, false]);
    expect(Object.is(plan.matrices[0], -0)).toBe(true);
    expect(Object.is(plan.matrices[16], -0)).toBe(true);
    expect(Object.is(plan.finalCached[0], 0)).toBe(true);
    expect(Object.is(plan.finalNative[0], -0)).toBe(true);
  });

  it("rejects non-finite, wrong-sized, foreign and proxied views without proxy traps", () => {
    const valid = matrix(0);
    const infinite = matrix(0);
    infinite[0] = Number.MAX_VALUE; // Float32 overflow becomes Infinity.
    expect(planWebGLBatchMvpPair(infinite, valid, undefined, valid)).toBeNull();
    expect(planWebGLBatchMvpPair(new Float32Array(15), valid, undefined, valid)).toBeNull();
    expect(planWebGLBatchMvpPair(new Uint32Array(16), valid, undefined, valid)).toBeNull();
    if (typeof SharedArrayBuffer !== "undefined") {
      expect(planWebGLBatchMvpPair(new Float32Array(new SharedArrayBuffer(64)), valid, undefined, valid)).toBeNull();
    }
    const proxy = new Proxy(valid, {
      get() { throw new Error("matrix property was inspected"); },
      getPrototypeOf() { throw new Error("matrix prototype was inspected"); }
    });
    expect(planWebGLBatchMvpPair(proxy, valid, undefined, valid)).toBeNull();
    const accessor = matrix(0);
    Object.defineProperty(accessor, "length", { get() { throw new Error("matrix length was inspected"); } });
    expect(planWebGLBatchMvpPair(accessor, valid, undefined, valid)).toBeNull();
  });
});

describe("WebGL batch submission bookkeeping", () => {
  it("allows a logical fallback before a native attempt and revokes it before the call", () => {
    const frame = {};
    const state = new WebGLBatchSubmissionState(frame, 3);
    expect(state.phase).toBe("prepared");
    expect(state.mayFallBackBeforeSubmission).toBe(true);
    expect(state.beginAttempt(frame, 3)).toBe(true);
    expect(state.phase).toBe("attempted");
    expect(state.mayFallBackBeforeSubmission).toBe(false);
    Object.assign(state, { attempted: false, phaseValue: "prepared" });
    expect(state.mayFallBackBeforeSubmission).toBe(false);
    expect(state.phase).toBe("attempted");
    state.markSubmitted();
    expect(state.phase).toBe("submitted");
    state.markRestored();
    expect(state.phase).toBe("completed");
    expect(state.mayFallBackBeforeSubmission).toBe(false);
  });

  it("invalidates stale frames and generations without attempting native submission", () => {
    const frame = {};
    const staleFrame = new WebGLBatchSubmissionState(frame, 3);
    expect(staleFrame.beginAttempt({}, 3)).toBe(false);
    expect(staleFrame.phase).toBe("invalidated");
    expect(staleFrame.mayFallBackBeforeSubmission).toBe(true);
    expect(staleFrame.beginAttempt(frame, 3)).toBe(false);
    const staleGeneration = new WebGLBatchSubmissionState(frame, 3);
    expect(staleGeneration.beginAttempt(frame, 4)).toBe(false);
    expect(staleGeneration.phase).toBe("invalidated");
    expect(() => new WebGLBatchSubmissionState(null as never, 1)).toThrow(/live frame identity/);
  });

  it("never permits replay after an attempted draw throws or restoration is invalidated", () => {
    const frame = {};
    const uncertain = new WebGLBatchSubmissionState(frame, 1);
    expect(uncertain.beginAttempt(frame, 1)).toBe(true);
    uncertain.invalidate();
    expect(uncertain.phase).toBe("invalidated");
    expect(uncertain.mayFallBackBeforeSubmission).toBe(false);
    expect(() => uncertain.markSubmitted()).toThrow();
    const restoring = new WebGLBatchSubmissionState(frame, 1);
    expect(restoring.beginAttempt(frame, 1)).toBe(true);
    restoring.markSubmitted();
    restoring.invalidate();
    expect(restoring.mayFallBackBeforeSubmission).toBe(false);
    expect(() => restoring.markRestored()).toThrow();
  });
});
