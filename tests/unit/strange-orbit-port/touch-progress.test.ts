import { describe, expect, it } from "vitest";
import { STEER_RANGE_PX, TOUCH_BUTTON_PX, createTouchInput, steerFromDrag } from "../../../examples/strange-orbit-port/touch";
import { MUTE_KEY, bestKey, ghostAt, readBest, readMuted, recordBest, writeMuted, type StorageLike } from "../../../examples/strange-orbit-port/progress";
import { createRace, startCountdown, stepRace, autopilot, STEP } from "../../../examples/strange-orbit-port/race";

/** Audit rows SO-1 (touch input), SO-9 (saved mute) and SO-E3 (personal bests and the time-trial ghost). */

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
};

describe("touch input (SO-1)", () => {
  it("touching the steer pad pedals; dragging steers with full lock at the range", () => {
    const t = createTouchInput();
    expect(t.sample()).toMatchObject({ active: false, pedal: false, steer: 0 });
    t.steerDown(7, 100);
    expect(t.sample()).toMatchObject({ active: true, pedal: true, steer: 0 });
    t.steerMove(7, 100 + STEER_RANGE_PX / 2);
    expect(t.sample().steer).toBeCloseTo(0.5, 9);
    t.steerMove(7, 100 - STEER_RANGE_PX * 3);
    expect(t.sample().steer).toBe(-1);
    t.steerUp(7);
    expect(t.sample()).toMatchObject({ active: false, pedal: false, steer: 0 });
  });

  it("a second finger does not take over the steer pad", () => {
    const t = createTouchInput();
    t.steerDown(1, 200);
    t.steerDown(2, 50);
    t.steerMove(2, 0);
    expect(t.sample().steer).toBe(0);
    t.steerUp(2);
    expect(t.sample().pedal).toBe(true);
  });

  it("hold buttons last while held, Boost pedals on its own, Brake cancels pedalling, Gravity is one tap", () => {
    const t = createTouchInput();
    t.press("boost");
    expect(t.sample()).toMatchObject({ boost: true, pedal: true });
    t.press("brake");
    expect(t.sample()).toMatchObject({ brake: true, pedal: false });
    t.release("brake");
    t.release("boost");
    t.press("jump");
    expect(t.sample().jump).toBe(true);
    t.release("jump");
    t.tap("gravity");
    expect(t.sample().gravity).toBe(true);
    expect(t.sample().gravity).toBe(false);
  });

  it("buttons are at least 48 CSS px and the steer mapping is clamped", () => {
    expect(TOUCH_BUTTON_PX).toBeGreaterThanOrEqual(48);
    expect(steerFromDrag(1e6)).toBe(1);
    expect(steerFromDrag(-1e6)).toBe(-1);
  });

  it("touch input drives a race: pedal and steer through the sim like the keyboard", () => {
    const t = createTouchInput();
    const e = createRace();
    startCountdown(e);
    while (e.phase === "countdown") stepRace(e, {}, STEP);
    t.steerDown(1, 120);
    for (let i = 0; i < 60 * 8; i++) {
      // steer back to the centre line the way a thumb would
      const want = Math.max(-1, Math.min(1, -e.lane * 0.6 - e.heading * 1.5));
      t.steerMove(1, 120 + want * STEER_RANGE_PX);
      const s = t.sample();
      stepRace(e, { pedal: s.pedal, steer: s.steer, boost: s.boost, brake: s.brake, jump: s.jump, gravity: s.gravity }, STEP);
    }
    expect(e.phase).toBe("racing");
    expect(e.s).toBeGreaterThan(150);
    expect(e.speed).toBeGreaterThan(20);
  });
});

describe("saved preferences and bests (SO-9, SO-E3)", () => {
  it("mute persists", () => {
    const store = memory();
    expect(readMuted(store)).toBe(false);
    writeMuted(store, true);
    expect(store.data.get(MUTE_KEY)).toBe("1");
    expect(readMuted(store)).toBe(true);
    expect(readMuted(null)).toBe(false);
  });

  it("a personal best is kept per mode, difficulty and vehicle and only replaced by a faster time", () => {
    const store = memory();
    const key = bestKey("cup", "racer", "bike");
    expect(key).not.toBe(bestKey("cup", "racer", "skate"));
    expect(recordBest(store, key, 250)).toEqual({ best: 250, isNew: true });
    expect(recordBest(store, key, 260)).toEqual({ best: 250, isNew: false });
    expect(recordBest(store, key, 240)).toEqual({ best: 240, isNew: true });
    expect(readBest(store, key)?.time).toBe(240);
    store.data.set(key, "{not json");
    expect(readBest(store, key)).toBeNull();
  });

  it("the trial ghost round-trips through storage and is sampled between recorded points", () => {
    const store = memory();
    const e = createRace({ mode: "trial" });
    startCountdown(e);
    for (let i = 0; i < 60 * 20; i++) stepRace(e, e.phase === "racing" ? autopilot(e) : {}, STEP);
    expect(e.recording.length).toBeGreaterThan(50);
    const key = bestKey("trial", "racer", "bike");
    recordBest(store, key, 200, e.recording);
    const ghost = readBest(store, key)!.ghost!;
    expect(ghost).toHaveLength(e.recording.length);
    const a = ghost[10]!, b = ghost[11]!;
    const mid = ghostAt(ghost, (a[0]! + b[0]!) / 2)!;
    expect(mid.s).toBeGreaterThan(a[1]!);
    expect(mid.s).toBeLessThan(b[1]!);
    expect(mid.route).toBe("main");
    expect(ghostAt(ghost, -1)).toBeNull();
    expect(ghostAt(ghost, ghost[ghost.length - 1]![0]! + 1)).toBeNull();
  });
});
