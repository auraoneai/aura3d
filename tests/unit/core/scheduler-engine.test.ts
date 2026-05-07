import { describe, expect, it } from "vitest";
import { Engine, LifecycleError, Scheduler, SystemPhase, ValidationError } from "@galileo3d/core";

describe("core scheduler and engine lifecycle", () => {
  it("orders tasks by declared dependencies without hardcoded priorities", () => {
    const scheduler = new Scheduler();
    scheduler.add({ id: "c", phase: SystemPhase.Update, dependsOn: ["b"], run: () => undefined });
    scheduler.add({ id: "a", phase: SystemPhase.Update, run: () => undefined });
    scheduler.add({ id: "b", phase: SystemPhase.Update, dependsOn: ["a"], run: () => undefined });
    expect(scheduler.getExecutionPlan().map((task) => task.id)).toEqual(["a", "b", "c"]);
  });

  it("rejects duplicate tasks, missing dependencies, cross-phase dependencies, and cycles", () => {
    const duplicate = new Scheduler();
    duplicate.add({ id: "a", phase: SystemPhase.Update, run: () => undefined });
    expect(() => duplicate.add({ id: "a", phase: SystemPhase.Update, run: () => undefined })).toThrow(ValidationError);

    const missing = new Scheduler();
    missing.add({ id: "a", phase: SystemPhase.Update, dependsOn: ["missing"], run: () => undefined });
    expect(() => missing.getExecutionPlan()).toThrow(/missing/i);

    const crossPhase = new Scheduler();
    crossPhase.add({ id: "fixed", phase: SystemPhase.Fixed, run: () => undefined });
    crossPhase.add({ id: "update", phase: SystemPhase.Update, dependsOn: ["fixed"], run: () => undefined });
    expect(() => crossPhase.getExecutionPlan()).toThrow(/different phase/i);

    const cycle = new Scheduler();
    cycle.add({ id: "a", phase: SystemPhase.Update, dependsOn: ["c"], run: () => undefined });
    cycle.add({ id: "b", phase: SystemPhase.Update, dependsOn: ["a"], run: () => undefined });
    cycle.add({ id: "c", phase: SystemPhase.Update, dependsOn: ["b"], run: () => undefined });
    expect(() => cycle.getExecutionPlan()).toThrow(/cycle/i);
  });

  it("enforces lifecycle transitions and plugin order", async () => {
    const engine = new Engine();
    const order: string[] = [];
    engine.use({ id: "first", init: () => { order.push("first"); }, dispose: () => { order.push("dispose-first"); } });
    engine.use({ id: "second", init: () => { order.push("second"); }, dispose: () => { order.push("dispose-second"); } });

    expect(() => engine.start()).toThrow(LifecycleError);
    await engine.init();
    expect(order).toEqual(["first", "second"]);
    expect(engine.state).toBe("initialized");
    engine.start();
    expect(engine.state).toBe("running");
    engine.stop();
    expect(engine.state).toBe("stopped");
    await engine.dispose();
    expect(order).toEqual(["first", "second", "dispose-second", "dispose-first"]);
    expect(engine.state).toBe("disposed");
  });

  it("rolls back initialized plugins after plugin failure", async () => {
    const engine = new Engine();
    const order: string[] = [];
    engine.use({ id: "ok", init: () => { order.push("ok"); }, dispose: () => { order.push("dispose-ok"); } });
    engine.use({ id: "bad", init: () => { throw new Error("boom"); } });
    await expect(engine.init()).rejects.toThrow(/boom/);
    expect(order).toEqual(["ok", "dispose-ok"]);
    expect(engine.state).toBe("failed");
  });

  it("manual engine stepping is deterministic and phase ordered", async () => {
    const run = async () => {
      const engine = new Engine({ fixedDelta: 0.5, maxDelta: 2, maxFixedSteps: 5 });
      const order: string[] = [];
      engine.scheduler.add({ id: "fixed", phase: SystemPhase.Fixed, run: (context) => { order.push(`fixed:${context.fixedStepIndex}`); } });
      engine.scheduler.add({ id: "update", phase: SystemPhase.Update, run: () => { order.push("update"); } });
      await engine.init();
      await engine.step(1.1);
      await engine.dispose();
      return order;
    };

    expect(await run()).toEqual(["fixed:0", "fixed:1", "update"]);
    expect(await run()).toEqual(["fixed:0", "fixed:1", "update"]);
  });
});
