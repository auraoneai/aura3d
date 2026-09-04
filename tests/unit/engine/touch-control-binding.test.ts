import { describe, expect, it } from "vitest";
import {
  bindGameTouchControls,
  bindGameTouchLayoutPreset,
  touchLayoutBindingsForGenre,
  type TouchControlElement,
  type TouchControlHost
} from "../../../packages/engine/src/agent-api/TouchControlBinding";
import { createTouchLayoutPreset, type TouchLayoutGenre } from "../../../packages/input/src/index";

/**
 * Reusable on-screen control binding, extracted after the replicability metric's repeated-cluster detector
 * found `bindHoldControl` + `pulseKey` duplicated **byte-for-byte** between Skyline Runner and Turbo Drift
 * Circuit. Two routes had independently authored the same 13 lines; a third would have copied them again.
 *
 * ## Why a fake host rather than jsdom
 *
 * This repository's unit suite runs in plain Node with no DOM emulator, deliberately: browser behaviour is
 * proven in Playwright against a real browser. So the module accepts an injectable `TouchControlHost` and these
 * tests drive it directly. That keeps the *binding logic* -- press/release pairing, idempotence, teardown,
 * timer cleanup -- under fast coverage without a shim pretending to be a browser.
 */
interface Recorded { readonly type: string; readonly code: string }

function createHost(ids: readonly string[]) {
  const listeners = new Map<string, Map<string, Set<() => void>>>();
  const keys: Recorded[] = [];
  const timers = new Map<number, { callback: () => void; dueAt: number }>();
  let nextTimer = 1;
  let now = 0;

  for (const id of ids) listeners.set(id, new Map());

  const element = (id: string): TouchControlElement => ({
    addEventListener: (type, listener) => {
      const byType = listeners.get(id)!;
      if (!byType.has(type)) byType.set(type, new Set());
      byType.get(type)!.add(listener);
    },
    removeEventListener: (type, listener) => {
      listeners.get(id)?.get(type)?.delete(listener);
    }
  });

  const host: TouchControlHost = {
    getElementById: (id) => (listeners.has(id) ? element(id) : null),
    dispatchKey: (code, type) => { keys.push({ type, code }); },
    setTimer: (callback, delayMs) => {
      const handle = nextTimer++;
      timers.set(handle, { callback, dueAt: now + delayMs });
      return handle;
    },
    clearTimer: (handle) => { timers.delete(handle as number); }
  };

  return {
    host,
    keys,
    /** Fire an event on an element, as a browser would. */
    fire(id: string, type: string): void {
      for (const listener of [...(listeners.get(id)?.get(type) ?? [])]) listener();
    },
    /** Advance virtual time, running any timers that come due. */
    advance(ms: number): void {
      now += ms;
      for (const [handle, timer] of [...timers]) {
        if (timer.dueAt <= now) { timers.delete(handle); timer.callback(); }
      }
    },
    pendingTimers: () => timers.size,
    listenerCount: (id: string, type: string) => listeners.get(id)?.get(type)?.size ?? 0
  };
}

describe("bindGameTouchControls", () => {
  it("holds a key down while pressed and releases it on pointerup", () => {
    const dom = createHost(["left"]);
    bindGameTouchControls({ hold: [{ elementId: "left", code: "KeyA" }], host: dom.host });
    dom.fire("left", "pointerdown");
    expect(dom.keys).toEqual([{ type: "keydown", code: "KeyA" }]);
    dom.fire("left", "pointerup");
    expect(dom.keys).toEqual([{ type: "keydown", code: "KeyA" }, { type: "keyup", code: "KeyA" }]);
  });

  it.each(["pointerup", "pointercancel", "pointerleave"])("releases on %s so a key cannot latch on", (releaseEvent) => {
    /*
     * All three matter: a finger sliding off a button fires `pointerleave` without `pointerup`, and the OS can
     * fire `pointercancel` on an incoming call. Missing any one leaves the car accelerating forever.
     */
    const dom = createHost(["go"]);
    bindGameTouchControls({ hold: [{ elementId: "go", code: "KeyW" }], host: dom.host });
    dom.fire("go", "pointerdown");
    dom.fire("go", releaseEvent);
    expect(dom.keys.filter((event) => event.type === "keyup")).toEqual([{ type: "keyup", code: "KeyW" }]);
  });

  it("fires a bounded press-and-release for a pulse control", () => {
    const dom = createHost(["jump"]);
    bindGameTouchControls({ pulse: [{ elementId: "jump", code: "Space" }], host: dom.host });
    dom.fire("jump", "click");
    expect(dom.keys).toEqual([{ type: "keydown", code: "Space" }]);
    dom.advance(40);
    expect(dom.keys).toEqual([{ type: "keydown", code: "Space" }, { type: "keyup", code: "Space" }]);
  });

  it("honours a custom pulse hold duration", () => {
    const dom = createHost(["reset"]);
    bindGameTouchControls({ pulse: [{ elementId: "reset", code: "KeyR", holdMs: 200 }], host: dom.host });
    dom.fire("reset", "click");
    dom.advance(40);
    expect(dom.keys.filter((event) => event.type === "keyup"), "must not release early").toEqual([]);
    dom.advance(160);
    expect(dom.keys.filter((event) => event.type === "keyup")).toHaveLength(1);
  });

  it("reports missing elements instead of failing silently", () => {
    /*
     * The duplicated version returned early on a missing element, so a typo'd id produced a dead button with no
     * signal anywhere. A route can now assert its own control contract.
     */
    const dom = createHost(["present"]);
    const result = bindGameTouchControls({
      hold: [{ elementId: "present", code: "KeyA" }, { elementId: "typo", code: "KeyD" }],
      host: dom.host
    });
    expect(result.bound).toEqual(["present"]);
    expect(result.missing).toEqual(["typo"]);
  });

  it("replaces a previous binding rather than stacking listeners", () => {
    /*
     * A real hazard in the duplicated version: a route that re-runs panel setup after a reset attaches a second
     * listener and dispatches two keydowns per press, double-applying input.
     */
    const dom = createHost(["left"]);
    bindGameTouchControls({ hold: [{ elementId: "left", code: "KeyA" }], host: dom.host });
    bindGameTouchControls({ hold: [{ elementId: "left", code: "KeyA" }], host: dom.host });
    expect(dom.listenerCount("left", "pointerdown"), "one press listener").toBe(1);
    dom.fire("left", "pointerdown");
    expect(dom.keys.filter((event) => event.type === "keydown")).toHaveLength(1);
  });

  it("releases a held key on dispose so teardown mid-press cannot stick", () => {
    const dom = createHost(["go"]);
    const result = bindGameTouchControls({ hold: [{ elementId: "go", code: "KeyW" }], host: dom.host });
    dom.fire("go", "pointerdown");
    dom.keys.length = 0;
    result.dispose();
    expect(dom.keys).toEqual([{ type: "keyup", code: "KeyW" }]);
    dom.fire("go", "pointerdown");
    expect(dom.keys.filter((event) => event.type === "keydown")).toEqual([]);
  });

  it("clears pending pulse timers on dispose", () => {
    const dom = createHost(["jump"]);
    const result = bindGameTouchControls({ pulse: [{ elementId: "jump", code: "Space" }], host: dom.host });
    dom.fire("jump", "click");
    result.dispose();
    expect(dom.pendingTimers(), "no timer may outlive dispose").toBe(0);
    dom.keys.length = 0;
    dom.advance(200);
    expect(dom.keys, "a disposed control must not dispatch later").toEqual([]);
  });

  it("binds nothing and throws nothing for an empty spec", () => {
    const dom = createHost([]);
    const result = bindGameTouchControls({ host: dom.host });
    expect(result.bound).toEqual([]);
    expect(result.missing).toEqual([]);
  });
});

describe("genre touch-layout presets (I2)", () => {
  it("engine button maps match the input-package presets per genre", () => {
    const genres: readonly TouchLayoutGenre[] = ["fight", "race", "platform"];
    for (const genre of genres) {
      const engine = touchLayoutBindingsForGenre(genre);
      const input = createTouchLayoutPreset(genre);
      const enginePairs = [...engine.hold, ...engine.pulse].map((binding) => `${binding.elementId}=${binding.code}`).sort();
      const inputPairs = [...input.hold, ...input.pulse].map((binding) => `${binding.elementId}=${binding.code}`).sort();
      expect(enginePairs, genre).toEqual(inputPairs);
    }
  });

  it("bindGameTouchLayoutPreset binds genre buttons through the hold/pulse path", () => {
    const bindings = touchLayoutBindingsForGenre("platform", "t2-platform");
    const ids = [...bindings.hold, ...bindings.pulse].map((binding) => binding.elementId);
    const dom = createHost(ids);
    const result = bindGameTouchLayoutPreset({ genre: "platform", elementIdPrefix: "t2-platform", host: dom.host });
    expect(result.missing).toEqual([]);
    expect([...result.bound].sort()).toEqual([...ids].sort());

    dom.fire("t2-platform:left", "pointerdown");
    expect(dom.keys).toContainEqual({ type: "keydown", code: "ArrowLeft" });
    dom.fire("t2-platform:left", "pointerup");
    expect(dom.keys).toContainEqual({ type: "keyup", code: "ArrowLeft" });

    dom.fire("t2-platform:jump", "click");
    expect(dom.keys).toContainEqual({ type: "keydown", code: "Space" });
    dom.advance(40);
    expect(dom.keys).toContainEqual({ type: "keyup", code: "Space" });
    result.dispose();
  });
});

describe("both game routes consume the reusable binding", () => {
  /**
   * The point of the extraction. If a route re-authors its own version the duplication returns and the
   * repeated-cluster metric silently climbs again.
   */
  it.each([
    ["apps/showcase-skyline-runner/src/main.ts"],
    ["apps/showcase-turbo-drift-circuit/src/main.ts"]
  ])("%s declares controls instead of wiring them", async (path) => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(path, "utf8");
    expect(source).toContain("bindGameTouchControls({");
    expect(source, "local bindHoldControl must be removed").not.toContain("function bindHoldControl");
    expect(source, "local pulseKey must be removed").not.toContain("function pulseKey");
  });
});
