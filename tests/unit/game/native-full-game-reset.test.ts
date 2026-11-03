import { describe, expect, it, vi } from "vitest";
import { normalizeSceneSnapshot, scene, StubTimeController } from "../../../packages/engine/src";
import { createGameImplWithGameApp, type GameImplementationBindings, type Prd09CreateGameOptions } from "../../../packages/game/src/createGameCore";
import { createTweenEngine } from "../../../packages/game/src/juice/tween";
import { createJuice } from "../../../packages/game/src/juice/Juice";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const bindings: GameImplementationBindings = {
  normalizeSceneSnapshot,
  StubTimeController,
  createGameAudio: (() => { throw new Error("unexpected audio creation"); }) as GameImplementationBindings["createGameAudio"],
  bindFeelSound: (() => { throw new Error("unexpected sound binding"); }) as GameImplementationBindings["bindFeelSound"]
};

function makeGame(options: Pick<Prd09CreateGameOptions<string, string>, "onReset"> = {}) {
  const callbacks = new Set<(frame: { dt: number }) => void>();
  const visible = vi.fn();
  const pool = { setVisible: visible, setInstanceTransforms: vi.fn() };
  const time = new StubTimeController();
  const app = {
    time,
    nodes: { get: (name: string) => name === "a3g-fx-spark" ? pool : undefined },
    camera: { shake: { add() {} }, punch: { trigger() {} }, evidence: () => ({ layers: [] }) },
    setScene: vi.fn(async (_scene: unknown) => {}),
    disposeAsync: vi.fn(async () => {})
  };
  const runtime = {
    app,
    input: undefined,
    evidence: { frame: 0 },
    running: false,
    paused: true,
    start: vi.fn(() => { runtime.running = true; runtime.paused = false; }),
    pause: vi.fn(() => { runtime.running = false; runtime.paused = true; }),
    resume: vi.fn(() => { runtime.running = true; runtime.paused = false; }),
    onFrame: (callback: (frame: { dt: number }) => void) => { callbacks.add(callback); return () => { callbacks.delete(callback); }; },
    firstPresentedFrame: () => new Promise<number>(() => {}),
    dispose: vi.fn(() => { runtime.running = false; runtime.paused = true; callbacks.clear(); })
  };
  const game = createGameImplWithGameApp(() => runtime as never, bindings, {
    id: "native-reset", target: null, autoStart: false, scene: () => scene(), ...options
  });
  const frame = (dt: number) => { for (const cb of [...callbacks]) cb({ dt }); };
  return { game, app, runtime, pool, visible, time, frame };
}

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe("full game reset", () => {
  it("clears owned effects and freezes before restoring application state while the runtime is suspended", async () => {
    const order: string[] = [];
    let h!: ReturnType<typeof makeGame>;
    let restored = 9;
    h = makeGame({ onReset: (game, { signal }) => {
      order.push("restore");
      expect(game).toBe(h.game);
      expect(signal.aborted).toBe(false);
      expect(h.runtime.running).toBe(false);
      expect(game.fx.liveCount).toBe(0);
      expect(game.session.isFrozen("player")).toBe(false);
      restored = 0;
      game.hud.set("score", 0);
    } });
    try {
      h.game.sessionImpl.transition("loading");
      h.game.sessionImpl.transition("playing");
      h.runtime.start();
      h.game.session.hitStop(5, { actors: ["player"] });
      h.game.session.hitStop(3);
      h.game.fx.burst("spark", [0, 0, 0], { count: 2 });
      h.frame(0.01);
      expect(h.game.fx.liveCount).toBeGreaterThan(0);
      const target = { x: 1 };
      const tween = h.game.juice.tween(target, { x: 10 }, { duration: 1 });
      await h.game.reset();
      await tween.done;
      expect(tween.cancelled).toBe(true);
      expect(h.visible).toHaveBeenLastCalledWith(false);
      expect(restored).toBe(0);
      expect(h.game.hud.snapshot().widgets).toEqual([{ id: "score", value: 0, screenFraction: 0 }]);
      expect(h.time.hitStopRemaining).toBe(0); // this game's own global hit-stop was cleared
      expect(h.runtime.pause).toHaveBeenCalledTimes(1);
      expect(h.runtime.resume).toHaveBeenCalledTimes(1);
      expect(h.runtime.running).toBe(true);
      expect(order).toEqual(["restore"]);
    } finally { await h.game.dispose(); }
  });

  it("preserves a pre-existing pause and its later resume ownership", async () => {
    const h = makeGame();
    try {
      h.game.sessionImpl.transition("loading");
      h.game.sessionImpl.transition("playing");
      h.runtime.start();
      h.game.session.pause("visibility");
      expect(h.runtime.running).toBe(false);
      await h.game.reset();
      expect(h.game.session.paused).toBe(true);
      expect(h.game.sessionImpl.pauseReasons).toEqual(["visibility"]);
      expect(h.runtime.resume).not.toHaveBeenCalled();
      h.game.sessionImpl.releasePause("visibility");
      expect(h.runtime.running).toBe(true);
    } finally { await h.game.dispose(); }
  });

  it("clears this game's global stop on reset and disposal without cancelling an app-owned stop", async () => {
    const h = makeGame();
    h.time.hitStop(4);
    h.game.session.hitStop(8);
    expect(h.time.hitStopRemaining).toBe(8);
    await h.game.reset();
    expect(h.time.hitStopRemaining).toBe(4);
    h.game.juice.hitStop(10);
    expect(h.time.hitStopRemaining).toBe(10);
    await h.game.dispose();
    expect(h.time.hitStopRemaining).toBe(4);
    expect(h.time.advance(1)).toBe(0);
    expect(h.time.hitStopRemaining).toBe(3);
  });

  it("holds a pause requested during asynchronous reset until the owner releases it", async () => {
    const gate = deferred<void>();
    const entered = deferred<void>();
    const h = makeGame({ onReset: async () => { entered.resolve(); await gate.promise; } });
    try {
      h.game.sessionImpl.transition("loading");
      h.game.sessionImpl.transition("playing");
      h.runtime.start();
      const reset = h.game.reset();
      await entered.promise;
      h.game.session.pause("user");
      gate.resolve();
      await reset;
      expect(h.runtime.running).toBe(false);
      expect(h.game.session.paused).toBe(true);
      h.game.session.resume();
      expect(h.runtime.running).toBe(true);
      expect(h.runtime.resume).toHaveBeenCalledTimes(1);
    } finally { await h.game.dispose(); }
  });

  it("does not resume mid-reset when a pause is both acquired and released by the callback", async () => {
    const gate = deferred<void>();
    const entered = deferred<void>();
    const h = makeGame({ onReset: async (game) => {
      game.session.pause("user");
      game.session.resume();
      entered.resolve();
      await gate.promise;
    } });
    try {
      h.game.sessionImpl.transition("loading");
      h.game.sessionImpl.transition("playing");
      h.runtime.start();
      const reset = h.game.reset();
      await entered.promise;
      expect(h.runtime.running).toBe(false);
      gate.resolve();
      await reset;
      expect(h.runtime.running).toBe(true);
      expect(h.runtime.resume).toHaveBeenCalledTimes(1);
    } finally { await h.game.dispose(); }
  });

  it("defers releasing a pre-existing pause until the reset callback finishes", async () => {
    const gate = deferred<void>();
    const entered = deferred<void>();
    const h = makeGame({ onReset: async (game) => {
      game.session.resume();
      entered.resolve();
      await gate.promise;
    } });
    try {
      h.game.sessionImpl.transition("loading");
      h.game.sessionImpl.transition("playing");
      h.runtime.start();
      h.game.session.pause("user");
      const reset = h.game.reset();
      await entered.promise;
      expect(h.runtime.running).toBe(false);
      expect(h.runtime.resume).not.toHaveBeenCalled();
      gate.resolve();
      await reset;
      expect(h.runtime.running).toBe(true);
      expect(h.runtime.resume).toHaveBeenCalledTimes(1);
    } finally { await h.game.dispose(); }
  });

  it("retains the original running state when a reset callback replaces the pause reason", async () => {
    const h = makeGame({ onReset: (game) => {
      game.session.resume();
      game.session.pause("visibility");
    } });
    try {
      h.game.sessionImpl.transition("loading");
      h.game.sessionImpl.transition("playing");
      h.runtime.start();
      h.game.session.pause("user");
      await h.game.reset();
      expect(h.runtime.running).toBe(false);
      expect(h.game.sessionImpl.pauseReasons).toEqual(["visibility"]);
      h.game.sessionImpl.releasePause("visibility");
      expect(h.runtime.running).toBe(true);
    } finally { await h.game.dispose(); }
  });

  it("rejects overlapping resets and aborts the restore callback on disposal", async () => {
    const entered = deferred<AbortSignal>();
    const done = deferred<void>();
    const h = makeGame({ onReset: async (_game, { signal }) => { entered.resolve(signal); await done.promise; } });
    h.runtime.start();
    const first = h.game.reset();
    const signal = await entered.promise;
    await expect(h.game.reset()).rejects.toThrow(/GAME_RESET_IN_PROGRESS_V1/);
    const result = expect(first).rejects.toThrow(/GAME_DISPOSED_V1/);
    await h.game.dispose();
    await result;
    expect(signal.aborted).toBe(true);
    done.resolve();
    await flush();
    expect(h.runtime.resume).not.toHaveBeenCalled();
    await expect(h.game.reset()).rejects.toThrow(/GAME_DISPOSED_V1/);
  });

  it("waits for an existing scene update and lets the callback apply a transition-free scene", async () => {
    const changing = deferred<void>();
    const h = makeGame({ onReset: async (game) => { await game.setScene(scene() as never); } });
    h.app.setScene.mockImplementationOnce(() => changing.promise);
    try {
      const change = h.game.setScene(scene() as never);
      const reset = h.game.reset();
      await flush();
      expect(h.app.setScene).toHaveBeenCalledTimes(1);
      changing.resolve();
      await change;
      await reset;
      expect(h.app.setScene).toHaveBeenCalledTimes(2);
    } finally { await h.game.dispose(); }
  });

  it("propagates restore failures, retains committed cleanup and permits a retry", async () => {
    let fail = true;
    const h = makeGame({ onReset: () => { if (fail) throw new Error("restore failed"); } });
    try {
      h.runtime.start();
      h.game.session.hitStop(2, { actors: ["player"] });
      await expect(h.game.reset()).rejects.toThrow("restore failed");
      expect(h.game.session.isFrozen("player")).toBe(false);
      expect(h.runtime.running).toBe(true);
      fail = false;
      await expect(h.game.reset()).resolves.toBeUndefined();
    } finally { await h.game.dispose(); }
  });

  it("does not resurrect a cancelled squash tween or let an old handle cancel a reused slot", async () => {
    const h = makeGame();
    try {
      const node = {
        position: [0, 0, 0] as const, rotation: [0, 0, 0] as const,
        scale: [1, 1, 1] as [number, number, number],
        setPosition() {}, setRotation() {}, setScale(value: number | readonly [number, number, number]) {
          this.scale = typeof value === "number" ? [value, value, value] : [...value];
        }
      };
      const squash = h.game.juice.squash(node, { ms: 100 });
      h.frame(0.02);
      await h.game.reset();
      await squash.done;
      const scaleAfterReset = [...node.scale];
      h.frame(0.2);
      expect(node.scale).toEqual(scaleAfterReset);

      const engine = createTweenEngine();
      const a = { value: 0 };
      const old = engine.tween(a, { value: 1 }, { duration: 1 });
      old.finish();
      const b = { value: 0 };
      const current = engine.tween(b, { value: 2 }, { duration: 1 });
      old.cancel();
      engine.tick(1);
      await current.done;
      expect(b.value).toBe(2);
      expect(current.cancelled).toBe(false);
    } finally { await h.game.dispose(); }
  });

  it("does not schedule a return tween after cancellation between completion and the promise continuation", async () => {
    const tweens = createTweenEngine();
    const juice = createJuice({
      events: {},
      camera: { shake: { add() {} }, punch: { trigger() {} }, evidence: () => ({ layers: [] }) },
      session: { reducedMotion: false, reducedFlash: false, hitStop() {}, slowMo() {} },
      fx: { burst() {}, liveCount: 0, backend: "primitive-pool" },
      overlay: { flash() {}, vignette() {}, fade: async () => {}, backend: "none" },
      tweens
    });
    const node = {
      position: [0, 0, 0] as const, rotation: [0, 0, 0] as const,
      scale: [1, 1, 1] as [number, number, number],
      setPosition() {}, setRotation() {}, setScale(value: number | readonly [number, number, number]) {
        this.scale = typeof value === "number" ? [value, value, value] : [...value];
      }
    };
    juice.squash(node).finish();
    tweens.cancelAll();
    await flush();
    expect(tweens.activeCount).toBe(0);
  });
});
