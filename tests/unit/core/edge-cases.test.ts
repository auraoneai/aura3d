import { describe, expect, it } from "vitest";
import { Diagnostics, DisposableStack, Engine, EventBus, FixedStepAccumulator, ResourceScope, Time } from "@galileo3d/core";

interface EdgeEvents {
  tick: number;
}

describe("core edge cases", () => {
  it("routes listener failures without stopping remaining event listeners", () => {
    const handled: Array<{ eventName: string; message: string }> = [];
    const bus = new EventBus<EdgeEvents>((error, eventName) => {
      handled.push({ eventName, message: error instanceof Error ? error.message : String(error) });
    });
    const calls: number[] = [];

    bus.on("tick", () => {
      throw new Error("listener failed");
    });
    bus.on("tick", (value) => calls.push(value));
    bus.emit("tick", 7);

    expect(handled).toEqual([{ eventName: "tick", message: "listener failed" }]);
    expect(calls).toEqual([7]);
  });

  it("rejects resource registration after disposal and aggregates cleanup errors", async () => {
    const stack = new DisposableStack();
    stack.use({ dispose: () => { throw new Error("first"); } });
    stack.use({ dispose: () => { throw new Error("second"); } });
    await expect(stack.dispose()).rejects.toThrow(AggregateError);
    expect(() => stack.use({ dispose: () => undefined })).toThrow(/disposed/i);

    const scope = new ResourceScope("root");
    await scope.dispose();
    expect(() => scope.use({ dispose: () => undefined })).toThrow(/disposed/i);
    expect(() => scope.createChild("late")).toThrow(/disposed/i);
  });

  it("guards diagnostics timer and metric-kind misuse", () => {
    const diagnostics = new Diagnostics(2);

    expect(() => diagnostics.end("missing")).toThrow(/not started/i);
    diagnostics.begin("frame");
    expect(() => diagnostics.begin("frame")).toThrow(/already started/i);
    diagnostics.end("frame");
    expect(() => diagnostics.gauge("frame", 1)).toThrow(/already exists/i);

    diagnostics.increment("counter");
    diagnostics.increment("counter");
    diagnostics.increment("counter");
    const counter = diagnostics.snapshot().metrics.find((metric) => metric.name === "counter");
    expect(counter?.samples).toEqual([2, 3]);
  });

  it("rejects non-finite time and fixed-step inputs before state changes", () => {
    expect(() => new Time(1, Number.NaN)).toThrow(/timeScale/i);
    const time = new Time(1, 1);
    expect(() => time.update(Number.POSITIVE_INFINITY)).toThrow(/delta/i);
    expect(time.snapshot().elapsed).toBe(0);

    const accumulator = new FixedStepAccumulator(1 / 60, 4);
    expect(() => accumulator.add(-1)).toThrow(/delta/i);
    expect(accumulator.add(0).steps).toBe(0);
  });

  it("prevents duplicate plugins and plugin registration after initialization", async () => {
    const duplicate = new Engine();
    duplicate.use({ id: "plugin" });
    expect(() => duplicate.use({ id: "plugin" })).toThrow(/already registered/i);

    const initialized = new Engine();
    await initialized.init();
    expect(() => initialized.use({ id: "late" })).toThrow(/before init/i);
    await initialized.dispose();
  });
});
