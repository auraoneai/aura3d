import { describe, expect, it } from "vitest";
import {
  createAuraApp,
  createGameApp,
  createGameAppRuntime,
  game,
  lights,
  primitives,
  scene
} from "../../../packages/engine/src";

class CountingEventTarget implements EventTarget {
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  addEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void {
    if (!callback) return;
    const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void {
    if (!callback) return;
    this.listeners.get(type)?.delete(callback);
  }

  dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    }
    return true;
  }

  emit(type: string, init: Record<string, unknown>): void {
    this.dispatchEvent({ type, ...init } as Event);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

const runtimeScene = () =>
  scene()
    .add(
      primitives
        .box({ name: "game runtime player" })
        .position(0, 0.5, 0)
        .runtime(game.runtimeNode("player", { tags: ["fighter"] }))
    )
    .add(lights.studio());

describe("createGameApp", () => {
  it("owns start, pause, resume, step, resize, dispose, and evidence", () => {
    const runtime = createGameApp(null, {
      autoStart: false,
      loop: { fixedDt: 1 / 30 },
      scene: runtimeScene(),
      input: {
        actions: {
          moveLeft: ["KeyA"],
          moveRight: ["KeyD"]
        },
        axes: {
          moveX: { negative: "moveLeft", positive: "moveRight" }
        },
        autoListen: false
      }
    });
    const frames: Array<{ readonly frame: number; readonly fixedDt: number; readonly paused: boolean; readonly source: string }> = [];

    runtime.onFrame((frame) => {
      frames.push({
        frame: frame.frame,
        fixedDt: frame.fixedDt,
        paused: frame.paused,
        source: frame.source
      });
      runtime.app.nodes.require("player").translate(runtime.input?.axis("moveX") ?? 0, 0, 0);
    });

    expect(runtime.evidence).toMatchObject({
      kind: "aura-game-app-runtime-evidence",
      status: "idle",
      started: false,
      frame: 0,
      startCount: 0,
      activeInputControllers: 1
    });

    runtime.input?.press("KeyD");
    expect(runtime.start()).toMatchObject({ status: "running", started: true, startCount: 1 });
    expect(runtime.app.runtime.paused).toBe(false);

    const stepEvidence = runtime.step(1 / 30);

    expect(stepEvidence).toMatchObject({ status: "running", frame: 1, stepCount: 1 });
    expect(frames).toEqual([{ frame: 1, fixedDt: 1 / 30, paused: false, source: "manual" }]);
    expect(runtime.input?.pressed("moveRight")).toBe(true);
    expect(runtime.input?.axis("moveX")).toBe(1);
    expect(runtime.app.nodes.require("player").position).toEqual([1, 0.5, 0]);

    expect(runtime.pause()).toMatchObject({ status: "paused", pauseCount: 1 });
    expect(runtime.app.runtime.paused).toBe(true);
    runtime.step(1 / 30);
    expect(frames.at(-1)).toMatchObject({ frame: 2, paused: true, source: "manual" });

    expect(runtime.resume()).toMatchObject({ status: "running", resumeCount: 1 });
    expect(runtime.resize(640, 360, 2)).toMatchObject({
      resizeCount: 1,
      lastResize: { width: 640, height: 360, pixelRatio: 2 }
    });

    const input = runtime.input;
    const disposeEvidence = runtime.dispose();

    expect(disposeEvidence).toMatchObject({
      status: "disposed",
      disposed: true,
      disposeCount: 1,
      activeInputControllers: 0
    });
    expect(input?.held("moveRight")).toBe(false);
    expect(() => runtime.start()).toThrow(/after dispose/);
  });

  it("keeps start and resume idempotent so duplicate loops are not created", () => {
    const runtime = createGameAppRuntime(
      createAuraApp(null, {
        autoStart: false,
        scene: runtimeScene()
      }),
      { autoStart: false }
    );
    let frameCount = 0;
    runtime.onFrame(() => {
      frameCount += 1;
    });

    runtime.start();
    runtime.start();
    runtime.step(1 / 60);
    runtime.pause();
    runtime.resume();
    runtime.resume();
    runtime.step(1 / 60);

    expect(frameCount).toBe(2);
    expect(runtime.evidence).toMatchObject({
      status: "running",
      startCount: 1,
      pauseCount: 1,
      resumeCount: 1,
      stepCount: 2
    });

    runtime.dispose();
  });

  it("supports offFrame and idempotent dispose without advancing removed callbacks", () => {
    const runtime = createGameApp(null, {
      autoStart: false,
      scene: runtimeScene()
    });
    let keptFrames = 0;
    let removedFrames = 0;
    const removedCallback = () => {
      removedFrames += 1;
    };

    runtime.onFrame(() => {
      keptFrames += 1;
    });
    runtime.onFrame(removedCallback);
    runtime.offFrame(removedCallback);

    runtime.start();
    runtime.step(1 / 60);

    expect(keptFrames).toBe(1);
    expect(removedFrames).toBe(0);
    expect(runtime.evidence).toMatchObject({
      status: "running",
      loop: {
        callbackCount: 1
      }
    });

    const firstDispose = runtime.dispose();
    const secondDispose = runtime.dispose();

    expect(firstDispose.disposeCount).toBe(1);
    expect(secondDispose.disposeCount).toBe(1);
    expect(secondDispose).toMatchObject({
      status: "disposed",
      disposed: true,
      activeInputControllers: 0
    });
  });

  it("disposes owned input listeners and clears held input state", () => {
    const target = new CountingEventTarget();
    const runtime = createGameApp(null, {
      autoStart: false,
      scene: runtimeScene(),
      input: {
        actions: {
          light: ["KeyJ"]
        },
        target,
        autoListen: true
      }
    });
    const input = runtime.input;

    expect(target.listenerCount("keydown")).toBe(1);
    expect(target.listenerCount("keyup")).toBe(1);

    target.emit("keydown", { code: "KeyJ", key: "j", repeat: false });
    runtime.step(1 / 60);

    expect(input?.pressed("light")).toBe(true);
    expect(input?.held("light")).toBe(true);

    runtime.dispose();

    expect(target.listenerCount("keydown")).toBe(0);
    expect(target.listenerCount("keyup")).toBe(0);
    expect(input?.held("light")).toBe(false);

    target.emit("keydown", { code: "KeyJ", key: "j", repeat: false });
    input?.update(1 / 60);
    expect(input?.held("light")).toBe(false);
  });
});
