import { describe, expect, it } from "vitest";
import { ALL_LANES, APEX_T, CONFIG, IDLE, BeatHopperSim, replay, type Input } from "../../../apps/showcase-beat-hopper/src/sim";
import { InputQueue, isGameKey } from "../../../apps/showcase-beat-hopper/src/input";
import { Autopilot } from "../../../apps/showcase-beat-hopper/src/autopilot";

const DT = CONFIG.DT;

/** A running sim with the spawner disabled (no obstacles, nothing to judge). */
const running = (): BeatHopperSim => {
  const sim = new BeatHopperSim(7);
  sim.advance({ ...IDLE, start: true });
  for (const s of sim.o.obstacles) s.active = false;
  for (const s of sim.o.orbSlots) s.active = false;
  sim.o.spawnedThroughBeat = 100000;
  return sim;
};

/** Advance until the hopper is on the ground again (bounded). */
const land = (sim: BeatHopperSim, queue?: InputQueue): number => {
  let n = 0;
  while (sim.o.pose === "air" && n < 200) {
    sim.advance(queue ? queue.take() : IDLE);
    n++;
  }
  return n;
};

describe("beat-hopper keyboard input", () => {
  for (const code of ["Space", "ArrowUp", "KeyW"]) {
    it(`${code} hops on the keydown step, never ducks, and its key-up does nothing`, () => {
      const sim = running();
      const queue = new InputQueue();
      expect(queue.keyDown(code, false, true)).toBe(true);
      sim.advance(queue.take());
      expect(sim.o.pose).toBe("air");
      expect(sim.o.vy).toBeGreaterThan(0);
      expect(sim.o.airStart).toBeCloseTo(sim.o.t, 9);
      // Held 300 ms (18 steps) then released: still one hop, no duck at any point.
      for (let i = 0; i < 18; i++) {
        sim.advance(queue.take());
        expect(sim.o.pose).not.toBe("duck");
      }
      queue.keyUp(code);
      sim.advance(queue.take());
      land(sim, queue);
      for (let i = 0; i < 20; i++) sim.advance(queue.take());
      expect(sim.o.pose).toBe("grounded");
      expect(sim.o.y).toBe(0);
    });
  }

  it("one press is one hop: a press and release inside one step still hops", () => {
    const sim = running();
    const queue = new InputQueue();
    queue.keyDown("Space", false, true);
    queue.keyUp("Space");
    sim.advance(queue.take());
    expect(sim.o.pose).toBe("air");
    land(sim, queue);
    for (let i = 0; i < 10; i++) sim.advance(queue.take());
    expect(sim.o.pose).toBe("grounded");
  });

  it("auto-repeat keydown is ignored (but still reported as a game key so the page never scrolls)", () => {
    const sim = running();
    const queue = new InputQueue();
    queue.keyDown("Space", false, true);
    sim.advance(queue.take());
    land(sim, queue);
    // Keep holding: OS auto-repeat keeps firing; none of those may hop again.
    for (let i = 0; i < 60; i++) {
      expect(queue.keyDown("Space", true, true)).toBe(true);
      sim.advance(queue.take());
      expect(sim.o.pose).toBe("grounded");
    }
  });

  for (const code of ["ArrowDown", "KeyS"]) {
    it(`${code} ducks while held and never hops`, () => {
      const sim = running();
      const queue = new InputQueue();
      queue.keyDown(code, false, true);
      sim.advance(queue.take());
      expect(sim.o.pose).toBe("duck");
      for (let i = 0; i < 18; i++) {
        queue.keyDown(code, true, true);
        sim.advance(queue.take());
        expect(sim.o.pose).toBe("duck");
      }
      queue.keyUp(code);
      sim.advance(queue.take());
      expect(sim.o.pose).toBe("grounded");
      for (let i = 0; i < 10; i++) {
        sim.advance(queue.take());
        expect(sim.o.pose).toBe("grounded");
      }
      // A quick tap of the duck key never hops either.
      queue.keyDown(code, false, true);
      queue.keyUp(code);
      sim.advance(queue.take());
      expect(sim.o.pose).toBe("duck");
      sim.advance(queue.take());
      expect(sim.o.pose).toBe("grounded");
      expect(sim.o.y).toBe(0);
    });
  }

  it("Space while ducking with ArrowDown hops (Space never ducks)", () => {
    const sim = running();
    const queue = new InputQueue();
    queue.keyDown("ArrowDown", false, true);
    sim.advance(queue.take());
    expect(sim.o.pose).toBe("duck");
    queue.keyDown("Space", false, true);
    sim.advance(queue.take());
    expect(sim.o.pose).toBe("air");
  });

  it("a hop pressed up to JUMP_BUFFER before landing fires on the landing step", () => {
    const sim = running();
    const queue = new InputQueue();
    queue.keyDown("Space", false, true);
    sim.advance(queue.take());
    const firstStart = sim.o.airStart;
    // Air time is 2 * APEX_T; press ~100 ms before the landing.
    const airSteps = Math.round((2 * APEX_T) / DT);
    for (let i = 0; i < airSteps - 6; i++) sim.advance(queue.take());
    expect(sim.o.pose).toBe("air");
    queue.keyDown("Space", false, true);
    sim.advance(queue.take());
    expect(sim.o.pose).toBe("air");
    for (let i = 0; i < 10; i++) sim.advance(queue.take());
    // Landing re-launched instead of grounding: the second hop started on the landing step.
    expect(sim.o.airStart - firstStart).toBeGreaterThan(2 * APEX_T - 2 * DT);
    expect(sim.o.airStart - firstStart).toBeLessThan(2 * APEX_T + 2 * DT);
  });

  it("a hop pressed long before landing is dropped (no surprise double hop)", () => {
    const sim = running();
    const queue = new InputQueue();
    queue.keyDown("Space", false, true);
    sim.advance(queue.take());
    for (let i = 0; i < 10; i++) sim.advance(queue.take());
    queue.keyDown("Space", false, true);
    sim.advance(queue.take());
    land(sim, queue);
    for (let i = 0; i < 5; i++) sim.advance(queue.take());
    expect(sim.o.pose).toBe("grounded");
  });

  it("a pointer tap released in the air is buffered too (taps are not lost)", () => {
    const sim = running();
    sim.advance({ ...IDLE, hop: true });
    const airSteps = Math.round((2 * APEX_T) / DT);
    for (let i = 0; i < airSteps - 5; i++) sim.advance(IDLE);
    const queue = new InputQueue();
    queue.press();
    sim.advance(queue.take());
    queue.release();
    sim.advance(queue.take());
    const firstStart = sim.o.airStart;
    for (let i = 0; i < 10; i++) sim.advance(queue.take());
    // The landing re-launched: a second hop started about one air time after the first.
    expect(sim.o.airStart - firstStart).toBeGreaterThan(2 * APEX_T - 2 * DT);
    expect(sim.o.airStart - firstStart).toBeLessThan(2 * APEX_T + 2 * DT);
  });

  it("a buffered hop is judged from its actual start: on-beat landing hop scores PERFECT", () => {
    const sim = running();
    // First hop, then a buffered press; place a full-width crate so the relaunch apex is on its crossing.
    sim.advance({ ...IDLE, hop: true });
    const relaunchAt = sim.o.airStart + Math.round((2 * APEX_T) / DT) * DT;
    const slot = sim.o.obstacles[0]!;
    Object.assign(slot, { active: true, type: "block", lanes: ALL_LANES, beat: 99, crossTime: relaunchAt + APEX_T, resolved: false, judgement: null });
    while (sim.o.t + DT < relaunchAt - 0.05) sim.advance(IDLE);
    sim.advance({ ...IDLE, hop: true });
    while (sim.o.t < slot.crossTime + DT) sim.advance(IDLE);
    expect(slot.judgement === "perfect" || slot.judgement === "good").toBe(true);
    expect(sim.o.miss).toBe(0);
  });

  it("keys outside play do nothing to the sim; only game keys are claimed", () => {
    const queue = new InputQueue();
    expect(queue.keyDown("Space", false, false)).toBe(true);
    expect(queue.take()).toEqual(IDLE);
    expect(queue.keyDown("KeyM", false, true)).toBe(false);
    expect(isGameKey("Enter")).toBe(false);
    expect(isGameKey("ArrowLeft")).toBe(true);
  });

  it("Space still hops when a button had focus: the queue is window-level and focus-independent", () => {
    // main.ts blurs any focused button and preventDefaults game keys during play; the key itself must still hop.
    const sim = running();
    const queue = new InputQueue();
    queue.drop(); // the How to play / pause close path drops held input first
    sim.advance(queue.take());
    queue.keyDown("Space", false, true);
    sim.advance(queue.take());
    expect(sim.o.pose).toBe("air");
  });

  it("keyboard hops replay deterministically", () => {
    const inputs: Input[] = [];
    for (let i = 0; i < 600; i++) inputs.push(i % 40 === 0 ? { ...IDLE, hop: true } : i === 0 ? { ...IDLE, start: true } : IDLE);
    inputs[0] = { ...IDLE, start: true };
    const a = replay(3, 10, inputs).trace;
    const b = replay(3, 10, inputs).trace;
    expect(a).toEqual(b);
    expect(a.some((row) => row[6] === 1)).toBe(true);
  });

  it("the autopilot still clears a run (no regression from the buffer)", () => {
    const sim = new BeatHopperSim(20261101);
    const pilot = new Autopilot();
    for (let i = 0; i < 60 * 30; i++) {
      sim.advance(pilot.next(sim, i));
      pilot.observe(sim);
    }
    expect(sim.o.miss).toBe(0);
  });

  it("Shift+Space, KeyW, KeyE, ShiftLeft, and queue.boostJump() trigger Big / Boost Jump while Space and queue.jump() trigger regular hop", () => {
    for (const trigger of [
      (q: InputQueue) => expect(q.keyDown("Space", false, true, true)).toBe(true),
      (q: InputQueue) => expect(q.keyDown("KeyW", false, true, false)).toBe(true),
      (q: InputQueue) => expect(q.keyDown("KeyE", false, true, false)).toBe(true),
      (q: InputQueue) => expect(q.keyDown("ShiftLeft", false, true, true)).toBe(true),
      (q: InputQueue) => q.boostJump()
    ]) {
      const sim = running();
      const queue = new InputQueue();
      trigger(queue);
      sim.advance(queue.take());
      expect(sim.o.pose).toBe("air");
      expect(sim.o.bigJump).toBe(true);
      expect(sim.o.vy).toBeCloseTo(CONFIG.BIG_JUMP_VY - CONFIG.BIG_JUMP_GRAVITY * DT, 9);
    }

    const regularSim = running();
    const regularQueue = new InputQueue();
    regularQueue.jump();
    regularSim.advance(regularQueue.take());
    expect(regularSim.o.pose).toBe("air");
    expect(regularSim.o.bigJump).toBe(false);
    expect(regularSim.o.vy).toBeCloseTo(CONFIG.JUMP_VY - CONFIG.GRAVITY * DT, 9);
  });

  it("HUD/swipe duckStart, duckEnd, and steer helpers coordinate cleanly with keyboard duck keys", () => {
    const sim = running();
    const queue = new InputQueue();
    queue.steer(1);
    queue.duckStart("hud");
    sim.advance(queue.take());
    expect(sim.o.lane).toBe(1);
    expect(sim.o.pose).toBe("duck");

    // Holding a keyboard duck key while releasing HUD duck keeps duck active until both end.
    queue.keyDown("KeyS", false, true);
    queue.duckEnd("hud");
    sim.advance(queue.take());
    expect(sim.o.pose).toBe("duck");

    queue.keyUp("KeyS");
    sim.advance(queue.take());
    expect(sim.o.pose).toBe("grounded");
  });
});
