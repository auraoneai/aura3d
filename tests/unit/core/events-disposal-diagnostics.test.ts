import { describe, expect, it } from "vitest";
import { Diagnostics, DisposableStack, EventBus, Logger, ResourceScope, TaskQueue } from "@galileo3d/core";

interface TestEvents {
  tick: number;
}

describe("core events, resources, diagnostics, and queues", () => {
  it("handles listener mutation during emit", () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];
    const second = bus.on("tick", () => calls.push("second"));
    bus.on("tick", () => {
      calls.push("first");
      second.unsubscribe();
    });
    bus.emit("tick", 1);
    expect(calls).toEqual(["second", "first"]);
    bus.emit("tick", 2);
    expect(calls).toEqual(["second", "first", "first"]);
  });

  it("runs once listeners only once", () => {
    const bus = new EventBus<TestEvents>();
    let count = 0;
    bus.once("tick", () => count++);
    bus.emit("tick", 1);
    bus.emit("tick", 2);
    expect(count).toBe(1);
  });

  it("disposes resources in LIFO order and is idempotent", async () => {
    const stack = new DisposableStack();
    const order: number[] = [];
    stack.use({ dispose: () => { order.push(1); } });
    stack.use({ dispose: () => { order.push(2); } });
    await stack.dispose();
    await stack.dispose();
    expect(order).toEqual([2, 1]);
  });

  it("reports nested resource leaks before disposal", async () => {
    const scope = new ResourceScope("root");
    scope.use({ dispose: () => undefined });
    scope.createChild("child").use({ dispose: () => undefined });
    expect(scope.leakSnapshot()).toMatchObject({ name: "root", resourceCount: 1, childScopes: [{ name: "child", resourceCount: 1 }] });
    await scope.dispose();
  });

  it("creates immutable diagnostics snapshots", () => {
    const diagnostics = new Diagnostics();
    diagnostics.increment("frames");
    diagnostics.gauge("entities", 10);
    const snapshot = diagnostics.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.metrics)).toBe(true);
    expect(snapshot.metrics.map((metric) => metric.name).sort()).toEqual(["entities", "frames"]);
  });

  it("contains failing logger sinks", () => {
    const logger = new Logger("debug");
    const entries: string[] = [];
    logger.addSink(() => {
      throw new Error("sink failure");
    });
    logger.addSink((entry) => entries.push(entry.message));
    logger.info("test", "hello");
    logger.info("test", "again");
    expect(entries).toEqual(["hello", "again"]);
  });

  it("flushes queued tasks in enqueue order and supports cancellation", async () => {
    const queue = new TaskQueue();
    const order: number[] = [];
    queue.enqueue(() => { order.push(1); });
    const cancelled = queue.enqueue(() => { order.push(2); });
    queue.enqueue(() => {
      order.push(3);
      queue.enqueue(() => { order.push(4); });
    });
    cancelled.cancel();
    await queue.flush();
    expect(order).toEqual([1, 3, 4]);
  });

  it("continues flushing queued tasks after failures and reports all task errors", async () => {
    const queue = new TaskQueue();
    const order: string[] = [];
    queue.enqueue(() => {
      order.push("first");
      throw new Error("first failed");
    });
    queue.enqueue(() => {
      order.push("second");
      queue.enqueue(() => {
        order.push("third");
        throw new Error("third failed");
      });
    });

    await expect(queue.flush()).rejects.toThrow(AggregateError);
    expect(order).toEqual(["first", "second", "third"]);
    expect(queue.size).toBe(0);
  });
});
