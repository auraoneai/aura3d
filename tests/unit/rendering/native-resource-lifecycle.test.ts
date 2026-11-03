import { describe, expect, it, vi } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { ResourceLifecycle } from "../../../packages/rendering/src/ResourceLifecycle";
import { MockRenderDevice, type DisposableResource } from "../../../packages/rendering/src/RenderDevice";

function resource(name: string, calls: string[], failure?: Error): DisposableResource {
  let pendingFailure = failure;
  return {
    disposed: false,
    dispose() {
      calls.push(name);
      if (pendingFailure) {
        const error = pendingFailure;
        pendingFailure = undefined;
        throw error;
      }
      (this as { disposed: boolean }).disposed = true;
    }
  };
}

describe("ResourceLifecycle ownership", () => {
  it("cleans up in reverse order, collects failures and remains idempotent", () => {
    const lifecycle = new ResourceLifecycle();
    const calls: string[] = [];
    const firstFailure = new Error("first failure");
    const secondFailure = new Error("second failure");
    lifecycle.track(resource("first", calls, firstFailure));
    lifecycle.track(resource("middle", calls));
    lifecycle.track(resource("last", calls, secondFailure));
    expect(lifecycle.leakCount()).toBe(3);
    try {
      lifecycle.dispose();
      throw new Error("expected lifecycle disposal failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([secondFailure, firstFailure]);
    }
    expect(calls).toEqual(["last", "middle", "first"]);
    expect(lifecycle.leakCount()).toBe(2);
    expect(lifecycle.disposed).toBe(false);
    lifecycle.dispose();
    expect(lifecycle.leakCount()).toBe(0);
    expect(lifecycle.disposed).toBe(true);
    expect(calls).toEqual(["last", "middle", "first", "last", "first"]);
    lifecycle.dispose();
    expect(calls).toEqual(["last", "middle", "first", "last", "first"]);
    expect(() => lifecycle.track(resource("late", calls))).toThrow(/disposed/);
  });

  it("releases a shared resource only after its final owner and deduplicates each owner", () => {
    const calls: string[] = [];
    const shared = resource("shared", calls);
    const first = new ResourceLifecycle();
    const second = new ResourceLifecycle();
    expect(first.track(shared)).toBe(shared);
    first.track(shared);
    second.track(shared);
    expect(first.leakCount()).toBe(1);
    expect(second.leakCount()).toBe(1);
    first.dispose();
    first.dispose();
    expect(shared.disposed).toBe(false);
    expect(calls).toEqual([]);
    second.dispose();
    expect(shared.disposed).toBe(true);
    expect(calls).toEqual(["shared"]);
  });

  it("does not invoke a disposer again for an externally disposed resource", () => {
    const calls: string[] = [];
    const value = resource("external", calls);
    const dispose = vi.spyOn(value, "dispose");
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(value);
    value.dispose();
    expect(lifecycle.leakCount()).toBe(0);
    lifecycle.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("closes before invoking disposers so reentrant teardown is harmless", () => {
    const calls: string[] = [];
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(resource("first", calls));
    lifecycle.track({
      disposed: false,
      dispose() {
        calls.push("reentrant");
        lifecycle.dispose();
        (this as { disposed: boolean }).disposed = true;
      }
    });
    lifecycle.dispose();
    expect(calls).toEqual(["reentrant", "first"]);
  });

  it("retains a failed geometry and retries only the failed device allocation", () => {
    const lifecycle = new ResourceLifecycle();
    const geometry = lifecycle.track(Geometry.triangle());
    const vertices = geometry.vertexBuffer;
    const indices = geometry.indexBuffer!;
    const firstDevice = new MockRenderDevice();
    const secondDevice = new MockRenderDevice();
    const firstVertex = vertices.upload(firstDevice);
    const secondVertex = vertices.upload(secondDevice);
    const firstIndex = indices.upload(firstDevice);
    const secondIndex = indices.upload(secondDevice);
    const failure = new Error("first device failed");
    const retry = vi.spyOn(firstVertex, "dispose").mockImplementationOnce(() => { throw failure; });
    const successful = [secondVertex, firstIndex, secondIndex].map((buffer) => vi.spyOn(buffer, "dispose"));

    try {
      expect(() => lifecycle.dispose()).toThrow(AggregateError);
      expect(lifecycle.disposed).toBe(false);
      expect(lifecycle.leakCount()).toBe(1);
      expect(geometry.disposed).toBe(false);
      expect(firstVertex.disposed).toBe(false);
      expect([secondVertex.disposed, firstIndex.disposed, secondIndex.disposed]).toEqual([true, true, true]);
      expect(() => lifecycle.track(resource("late", []))).toThrow(/disposed/);

      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(lifecycle.leakCount()).toBe(0);
      expect(geometry.disposed).toBe(true);
      expect(firstVertex.disposed).toBe(true);
      expect(retry).toHaveBeenCalledTimes(2);
      for (const dispose of successful) expect(dispose).toHaveBeenCalledOnce();
      lifecycle.dispose();
      expect(retry).toHaveBeenCalledTimes(2);
    } finally {
      retry.mockRestore();
      for (const dispose of successful) dispose.mockRestore();
      geometry.dispose();
      firstDevice.dispose();
      secondDevice.dispose();
    }
  });

  it("releases only its own failed retain if a new lifecycle acquires the resource", () => {
    const first = new ResourceLifecycle();
    const second = new ResourceLifecycle();
    const geometry = first.track(Geometry.triangle());
    const device = new MockRenderDevice();
    const gpu = geometry.vertexBuffer.upload(device);
    const disposal = vi.spyOn(geometry, "dispose").mockImplementationOnce(() => {
      throw new Error("disposal did not start");
    });

    try {
      expect(() => first.dispose()).toThrow(AggregateError);
      expect(first.leakCount()).toBe(1);
      second.track(geometry);
      first.dispose();
      expect(first.disposed).toBe(true);
      expect(geometry.disposed).toBe(false);
      expect(gpu.disposed).toBe(false);
      expect(disposal).toHaveBeenCalledOnce();
      expect(() => geometry.vertexBuffer.readBytes()).not.toThrow();

      second.dispose();
      expect(geometry.disposed).toBe(true);
      expect(gpu.disposed).toBe(true);
      expect(disposal).toHaveBeenCalledTimes(2);
    } finally {
      disposal.mockRestore();
      first.dispose();
      second.dispose();
      geometry.dispose();
      device.dispose();
    }
  });

  it("does not release a peer's retain when retrying an unrelated failed resource", () => {
    const first = new ResourceLifecycle();
    const second = new ResourceLifecycle();
    const calls: string[] = [];
    const shared = resource("shared", calls);
    const failing = resource("failing", calls, new Error("retry me"));
    first.track(shared);
    first.track(failing);
    second.track(shared);

    expect(() => first.dispose()).toThrow(AggregateError);
    expect(first.leakCount()).toBe(1);
    expect(shared.disposed).toBe(false);
    first.dispose();
    expect(failing.disposed).toBe(true);
    expect(shared.disposed).toBe(false);
    expect(calls).toEqual(["failing", "failing"]);
    second.dispose();
    expect(shared.disposed).toBe(true);
    expect(calls).toEqual(["failing", "failing", "shared"]);
  });

  it("does not repeat a cleanup that completed before it reported an error", () => {
    const lifecycle = new ResourceLifecycle();
    const calls: string[] = [];
    const value = lifecycle.track(resource("completed", calls));
    const dispose = value.dispose.bind(value);
    const cleanup = vi.spyOn(value, "dispose").mockImplementationOnce(() => {
      dispose();
      throw new Error("reported after cleanup");
    });

    expect(() => lifecycle.dispose()).toThrow(AggregateError);
    expect(lifecycle.disposed).toBe(true);
    expect(lifecycle.leakCount()).toBe(0);
    lifecycle.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(calls).toEqual(["completed"]);
  });

  it("does not transfer ownership during a reentrant final disposal", () => {
    const owner = new ResourceLifecycle();
    const peer = new ResourceLifecycle();
    const value: DisposableResource = {
      disposed: false,
      dispose() {
        expect(() => peer.track(value)).toThrow(/disposal is in progress/);
        (this as { disposed: boolean }).disposed = true;
      }
    };
    owner.track(value);
    owner.dispose();
    expect(value.disposed).toBe(true);
    expect(peer.leakCount()).toBe(0);
    peer.dispose();
  });

  it("retains a disposer that returns without completing its cleanup", () => {
    const lifecycle = new ResourceLifecycle();
    let attempts = 0;
    const value: DisposableResource = {
      disposed: false,
      dispose() {
        attempts += 1;
        if (attempts === 2) (this as { disposed: boolean }).disposed = true;
      }
    };
    lifecycle.track(value);
    expect(() => lifecycle.dispose()).toThrow(AggregateError);
    expect(lifecycle.disposed).toBe(false);
    expect(lifecycle.leakCount()).toBe(1);
    lifecycle.dispose();
    expect(lifecycle.disposed).toBe(true);
    expect(attempts).toBe(2);
  });
});
