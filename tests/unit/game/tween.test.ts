import { describe, expect, it } from "vitest";
import { createTweenEngine, TWEEN_POOL_CAPACITY, type TweenableNode } from "../../../packages/game/src/juice/tween";

function fakeNode(): TweenableNode & { calls: number } {
  const node = {
    calls: 0,
    position: [0, 0, 0] as readonly [number, number, number],
    rotation: [0, 0, 0] as readonly [number, number, number],
    scale: 1 as number | readonly [number, number, number],
    setPosition(x: number, y: number, z: number) {
      node.calls++;
      (node as { position: readonly number[] }).position = [x, y, z];
    },
    setRotation(x: number, y: number, z: number) {
      (node as { rotation: readonly number[] }).rotation = [x, y, z];
    },
    setScale(s: number | readonly [number, number, number]) {
      (node as { scale: number | readonly number[] }).scale = s;
    }
  };
  return node as TweenableNode & { calls: number };
}

const DT = 1 / 60;

describe("juice/tween §7.6 (PRD-09 1745)", () => {
  it("0.5s position tween reaches its target at tick 30 @60Hz", async () => {
    const engine = createTweenEngine();
    const node = fakeNode();
    const h = engine.tween(node, { position: [3, 6, 9] }, { duration: 0.5, ease: "linear" });
    for (let i = 0; i < 30; i++) engine.tick(DT);
    await h.done;
    expect(node.position[0]).toBeCloseTo(3, 6);
    expect(node.position[2]).toBeCloseTo(9, 6);
    expect(node.calls).toBeGreaterThan(0);
  });

  it("scaled tweens pause while the session is paused (scaledDt=0); unscaled keep going", async () => {
    const engine = createTweenEngine();
    const obj = { hp: 0 };
    const ui = { t: 0 };
    const scaled = engine.tween(obj, { hp: 100 }, { duration: 1, ease: "linear" });
    engine.tween(ui, { t: 60 }, { duration: 1, ease: "linear", unscaled: true });
    for (let i = 0; i < 30; i++) engine.tick(DT, 0); // paused: raw dt flows, scaled = 0
    expect(obj.hp).toBe(0);
    expect(ui.t).toBeCloseTo(30, 5);
    for (let i = 0; i < 60; i++) engine.tick(DT, DT);
    await scaled.done;
    expect(obj.hp).toBeCloseTo(100, 6);
  });

  it("finish() jumps to the target; cancel() stops without applying", async () => {
    const engine = createTweenEngine();
    const a = { v: 0 };
    const b = { v: 0 };
    const hf = engine.tween(a, { v: 5 }, { duration: 2, ease: "linear" });
    const hc = engine.tween(b, { v: 5 }, { duration: 2, ease: "linear" });
    hf.finish();
    hc.cancel();
    await Promise.all([hf.done, hc.done]);
    expect(a.v).toBe(5);
    expect(b.v).toBe(0);
  });

  it("caps the pool at 64 active; extra tweens drop with a resolved handle", () => {
    const engine = createTweenEngine();
    const objs = Array.from({ length: TWEEN_POOL_CAPACITY + 5 }, () => ({ v: 0 }));
    for (const o of objs) engine.tween(o, { v: 1 }, { duration: 10 });
    expect(engine.activeCount).toBe(TWEEN_POOL_CAPACITY);
  });

  it("lerps array fields and indexed paths on plain objects", () => {
    const engine = createTweenEngine();
    const o = { color: [0, 0, 0], speed: [1, 2, 3] };
    engine.tween(o, { color: [10, 20, 30], "speed.1": 12 }, { duration: 1, ease: "linear" });
    engine.tick(0.5);
    expect(o.color[1]).toBeCloseTo(10, 6);
    expect(o.speed[1]).toBeCloseTo(7, 6);
    engine.tick(0.5);
    expect(o.color).toEqual([10, 20, 30]);
    expect(o.speed).toEqual([1, 12, 3]);
  });
});
