import { describe, expect, it } from "vitest";
import { createGameImpl } from "../../../packages/game/src/createGame";
import { awaitFirstPresentedDraw, drawCallsOf } from "../../../packages/game/src/session/presented";
import { lights, primitives, scene } from "../../../packages/engine/src";

const testScene = () =>
  scene()
    .add(primitives.box({ name: "ready-beacon probe" }))
    .add(lights.studio());

/** Settle microtasks (firstPresentedFrame waiters resolve via queueMicrotask). */
const settle = async (rounds = 4) => {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
};

describe("awaitFirstPresentedDraw (T0-30, #54)", () => {
  it("re-arms until a presented frame reports drawCalls > 0", async () => {
    const resolutions: Array<() => void> = [];
    const source = {
      calls: 0,
      firstPresentedFrame(): Promise<number> {
        this.calls += 1;
        return new Promise<number>((resolve) => resolutions.push(() => resolve(this.calls)));
      }
    };
    let drawCalls = 0;
    const gate = awaitFirstPresentedDraw(source, () => drawCalls);
    await settle();
    expect(source.calls).toBe(1);
    // First presented frame drew nothing → the gate re-arms instead of passing.
    resolutions.shift()!();
    await settle();
    expect(source.calls).toBe(2);
    drawCalls = 4;
    resolutions.shift()!();
    await expect(gate).resolves.toBe(2);
  });

  it("passes immediately when drawCalls is already > 0", async () => {
    let calls = 0;
    const source = {
      firstPresentedFrame(): Promise<number> {
        calls += 1;
        return Promise.resolve(9);
      }
    };
    await expect(awaitFirstPresentedDraw(source, () => 7)).resolves.toBe(-1);
    expect(calls).toBe(0);
  });

  it("drawCallsOf tolerates missing/throwing diagnostics", () => {
    expect(drawCallsOf({})).toBe(0);
    expect(drawCallsOf({ diagnostics: () => ({ drawCalls: Number.NaN }) })).toBe(0);
    expect(drawCallsOf({ diagnostics: () => { throw new Error("gone"); } })).toBe(0);
    expect(drawCallsOf({ diagnostics: () => ({ drawCalls: 3 }) })).toBe(3);
  });
});

describe("game.ready() beacon gating (T0-30, #54)", () => {
  it("reaches playing only after a presented frame with drawCalls > 0", async () => {
    const game = createGameImpl({
      id: "ready-beacon",
      target: null,
      autoStart: false,
      scene: () => testScene()
    });
    try {
      game.start();
      const ready = game.ready();
      await settle();
      // app.ready() resolved but nothing presented yet → still pre-playing.
      expect(game.session.state).toBe("loading");

      // A presented frame that drew nothing must not flip the session.
      game.runtime.step(1 / 60);
      await settle();
      expect(game.session.state).toBe("loading");

      // Simulate a submitted draw (node/headless reports drawCalls 0), then a
      // presented frame — only now may the session reach `playing`.
      const app = game.app as { diagnostics: () => { drawCalls: number } };
      const realDiagnostics = app.diagnostics.bind(app);
      app.diagnostics = () => ({ ...realDiagnostics(), drawCalls: 5 });
      game.runtime.step(1 / 60);
      await ready;
      expect(game.session.state).toBe("playing");
    } finally {
      await game.dispose();
    }
  });

  it("already-drawn app: ready() resolves without another presented frame", async () => {
    const game = createGameImpl({
      id: "ready-beacon-2",
      target: null,
      autoStart: false,
      scene: () => testScene()
    });
    try {
      const app = game.app as { diagnostics: () => { drawCalls: number } };
      app.diagnostics = () => ({ drawCalls: 2 });
      game.start();
      await game.ready();
      expect(game.session.state).toBe("playing");
    } finally {
      await game.dispose();
    }
  });
});
