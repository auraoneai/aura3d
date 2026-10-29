// J03: the touch router only passes current targets, debounces repeats, treats
// a tap and a parent confirm as the same turn, and binds taps on pointerdown
// with a generous, drag-free hit test.
import { describe, expect, it } from "vitest";
import type { BeatSpec, DirectorEffect, EpisodeSpec } from "../../../src/types.js";
import {
  bindCanvasTaps,
  createTouchRouter,
  DEFAULT_DEBOUNCE_MS,
  generousPick,
  type TapListener,
  type TapPointerEvent,
  type TapSurface
} from "../../../src/runtime/touch-router.js";
import { createEpisodeDirector } from "../../../src/runtime/episode-director.js";

// Compile-time check: a real canvas element is a valid tap surface (no casts).
export function canvasIsTapSurface(canvas: HTMLCanvasElement): TapSurface {
  return canvas;
}

describe("touch router", () => {
  it("routes nothing while no beat is waiting", () => {
    const router = createTouchRouter();
    expect(router.active()).toBeNull();
    expect(router.route("ball", 1000)).toBeNull();
    expect(router.confirm(1000)).toBe(false);
  });

  it("passes only current targets and ignores misses and other ids", () => {
    const router = createTouchRouter();
    router.setTargets(["ball"]);
    expect(router.route(null, 1000)).toBeNull();
    expect(router.route("drum", 1000)).toBeNull();
    expect(router.route("", 1000)).toBeNull();
    expect(router.route("ball", 1000)).toBe("ball");
  });

  it("debounces repeats (double taps, palms, two fingers) across all targets", () => {
    const router = createTouchRouter();
    router.setTargets(["ball", "drum"]);
    expect(router.route("ball", 1000)).toBe("ball");
    expect(router.route("ball", 1000)).toBeNull();
    expect(router.route("drum", 1000 + DEFAULT_DEBOUNCE_MS - 1)).toBeNull();
    expect(router.route("drum", 1000 + DEFAULT_DEBOUNCE_MS)).toBe("drum");
  });

  it("ignores stale targets from an earlier beat and taps after targets clear", () => {
    const router = createTouchRouter();
    router.setTargets(["ball"]);
    router.setTargets(["door"]);
    expect(router.route("ball", 5000)).toBeNull();
    expect(router.route("door", 5000)).toBe("door");
    router.setTargets(null);
    expect(router.route("door", 9000)).toBeNull();
    expect(router.active()).toBeNull();
  });

  it("keeps at most two unique targets", () => {
    const router = createTouchRouter();
    router.setTargets(["a", "a", "", "b", "c"]);
    expect(router.active()).toEqual(["a", "b"]);
    expect(router.route("c", 1000)).toBeNull();
    expect(router.route("b", 1000)).toBe("b");
  });

  it("ignores invalid times and out-of-order repeats; a restarted clock never locks taps out", () => {
    const router = createTouchRouter();
    router.setTargets(["ball"]);
    expect(router.route("ball", Number.NaN)).toBeNull();
    expect(router.route("ball", 90000)).toBe("ball");
    // Delivered slightly out of order: still the same press.
    expect(router.route("ball", 90000 - 100)).toBeNull();
    expect(router.confirm(90000 - DEFAULT_DEBOUNCE_MS + 1)).toBe(false);
    // The caller's clock restarted (e.g. a new story clock without reset()): a fresh press.
    expect(router.route("ball", 1000)).toBe("ball");
    expect(router.route("ball", 1000 + DEFAULT_DEBOUNCE_MS - 1)).toBeNull();
    expect(router.confirm(1000 + DEFAULT_DEBOUNCE_MS)).toBe(true);
  });

  it("supports a custom debounce and a reset", () => {
    const router = createTouchRouter({ debounceMs: 100 });
    router.setTargets(["ball"]);
    expect(router.route("ball", 0)).toBe("ball");
    expect(router.route("ball", 99)).toBeNull();
    expect(router.route("ball", 100)).toBe("ball");
    router.reset();
    expect(router.active()).toBeNull();
    router.setTargets(["ball"]);
    expect(router.route("ball", 101)).toBe("ball");
    expect(createTouchRouter({ debounceMs: Number.NaN }).route("x", 0)).toBeNull();
  });

  it("a parent confirm is the same turn as a tap: it works while waiting and shares the debounce", () => {
    const router = createTouchRouter();
    router.setTargets(["ball"]);
    expect(router.route("ball", 1000)).toBe("ball");
    expect(router.confirm(1100)).toBe(false);
    expect(router.confirm(1000 + DEFAULT_DEBOUNCE_MS)).toBe(true);
    expect(router.route("ball", 1000 + DEFAULT_DEBOUNCE_MS + 1)).toBeNull();
    // A wait with no tap targets (e.g. "find your real toy") still takes a parent confirm.
    router.setTargets([]);
    expect(router.confirm(10000)).toBe(true);
    router.setTargets(null);
    expect(router.confirm(20000)).toBe(false);
  });
});

describe("tap equivalence through the director", () => {
  const REVIEW = { language: "approved", rights: "approved", reviewer: "agent:test fixture", date: "2026-10-29" } as const;
  const invite: BeatSpec = {
    id: "invite",
    kind: "invite",
    stage: [],
    lines: [{ speaker: "momo", key: "t03.invite.1" }],
    holdMs: 0,
    input: { type: "tap", targets: ["ball"] },
    waitMs: 4000,
    response: { stage: [{ do: "object", target: "ball", action: "roll" }], lines: [{ speaker: "momo", key: "t03.invite.r1" }], holdMs: 500 }
  };
  const story: EpisodeSpec = {
    kind: "episode",
    id: "touch-fixture",
    number: 1,
    version: 1,
    phase: "P1",
    titleKey: "t03.title",
    world: "meadow",
    host: "momo",
    cast: [{ id: "momo", at: "center" }],
    props: [{ id: "ball", asset: "ball", at: "right" }],
    targetWords: ["ball"],
    supportWords: [],
    offlinePlayKey: "t03.offline",
    caregiverBridgeKey: "t03.bridge",
    review: REVIEW,
    estimatedDurationSec: 120,
    beats: [invite]
  };

  /** App wiring: director targets drive the router; routed taps and confirms become director events. */
  function wired() {
    const director = createEpisodeDirector(story, { lineMs: () => 1000 });
    const router = createTouchRouter();
    const apply = (effects: DirectorEffect[]): DirectorEffect[] => {
      for (const fx of effects) if (fx.type === "targets") router.setTargets(fx.targets);
      return effects;
    };
    apply(director.send({ type: "START", mode: "play-together" }));
    apply(director.send({ type: "TICK", dtMs: 1000 }));
    return {
      director,
      router,
      tap(target: string | null, nowMs: number): DirectorEffect[] {
        const routed = router.route(target, nowMs);
        return routed === null ? [] : apply(director.send({ type: "TAP", target: routed }));
      },
      confirm(nowMs: number): DirectorEffect[] {
        return router.confirm(nowMs) ? apply(director.send({ type: "PARENT_CONFIRM" })) : [];
      }
    };
  }

  it("a routed tap and a parent confirm give the same story outcome", () => {
    const viaTap = wired();
    const viaParent = wired();
    expect(viaTap.router.active()).toEqual(["ball"]);
    const tapFx = viaTap.tap("ball", 2000);
    const parentFx = viaParent.confirm(2000);
    expect(tapFx).toEqual(parentFx);
    expect(tapFx[0]).toEqual({ type: "targets", targets: null });
    expect(viaTap.router.active()).toBeNull();
    expect(viaParent.router.active()).toBeNull();
  });

  it("a random screen touch or a double tap never advances the story twice", () => {
    const app = wired();
    expect(app.tap(null, 2000)).toEqual([]);
    expect(app.tap("momo", 2000)).toEqual([]);
    expect(app.tap("ball", 2000)).toHaveLength(3);
    expect(app.tap("ball", 2050)).toEqual([]);
    expect(app.confirm(2100)).toEqual([]);
    expect(app.director.snapshot()).toMatchObject({ taps: 1, phase: "responding" });
  });
});

describe("bindCanvasTaps", () => {
  interface FakeCanvas extends TapSurface {
    readonly listenerCount: () => number;
    down(clientX: number, clientY: number, button?: number): { prevented: boolean };
  }

  function fakeCanvas(rect = { left: 100, top: 50, width: 400, height: 300 }): FakeCanvas {
    const listeners = new Set<TapListener>();
    return {
      addEventListener(type, listener) {
        if (type === "pointerdown") listeners.add(listener);
      },
      removeEventListener(type, listener) {
        if (type === "pointerdown") listeners.delete(listener);
      },
      getBoundingClientRect: () => rect,
      listenerCount: () => listeners.size,
      down(clientX, clientY, button = 0) {
        let prevented = false;
        const event: TapPointerEvent = {
          clientX,
          clientY,
          button,
          preventDefault() {
            prevented = true;
          }
        };
        for (const listener of [...listeners]) listener(event);
        return { prevented };
      }
    };
  }

  /** A round 60 px ball centred at canvas (200, 150), i.e. client (300, 200). */
  const ballPick = (x: number, y: number): string | null => (Math.hypot(x - 200, y - 150) <= 30 ? "ball" : null);

  it("delivers a tap on pointerdown with canvas-relative coordinates", () => {
    const canvas = fakeCanvas();
    const seen: string[] = [];
    const picks: [number, number][] = [];
    bindCanvasTaps(
      canvas,
      (x, y) => {
        picks.push([x, y]);
        return ballPick(x, y);
      },
      (id) => seen.push(id),
      () => 1000
    );
    expect(canvas.down(300, 200).prevented).toBe(true);
    expect(seen).toEqual(["ball"]);
    expect(picks).toEqual([[200, 150]]);
  });

  it("is generous: a tap just outside the target still counts, a far miss does not", () => {
    const canvas = fakeCanvas();
    const seen: string[] = [];
    let clock = 0;
    bindCanvasTaps(canvas, ballPick, (id) => seen.push(id), () => clock);
    // 30 px right of the ball's edge: found on the 36 px ring.
    expect(canvas.down(300 + 60, 200).prevented).toBe(true);
    clock += 1000;
    // 80 px away: a miss, and the browser keeps the event.
    expect(canvas.down(300 + 110, 200).prevented).toBe(false);
    expect(seen).toEqual(["ball"]);
  });

  it("prefers the nearest target and never samples outside the canvas", () => {
    const sampled: [number, number][] = [];
    const pick = (x: number, y: number): string | null => {
      sampled.push([x, y]);
      if (x >= 0 && x <= 10 && y >= 18 && y <= 18) return "near";
      if (x >= 30) return "far";
      return null;
    };
    expect(generousPick(pick, 0, 0, 400, 300)).toBe("near");
    expect(sampled.every(([x, y]) => x >= 0 && y >= 0 && x <= 400 && y <= 300)).toBe(true);
    expect(generousPick(() => null, 10, 10, 400, 300)).toBeNull();
    expect(generousPick(() => "only-exact", 10, 10, 400, 300, [0])).toBe("only-exact");
  });

  it("debounces repeated pointerdowns using the time it is given", () => {
    const canvas = fakeCanvas();
    const seen: number[] = [];
    let clock = 5000;
    bindCanvasTaps(canvas, ballPick, () => seen.push(clock), () => clock);
    canvas.down(300, 200);
    canvas.down(300, 200);
    clock += DEFAULT_DEBOUNCE_MS - 1;
    canvas.down(300, 200);
    clock += 1;
    canvas.down(300, 200);
    expect(seen).toEqual([5000, 5000 + DEFAULT_DEBOUNCE_MS]);
  });

  it("a clock that restarts never locks taps out; an out-of-order repeat is still one tap", () => {
    const canvas = fakeCanvas();
    const seen: number[] = [];
    let clock = 90000;
    bindCanvasTaps(canvas, ballPick, () => seen.push(clock), () => clock);
    canvas.down(300, 200);
    clock = 90000 - 50;
    canvas.down(300, 200);
    clock = 2000;
    canvas.down(300, 200);
    clock = Number.NaN;
    canvas.down(300, 200);
    expect(seen).toEqual([90000, 2000]);
  });

  it("only the primary button counts (no right-click or pen-barrel taps)", () => {
    const canvas = fakeCanvas();
    const seen: string[] = [];
    bindCanvasTaps(canvas, ballPick, (id) => seen.push(id), () => 0);
    canvas.down(300, 200, 2);
    canvas.down(300, 200, 1);
    expect(seen).toEqual([]);
  });

  it("unbinds cleanly, and a second unbind is harmless", () => {
    const canvas = fakeCanvas();
    const seen: string[] = [];
    const unbind = bindCanvasTaps(canvas, ballPick, (id) => seen.push(id), () => 0);
    expect(canvas.listenerCount()).toBe(1);
    unbind();
    unbind();
    expect(canvas.listenerCount()).toBe(0);
    canvas.down(300, 200);
    expect(seen).toEqual([]);
  });
});
