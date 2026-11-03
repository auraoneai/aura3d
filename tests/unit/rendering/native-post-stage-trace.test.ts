import { describe, expect, it } from "vitest";
import { PostStageTrace } from "../../../packages/rendering/src/renderer/PostStageTrace";

describe("post-stage trace", () => {
  it("captures actual stages, propagates failures and discards late work from older frames", async () => {
    let clock = 0;
    let draws = 0;
    const trace = new PostStageTrace(() => clock);
    const first = trace.beginFrame(1);
    first.measure({ name: "bloom", reads: ["scene"], writes: ["bloom"], readDrawCalls: () => draws }, () => {
      clock = 2.5;
      draws = 2;
    });
    expect(() => first.measure({ name: "blur", reads: ["bloom"], writes: ["color"] }, () => { throw new Error("broken shader"); })).toThrow("broken shader");
    expect(trace.snapshot()?.passes).toMatchObject([
      { name: "bloom", drawCalls: 2, cpuTimeMs: 2.5, gpuTimeMs: null, status: "completed" },
      { name: "blur", drawCalls: null, status: "failed" }
    ]);
    let finishAsync!: () => void;
    const late = first.measureAsync({ name: "late", reads: [], writes: [] }, () => new Promise<void>((resolve) => { finishAsync = resolve; }));
    const second = trace.beginFrame(2);
    finishAsync();
    await late;
    second.measure({ name: "overlay", reads: ["color"], writes: ["screen"] }, () => {});
    second.finish();
    expect(trace.snapshot()).toMatchObject({ frameNumber: 2, complete: true, passes: [{ name: "overlay" }] });
    expect(first.snapshot().complete).toBe(false);
    trace.dispose();
    expect(trace.snapshot()).toBeNull();
    expect(() => trace.beginFrame(3)).toThrow(/disposed/);
  });

  it("isolates simultaneous renderer sessions and reports missing resource telemetry as partial", () => {
    const first = new PostStageTrace(() => 1);
    const second = new PostStageTrace(() => 4);
    const firstFrame = first.beginFrame(7);
    const secondFrame = second.beginFrame(7);
    firstFrame.measure({ name: "forward", reads: [], writes: ["scene"] }, () => {});
    secondFrame.measure({ name: "private-post" }, () => {});
    firstFrame.finish();
    secondFrame.finish();
    expect(first.snapshot()).toMatchObject({ complete: true, passes: [{ name: "forward", writes: ["scene"] }] });
    expect(second.snapshot()).toMatchObject({ complete: false, passes: [{ name: "private-post" }] });
    const leaked = first.snapshot()!;
    (leaked.passes[0]!.writes as string[]).push("tampered");
    expect(first.snapshot()?.passes[0]?.writes).toEqual(["scene"]);
    first.dispose();
    expect(second.snapshot()?.passes[0]?.name).toBe("private-post");
    second.dispose();
  });
});
