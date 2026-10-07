import { describe, expect, it } from "vitest";
import { createGameApp, lights, primitives, scene, game } from "../../../packages/engine/src";
import { StubTimeController } from "../../../packages/engine/src/contracts/time";

const runtimeScene = () =>
  scene()
    .add(primitives.box({ name: "prd09 runtime probe" }).runtime(game.runtimeNode("probe")))
    .add(lights.studio());

function pendingProbe(promise: Promise<number>, ms = 30): Promise<"resolved" | "pending"> {
  let settled = false;
  void promise.then(() => { settled = true; });
  return new Promise((resolve) => setTimeout(() => resolve(settled ? "resolved" : "pending"), ms));
}

describe("GameAppRuntime time seam (PRD-09)", () => {
  it("setTimeScale clamps to [0,4], throws on NaN, and backs timeScale", () => {
    const runtime = createGameApp(null, { autoStart: false, scene: runtimeScene() });
    runtime.setTimeScale(0.5);
    expect(runtime.timeScale).toBe(0.5);
    runtime.setTimeScale(9);
    expect(runtime.timeScale).toBe(4);
    runtime.setTimeScale(-2);
    expect(runtime.timeScale).toBe(0);
    expect(() => runtime.setTimeScale(Number.NaN)).toThrow(/AURA_GAME_TIMESCALE_NAN/);
    runtime.dispose();
  });

  it("writes through to a mounted C-23 app.time controller", () => {
    const runtime = createGameApp(null, { autoStart: false, scene: runtimeScene() });
    const controller = new StubTimeController();
    (runtime.app as { time?: StubTimeController }).time = controller;
    runtime.setTimeScale(0.25);
    expect(controller.scale).toBe(0.25);
    expect(runtime.timeScale).toBe(0.25);
    runtime.dispose();
  });

  it("firstPresentedFrame does not resolve on advance() but resolves once after step()", async () => {
    const runtime = createGameApp(null, { autoStart: false, scene: runtimeScene() });
    runtime.start();
    const first = runtime.firstPresentedFrame();
    // advance() simulates without presenting — the promise must stay pending.
    runtime.app.advance(1 / 60);
    expect(await pendingProbe(first)).toBe("pending");
    runtime.step(1 / 60);
    await expect(first).resolves.toBe(2);
    runtime.dispose();
  });

  it("re-arms: a fresh firstPresentedFrame() call resolves on the next presented frame", async () => {
    const runtime = createGameApp(null, { autoStart: false, scene: runtimeScene() });
    runtime.start();
    runtime.step(1 / 60);
    const first = runtime.firstPresentedFrame();
    runtime.step(1 / 60);
    await expect(first).resolves.toBe(2);
    const second = runtime.firstPresentedFrame();
    expect(await pendingProbe(second)).toBe("pending");
    runtime.step(1 / 60);
    await expect(second).resolves.toBe(3);
    runtime.dispose();
  });
});
