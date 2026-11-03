import { describe, expect, it } from "vitest";
import { PostViewHistory } from "../../../packages/rendering/src/post/PostGraph";

type Target = { readonly id: number };

function makeFixture() {
  const history = new PostViewHistory<Target>();
  const attempts: number[] = [];
  const released: number[] = [];
  const failures = new Set<number>();
  let nextId = 0;
  let onRelease: ((target: Target) => void) | undefined;
  return {
    history, attempts, released, failures,
    allocate: () => ({ id: nextId++ }),
    release: (target: Target) => {
      attempts.push(target.id);
      onRelease?.(target);
      if (failures.has(target.id)) throw new Error(`release ${target.id}`);
      released.push(target.id);
    },
    setOnRelease: (callback: (target: Target) => void) => { onRelease = callback; },
    get nextId() { return nextId; }
  };
}

function frame(scopeId: object, viewId = "left", effectIndex = 0) {
  return { scopeId, viewId, effectIndex, frameId: 1, width: 8, height: 8 };
}

function caught(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  throw new Error("Expected the action to throw");
}

describe("post view history retryable cleanup", () => {
  it("retries only failed targets of a view without touching other views or scopes", () => {
    const f = makeFixture();
    const scope = {}, otherScope = {};
    const first = f.history.begin(frame(scope), f.allocate, f.release);
    const second = f.history.begin(frame(scope, "left", 1), f.allocate, f.release);
    const right = f.history.begin(frame(scope, "right"), f.allocate, f.release);
    const other = f.history.begin(frame(otherScope), f.allocate, f.release);
    f.setOnRelease((target) => {
      if (target.id < 4) {
        expect(() => first.commit()).toThrow("POST_HISTORY_STALE_LEASE");
        expect(() => second.abort()).toThrow("POST_HISTORY_STALE_LEASE");
      }
    });
    f.failures.add(0);
    f.failures.add(3);

    const failure = caught(() => f.history.resetView(scope, "left"));
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error: Error) => error.message)).toEqual(["release 0", "release 3"]);
    expect(f.attempts).toEqual([0, 1, 2, 3]);
    right.commit();
    other.commit();

    f.history.resetView(scope, "right");
    expect(f.attempts).toEqual([0, 1, 2, 3, 4, 5]);
    f.history.resetView(otherScope, "missing");
    expect(f.attempts).toEqual([0, 1, 2, 3, 4, 5]);

    const replacement = f.history.begin(frame(scope), f.allocate, f.release);
    f.failures.delete(0);
    expect(() => f.history.resetView(scope, "left")).toThrow("Post history target disposal failed");
    expect(f.attempts).toEqual([0, 1, 2, 3, 4, 5, 0, 3, 8, 9]);
    expect(() => replacement.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    other.commit();
    f.failures.delete(3);
    f.history.resetView(scope, "left");
    f.history.resetView(scope, "left");
    expect(f.attempts).toEqual([0, 1, 2, 3, 4, 5, 0, 3, 8, 9, 3]);

    f.history.dispose();
    f.history.dispose();
    expect(f.attempts.slice(-2)).toEqual([6, 7]);
    expect([...f.released].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("retires a whole scope and lets individual views retry without crossing scopes", () => {
    const f = makeFixture();
    const scope = {}, otherScope = {};
    const left = f.history.begin(frame(scope), f.allocate, f.release);
    const right = f.history.begin(frame(scope, "right"), f.allocate, f.release);
    const other = f.history.begin(frame(otherScope), f.allocate, f.release);
    f.setOnRelease((target) => {
      if (target.id < 4) {
        expect(() => left.commit()).toThrow("POST_HISTORY_STALE_LEASE");
        expect(() => right.abort()).toThrow("POST_HISTORY_STALE_LEASE");
        other.commit();
      }
    });
    f.failures.add(0);
    f.failures.add(2);

    expect(() => f.history.resetScope(scope)).toThrow("Post history target disposal failed");
    expect(f.attempts).toEqual([0, 1, 2, 3]);
    expect(() => left.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(() => right.abort()).toThrow("POST_HISTORY_STALE_LEASE");
    other.commit();

    expect(() => f.history.resetView(scope, "left")).toThrow("Post history target disposal failed");
    expect(f.attempts).toEqual([0, 1, 2, 3, 0]);
    f.failures.delete(0);
    f.history.resetView(scope, "left");
    f.failures.delete(2);
    f.history.resetScope(scope);
    expect(f.attempts).toEqual([0, 1, 2, 3, 0, 0, 2]);
    other.commit();
    f.history.dispose();
    expect(f.attempts.slice(-2)).toEqual([4, 5]);
  });

  it("invalidates immediately on dispose and retries failures on later resets or disposals", () => {
    const f = makeFixture();
    const scope = {}, otherScope = {};
    const first = f.history.begin(frame(scope), f.allocate, f.release);
    const other = f.history.begin(frame(otherScope), f.allocate, f.release);
    f.failures.add(0);
    f.failures.add(2);
    f.setOnRelease(() => {
      expect(() => first.commit()).toThrow("POST_HISTORY_STALE_LEASE");
      expect(() => other.abort()).toThrow("POST_HISTORY_STALE_LEASE");
    });

    const failure = caught(() => f.history.dispose());
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error: Error) => error.message)).toEqual(["release 0", "release 2"]);
    expect(f.attempts).toEqual([0, 1, 2, 3]);
    expect(() => f.history.begin(frame(scope), f.allocate, f.release)).toThrow("POST_HISTORY_DISPOSED");

    expect(() => f.history.resetView(scope, "left")).toThrow("Post history target disposal failed");
    f.failures.delete(2);
    f.history.resetScope(otherScope);
    expect(() => f.history.dispose()).toThrow("Post history target disposal failed");
    expect(f.attempts).toEqual([0, 1, 2, 3, 0, 2, 0]);
    f.failures.delete(0);
    f.history.dispose();
    f.history.dispose();
    expect(f.attempts).toEqual([0, 1, 2, 3, 0, 2, 0, 0]);
    expect([...f.released].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("preserves the allocation error and retains a partially allocated target for retry", () => {
    const f = makeFixture();
    const scope = {}, allocationError = new Error("allocation failed");
    let allocations = 0;
    f.failures.add(0);
    const failure = caught(() => f.history.begin(frame(scope), () => {
      if (++allocations === 2) throw allocationError;
      return f.allocate();
    }, f.release));
    expect(failure).toBe(allocationError);
    expect(f.attempts).toEqual([0]);

    expect(() => f.history.resetView(scope, "left")).toThrow("Post history target disposal failed");
    expect(f.attempts).toEqual([0, 0]);
    f.failures.delete(0);
    f.history.resetScope(scope);
    f.history.dispose();
    expect(f.attempts).toEqual([0, 0, 0]);
    expect(f.released).toEqual([0]);
  });

  it("preserves an alias error and releases an aliased allocation only once per attempt", () => {
    const f = makeFixture();
    const scope = {}, target = f.allocate();
    f.failures.add(target.id);
    expect(() => f.history.begin(frame(scope), () => target, f.release)).toThrow("POST_HISTORY_TARGET_ALIAS");
    expect(f.attempts).toEqual([0]);
    f.failures.delete(target.id);
    f.history.resetView(scope, "left");
    f.history.dispose();
    expect(f.attempts).toEqual([0, 0]);
    expect(f.released).toEqual([0]);
  });

  it("retains failed targets after invalidation without releasing successful targets again", () => {
    const f = makeFixture();
    const scope = {}, input = frame(scope);
    const original = f.history.begin(input, f.allocate, f.release);
    f.failures.add(0);
    const resized = { ...input, frameId: 2, width: 16 };

    expect(() => f.history.begin(resized, f.allocate, f.release)).toThrow("Post history target disposal failed");
    expect(f.attempts).toEqual([0, 1]);
    expect(f.nextId).toBe(2);
    expect(() => original.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    const replacement = f.history.begin(resized, f.allocate, f.release);
    replacement.commit();
    f.failures.delete(0);
    f.history.resetView(scope, "left");
    f.history.dispose();
    expect(f.attempts).toEqual([0, 1, 0, 2, 3]);
    expect([...f.released].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("handles reentrant disposal without releasing in-flight or already released targets twice", () => {
    const f = makeFixture();
    const scope = {}, otherScope = {};
    const first = f.history.begin(frame(scope), f.allocate, f.release);
    const other = f.history.begin(frame(otherScope), f.allocate, f.release);
    f.setOnRelease((target) => {
      expect(() => first.commit()).toThrow("POST_HISTORY_STALE_LEASE");
      if (target.id === 0) {
        other.commit();
        f.history.dispose();
        expect(() => other.commit()).toThrow("POST_HISTORY_STALE_LEASE");
      }
    });

    f.history.resetView(scope, "left");
    f.history.dispose();
    expect([...f.attempts].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect([...f.released].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("retains failures from a reentrant disposal and retries only those targets", () => {
    const f = makeFixture();
    const scope = {}, otherScope = {};
    const first = f.history.begin(frame(scope), f.allocate, f.release);
    const other = f.history.begin(frame(otherScope), f.allocate, f.release);
    f.failures.add(1);
    f.failures.add(2);
    f.setOnRelease((target) => {
      if (target.id === 0) {
        try { f.history.dispose(); } catch { /* The outer reset still reports nested failures. */ }
      }
    });

    const failure = caught(() => f.history.resetView(scope, "left"));
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error: Error) => error.message)).toEqual(["release 1", "release 2"]);
    expect(f.attempts).toEqual([0, 1, 2, 3]);
    expect(() => first.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(() => other.abort()).toThrow("POST_HISTORY_STALE_LEASE");
    f.failures.clear();
    f.history.dispose();
    f.history.dispose();
    expect(f.attempts).toEqual([0, 1, 2, 3, 1, 2]);
    expect([...f.released].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("attempts each target once per reentrant cleanup and reports swallowed nested failures", () => {
    const f = makeFixture();
    const scope = {};
    f.history.begin(frame(scope), f.allocate, f.release);
    f.failures.add(0);
    f.failures.add(1);
    f.setOnRelease(() => {
      try { f.history.resetView(scope, "left"); } catch { /* The outer cleanup must still report this failure. */ }
    });

    const failure = caught(() => f.history.resetView(scope, "left"));
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error: Error) => error.message)).toEqual(["release 1", "release 0"]);
    expect(f.attempts).toEqual([0, 1]);
    f.failures.clear();
    f.history.resetView(scope, "left");
    f.history.dispose();
    expect(f.attempts).toEqual([0, 1, 0, 1]);
    expect([...f.released].sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it("keeps a replacement begun by a release callback owned by the new view", () => {
    const f = makeFixture();
    const scope = {}, input = frame(scope);
    const original = f.history.begin(input, f.allocate, f.release);
    let replacement: ReturnType<typeof f.history.begin> | undefined;
    f.setOnRelease((target) => {
      if (target.id === 0) replacement = f.history.begin(input, f.allocate, f.release);
    });

    f.history.resetView(scope, "left");
    expect(() => original.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(replacement).toBeDefined();
    replacement!.commit();
    f.history.resetView(scope, "left");
    f.history.dispose();
    expect(f.attempts).toEqual([0, 1, 2, 3]);
  });

  it("does not resurrect a view reset reentrantly while its old entry is invalidated", () => {
    const f = makeFixture();
    const scope = {}, input = frame(scope);
    const original = f.history.begin(input, f.allocate, f.release);
    f.setOnRelease((target) => {
      if (target.id === 0) f.history.resetView(scope, "left");
    });

    expect(() => f.history.begin({ ...input, frameId: 2, width: 16 }, f.allocate, f.release))
      .toThrow("POST_HISTORY_STALE_LEASE");
    expect(() => original.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(f.nextId).toBe(2);
    f.history.dispose();
    expect(f.attempts).toEqual([0, 1]);
  });

  it("does not overwrite a replacement begun reentrantly during invalidation", () => {
    const f = makeFixture();
    const scope = {}, input = frame(scope), nextFrame = { ...frame(scope), frameId: 2, width: 16 };
    const original = f.history.begin(input, f.allocate, f.release);
    let replacement: ReturnType<typeof f.history.begin> | undefined;
    f.setOnRelease((target) => {
      if (target.id === 0) replacement = f.history.begin(nextFrame, f.allocate, f.release);
    });

    expect(() => f.history.begin(nextFrame, f.allocate, f.release)).toThrow("POST_HISTORY_STALE_LEASE");
    expect(() => original.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(replacement).toBeDefined();
    replacement!.commit();
    f.history.dispose();
    expect(f.attempts).toEqual([0, 1, 2, 3]);
  });

  it("cleans a partial allocation if reset reenters the allocator", () => {
    const f = makeFixture();
    const scope = {};
    expect(() => f.history.begin(frame(scope), () => {
      const target = f.allocate();
      f.history.resetView(scope, "left");
      return target;
    }, f.release)).toThrow("POST_HISTORY_STALE_LEASE");
    f.history.dispose();
    expect(f.attempts).toEqual([0]);
  });

  it("does not overwrite a replacement begun reentrantly by an allocator", () => {
    const f = makeFixture();
    const scope = {}, input = frame(scope);
    let replacement: ReturnType<typeof f.history.begin> | undefined;
    expect(() => f.history.begin(input, () => {
      const target = f.allocate();
      replacement = f.history.begin(input, f.allocate, f.release);
      return target;
    }, f.release)).toThrow("POST_HISTORY_STALE_LEASE");
    expect(f.attempts).toEqual([0]);
    expect(replacement).toBeDefined();
    replacement!.commit();
    f.history.dispose();
    expect(f.attempts).toEqual([0, 1, 2]);
    expect(f.released).toEqual([0, 1, 2]);
  });

  it("retains failed cleanup if disposal reenters the second allocation", () => {
    const f = makeFixture();
    const scope = {};
    let allocations = 0;
    f.failures.add(0);
    expect(() => f.history.begin(frame(scope), () => {
      const target = f.allocate();
      if (++allocations === 2) f.history.dispose();
      return target;
    }, f.release)).toThrow("POST_HISTORY_DISPOSED");
    expect(f.attempts).toEqual([0, 1]);
    f.failures.delete(0);
    f.history.dispose();
    f.history.dispose();
    expect(f.attempts).toEqual([0, 1, 0]);
    expect([...f.released].sort((a, b) => a - b)).toEqual([0, 1]);
  });
});
