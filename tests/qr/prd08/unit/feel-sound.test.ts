/**
 * 08-S18 / A-3: `bindFeelSound(app, sound)` — once bound, the audio
 * listener tracks the *presented* camera pose: `sound.setListener` is
 * called exactly once per presented frame with position, normalised
 * forward (target - position), and up from `camera.presented()`.
 */
import { describe, expect, it } from "vitest";
import { bindFeelSound } from "../../../../packages/engine/src/agent-api/feel/bindFeelSound.js";

interface Call {
  position: readonly number[];
  forward: readonly number[];
  up: readonly number[];
}

function makeApp(pose: {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
}) {
  const cbs: ((f: { dt: number }) => void)[] = [];
  const app = {
    camera: { presented: () => pose },
    onFrame(cb: (f: { dt: number }) => void) {
      cbs.push(cb);
      return () => {
        const i = cbs.indexOf(cb);
        if (i >= 0) cbs.splice(i, 1);
      };
    },
    frame(dt: number) {
      for (const cb of [...cbs]) cb({ dt });
    },
    cbCount: () => cbs.length
  };
  return app;
}

describe("S-18 bindFeelSound: listener tracks presented pose (A-3)", () => {
  it("setListener is called exactly once per presented frame", () => {
    const app = makeApp({ position: [1, 2, 3], target: [1, 2, 0], up: [0, 1, 0] });
    const calls: Call[] = [];
    bindFeelSound(app as never, { setListener: (o: Call) => calls.push(o) });
    app.frame(1 / 60);
    app.frame(1 / 60);
    app.frame(1 / 60);
    expect(calls).toHaveLength(3);
    expect(app.cbCount()).toBe(1);
  });

  it("carries position, normalised forward and up from presented()", () => {
    const app = makeApp({ position: [1, 2, 3], target: [5, 2, 3], up: [0, 1, 0] });
    const calls: Call[] = [];
    bindFeelSound(app as never, { setListener: (o: Call) => calls.push(o) });
    app.frame(0.016);
    const c = calls[0];
    expect(c.position).toEqual([1, 2, 3]);
    expect(c.forward).toEqual([1, 0, 0]);
    expect(c.up).toEqual([0, 1, 0]);
  });

  it("degenerate forward (target == position) falls back to -Z", () => {
    const app = makeApp({ position: [0, 0, 0], target: [0, 0, 0], up: [0, 1, 0] });
    const calls: Call[] = [];
    bindFeelSound(app as never, { setListener: (o: Call) => calls.push(o) });
    app.frame(0.016);
    expect(calls[0].forward).toEqual([0, 0, -1]);
  });

  it("unsubscribe stops the per-frame calls", () => {
    const app = makeApp({ position: [0, 0, 0], target: [0, 0, -5], up: [0, 1, 0] });
    const calls: Call[] = [];
    const unbind = bindFeelSound(app as never, { setListener: (o: Call) => calls.push(o) });
    app.frame(0.016);
    unbind();
    app.frame(0.016);
    expect(calls).toHaveLength(1);
    expect(app.cbCount()).toBe(0);
  });

  it("stub app (no onFrame / no camera.presented) binds a harmless no-op", () => {
    const calls: Call[] = [];
    const unbind = bindFeelSound({} as never, { setListener: (o: Call) => calls.push(o) });
    expect(typeof unbind).toBe("function");
    unbind();
    expect(calls).toHaveLength(0);
  });
});
