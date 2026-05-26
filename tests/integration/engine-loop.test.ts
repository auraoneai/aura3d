import { describe, expect, it } from "vitest";
import { Engine, SystemPhase } from "@aura3d/core";

describe("engine loop integration", () => {
  it("runs task finalization before fixed/update phases and emits frame diagnostics", async () => {
    const engine = new Engine({ fixedDelta: 0.25, maxDelta: 1 });
    const order: string[] = [];
    engine.scheduler.add({ id: "tasks", phase: SystemPhase.Tasks, run: () => { order.push("tasks-phase"); } });
    engine.scheduler.add({ id: "fixed", phase: SystemPhase.Fixed, run: () => { order.push("fixed"); } });
    engine.scheduler.add({ id: "update", phase: SystemPhase.Update, run: () => { order.push("update"); } });
    engine.tasks.enqueue(() => { order.push("queued-task"); });

    const frames: number[] = [];
    engine.events.on("frame", (frame) => frames.push(frame.fixedSteps));
    await engine.init();
    await engine.step(0.5);

    expect(order).toEqual(["tasks-phase", "queued-task", "fixed", "fixed", "update"]);
    expect(frames).toEqual([2]);
    expect(engine.diagnostics.snapshot().metrics.find((metric) => metric.name === "frames")?.value).toBe(1);
    await engine.dispose();
  });
});
