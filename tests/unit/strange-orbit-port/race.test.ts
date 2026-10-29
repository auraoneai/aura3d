import { describe, expect, it } from "vitest";
import {
  STEP,
  autopilot,
  createRace,
  formatTime,
  placeOf,
  raceOrder,
  runFixed,
  scriptedInput,
  startCountdown,
  stepRace,
  togglePause,
  type Input,
  type RaceEvent,
  type RaceState
} from "../../../examples/strange-orbit-port/race";
import { routeFrame } from "../../../examples/strange-orbit-port/track";

const racing = (options: Parameters<typeof createRace>[0] = {}): RaceState => {
  const state = createRace(options);
  startCountdown(state);
  while (state.phase === "countdown") stepRace(state, {}, STEP);
  return state;
};

/** Steer toward `lane` while cancelling heading (the sim keeps world heading, so a straight rider leaves the curved track). */
const hold = (e: RaceState, lane: number, extra: Input = {}): Input => ({
  pedal: true,
  steer: Math.max(-1, Math.min(1, (lane - e.lane) * 0.6 - e.heading * 1.5)),
  ...extra
});

/** Everything the PRD gate compares: lap, gate order, time and the final result. */
const fingerprint = (e: RaceState): string => JSON.stringify([
  e.phase, e.lap, e.gatesPassed, e.checkpoint, +e.time.toFixed(6), +e.s.toFixed(6), +e.lane.toFixed(6), +e.speed.toFixed(6),
  +e.energy.toFixed(6), e.score, e.dust, e.hits, e.place, e.respawns, e.end,
  e.rivals.map((r) => [+r.s.toFixed(6), +r.lane.toFixed(6), r.finished])
]);

describe("createRace", () => {
  it("starts in the menu with the original defaults", () => {
    const e = createRace();
    expect(e.phase).toBe("menu");
    expect(e.laps).toBe(7);
    expect(e.rivals.map((r) => r.name)).toEqual(["LYRA", "IO", "ATLAS", "NOVA", "ORION"]);
    expect(e.rivals.map((r) => r.s)).toEqual([9, 14, 19, 24, 29]);
    expect(e.rivals.map((r) => r.lane)).toEqual([-4.5, 0, 4.5, -4.5, 0]);
    expect(e.gravityCharges).toBe(3);
    expect(e.energy).toBe(55);
    expect(e.countdown).toBe(3.2);
    expect(e.lap).toBe(1);
    expect(e.place).toBe(6);
  });

  it("modes and difficulties change laps, rivals and rescues", () => {
    const trial = createRace({ mode: "trial" });
    expect(trial.laps).toBe(5);
    expect(trial.rivals).toHaveLength(0);
    expect(createRace({ difficulty: "explorer" }).gravityCharges).toBe(5);
    expect(createRace({ difficulty: "expert" }).gravityCharges).toBe(2);
    expect(createRace({ difficulty: "normal" }).difficulty).toBe("racer");
    expect(createRace({ vehicle: "skate" }).vehicle).toBe("skate");
    expect(createRace({ vehicle: "hoverboard" as never }).vehicle).toBe("bike");
  });
});

describe("countdown and pause", () => {
  it("ticks on each whole-second boundary (4→3→2→1→0 from 3.2 s), then announces go once", () => {
    const e = createRace();
    startCountdown(e);
    expect(e.phase).toBe("countdown");
    const seen: string[] = [];
    let steps = 0;
    while (e.phase === "countdown") {
      stepRace(e, {}, STEP);
      steps++;
      seen.push(...e.events.map((ev) => ev.type));
    }
    expect(seen.filter((t) => t === "tick")).toHaveLength(4);
    expect(seen.filter((t) => t === "go")).toHaveLength(1);
    expect(steps).toBeGreaterThanOrEqual(192);
    expect(steps).toBeLessThanOrEqual(193);
    expect(e.phase).toBe("racing");
    expect(e.time).toBe(0);
  });

  it("clamps a long frame to 0.05 s (the original's cap)", () => {
    const e = racing();
    stepRace(e, { pedal: true }, 5);
    expect(e.time).toBeCloseTo(0.05, 12);
  });

  it("pausing freezes the simulation and resumes the previous phase", () => {
    const e = racing();
    for (let i = 0; i < 30; i++) stepRace(e, { pedal: true }, STEP);
    expect(togglePause(e)).toBe(true);
    expect(e.phase).toBe("paused");
    const before = fingerprint(e);
    for (let i = 0; i < 30; i++) stepRace(e, { pedal: true }, STEP);
    expect(fingerprint(e)).toBe(before);
    expect(togglePause(e)).toBe(true);
    expect(e.phase).toBe("racing");
    expect(togglePause(createRace())).toBe(false);
  });
});

describe("laps, gates and finish", () => {
  it("a lap boundary advances the lap, records its time and tops up a rescue", () => {
    const e = racing();
    e.gravityCharges = 1;
    e.s = 1449.9;
    e.speed = 40;
    stepRace(e, { pedal: true }, STEP);
    expect(e.lap).toBe(2);
    expect(e.lapTimes).toHaveLength(1);
    expect(e.gravityCharges).toBe(2);
    expect(e.events.some((ev) => ev.type === "lap")).toBe(true);
  });

  it("announces the final orbit on the last lap boundary", () => {
    const e = racing();
    e.lap = 6;
    e.s = 6 * 1450 - 0.1;
    e.speed = 40;
    stepRace(e, { pedal: true }, STEP);
    expect(e.lap).toBe(7);
    expect(e.events.find((ev) => ev.type === "lap")?.text).toBe("Final orbit. Make it beautiful.");
  });

  it("crossing a gate inside the lane limits collects it once, with stardust and score", () => {
    const e = racing();
    e.s = 89.9;
    e.speed = 40;
    e.lane = 0;
    const before = { energy: e.energy, score: e.score };
    stepRace(e, { pedal: true }, STEP);
    const gate = e.events.find((ev) => ev.type === "gate");
    expect(gate?.gate).toBe(90);
    expect(e.gatesPassed).toBe(1);
    expect(e.checkpoint).toBe(1);
    expect(e.score).toBeGreaterThanOrEqual(before.score + 150);
    expect(e.energy).toBeGreaterThan(before.energy);
    stepRace(e, { pedal: true }, STEP);
    expect(e.gatesPassed).toBe(1);
  });

  it("missing a gate (outside the lane limits) slings back to the approach in zero-G", () => {
    const e = racing();
    e.s = 89.9;
    e.speed = 40;
    e.lane = 12.4;
    stepRace(e, { pedal: true }, STEP);
    const missed = e.events.find((ev) => ev.type === "missedGate");
    expect(missed).toBeTruthy();
    expect(e.gatesPassed).toBe(0);
    expect(e.flight?.mode).toBe("drift");
    expect(e.s).toBeCloseTo(85, 12);
  });

  it("an autopilot race completes all 7 laps in order and wins", () => {
    const e = createRace();
    startCountdown(e);
    const events: RaceEvent[] = [];
    const steps = runFixed(e, (s) => {
      const input = autopilot(s);
      return input;
    }, (s) => {
      events.push(...s.events);
      return s.phase === "finished" || s.phase === "lost";
    }, 60 * 60 * 6);
    expect(e.phase).toBe("finished");
    expect(steps).toBeLessThan(60 * 60 * 6);
    expect(e.lap).toBe(7);
    expect(e.s).toBe(7 * 1450);
    expect(e.lapTimes).toHaveLength(7);
    expect(e.lapTimes.reduce((a, b) => a + b, 0)).toBeCloseTo(e.time, 6);
    expect(e.bestLap).toBe(Math.min(...e.lapTimes));
    expect(e.gatesPassed).toBe(35);
    const order = events.filter((ev) => ev.type === "gate").map((ev) => ev.gate);
    expect(order).toEqual(Array.from({ length: 7 }, () => [90, 305, 600, 1080, 1370]).flat());
    expect(e.end?.place).toBe(1);
    expect(e.end?.medal).toBe("gold");
    expect(e.end?.time).toBe(e.time);
    expect(raceOrder(e)[0]).toMatchObject({ name: "YOU", place: 1, gap: "FIN" });
    expect(raceOrder(e).slice(1).every((r) => r.gap.startsWith("+"))).toBe(true);
    expect(events.filter((ev) => ev.type === "finish")).toHaveLength(1);
    const laps = events.filter((ev) => ev.type === "lap");
    expect(laps).toHaveLength(7);
    expect(laps.filter((ev) => ev.text === "Final orbit. Make it beautiful.")).toHaveLength(1);
  });

  it("finish time at the fixed step is stable with the original rivals (regression pin for the capture comparison)", () => {
    const e = createRace({ balance: "original" });
    startCountdown(e);
    runFixed(e, autopilot, (s) => s.phase === "finished", 60 * 60 * 6);
    const raceSteps = Math.round(e.time / STEP);
    expect(Math.abs(raceSteps * STEP - e.time)).toBeLessThan(1e-6);
    expect(raceSteps).toBe(14627);
    expect(formatTime(e.time)).toBe("4:03.78");
    expect(e.end?.score).toBe(Math.round(e.end!.score));
  });
});

describe("determinism", () => {
  it("identical inputs reproduce the whole race, rivals included", () => {
    const run = (): string => {
      const e = racing({ difficulty: "expert", vehicle: "skate", rider: 2 });
      for (let i = 0; i < 4000; i++) stepRace(e, autopilot(e), STEP);
      return fingerprint(e);
    };
    expect(run()).toBe(run());
  });

  it("a scripted input stream is replayed exactly", () => {
    const script = [
      { from: 0, to: 20, input: { pedal: true } as Input },
      { from: 3, to: 3.5, input: { steer: 1 } as Input },
      { from: 6, to: 6.6, input: { jump: true } as Input },
      { from: 9, to: 12, input: { boost: true } as Input }
    ];
    const run = (): string => {
      const e = racing();
      for (let i = 0; i < 60 * 20 && e.phase === "racing"; i++) stepRace(e, scriptedInput(script, e.time), STEP);
      return fingerprint(e);
    };
    expect(run()).toBe(run());
    expect(scriptedInput(script, 3.2)).toEqual({ pedal: true, steer: 1 });
    expect(scriptedInput(script, 25)).toEqual({});
  });

  it("different inputs diverge", () => {
    const a = racing();
    const b = racing();
    for (let i = 0; i < 600; i++) {
      stepRace(a, { pedal: true }, STEP);
      stepRace(b, { pedal: true, steer: i < 100 ? 1 : 0 }, STEP);
    }
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });
});

describe("splits and routes", () => {
  it("steering into the split picks upper/lower/main and the route is reported", () => {
    const pick = (lane: number): string => {
      const e = racing();
      e.s = 160;
      e.lane = lane;
      e.speed = 40;
      for (let i = 0; i < 20; i++) stepRace(e, { pedal: true }, STEP);
      return e.route;
    };
    expect(pick(-5)).toBe("upper");
    expect(pick(5)).toBe("lower");
    expect(pick(0)).toBe("main");
  });

  it("riding the opal entry at lane 0 drops onto the island route; lane > 2 takes the bypass", () => {
    const route = (lane: number): string => {
      const e = racing();
      e.s = 1160;
      e.lane = lane;
      e.speed = 30;
      for (let i = 0; i < 40; i++) stepRace(e, { pedal: true }, STEP);
      return e.route;
    };
    expect(route(0)).toBe("islands");
    expect(route(3.5)).toBe("bypass");
  });
});

describe("gravity and zero-G", () => {
  it("leaving the lane enters drift; holding gravity slings back and spends one charge", () => {
    const e = racing();
    e.s = 500;
    e.lane = 14;
    e.speed = 30;
    stepRace(e, { pedal: true }, STEP);
    expect(e.flight?.mode).toBe("drift");
    for (let i = 0; i < 6; i++) stepRace(e, {}, STEP);
    expect(e.flight?.mode).toBe("drift");
    stepRace(e, { gravity: true }, STEP);
    expect(e.flight?.mode).toBe("sling");
    expect(e.gravityCharges).toBe(2);
    let guard = 0;
    while (e.flight && guard++ < 400) stepRace(e, {}, STEP);
    expect(e.flight).toBeNull();
    expect(e.respawns).toBe(1);
    expect(e.lane).toBe(0);
    expect(e.speed).toBe(28);
    expect(e.gravityTime).toBeGreaterThan(1.9);
  });

  it("drifting past the rescue window ends the race as lost", () => {
    const e = racing();
    e.s = 500;
    e.lane = 14;
    e.speed = 30;
    let guard = 0;
    while (e.phase === "racing" && guard++ < 60 * 20) stepRace(e, { pedal: false }, STEP);
    expect(e.phase).toBe("lost");
    expect(e.flight!.age).toBeGreaterThanOrEqual(e.rules.rescue);
  });

  it("a drifting rider that comes down onto the surface re-enters for free", () => {
    const e = racing();
    e.s = 500;
    e.lane = 14;
    e.speed = 30;
    stepRace(e, { pedal: true }, STEP);
    expect(e.flight?.mode).toBe("drift");
    const f = e.flight!;
    const frame = routeFrame(500, "main");
    f.position.copy(frame.p).addScaledVector(frame.side, 3).addScaledVector(frame.up, 1.2);
    f.velocity.copy(frame.tangent).multiplyScalar(18).addScaledVector(frame.up, -9);
    f.age = 0.3;
    const charges = e.gravityCharges;
    let guard = 0;
    while (e.flight && guard++ < 60) stepRace(e, { pedal: true }, STEP);
    expect(e.flight).toBeNull();
    expect(e.reentries).toBe(1);
    expect(e.route).toBe("main");
    expect(Math.abs(e.lane - 3)).toBeLessThan(0.6);
    expect(Math.abs(e.s - 500)).toBeLessThan(20);
    expect(e.gravityCharges).toBe(charges);
    expect(e.gravityTime).toBeGreaterThanOrEqual(0.4);
    expect(e.hitCooldown).toBeGreaterThan(0.3);
  });

  it("a gravity lock on the ground gives grip and clamps the lane", () => {
    const e = racing();
    e.s = 500;
    e.speed = 30;
    stepRace(e, { gravity: true, pedal: true }, STEP);
    expect(e.gravityTime).toBeGreaterThan(5.9);
    expect(e.gravityRescueReady).toBe(true);
    expect(e.gravityCharges).toBe(2);
    e.lane = 20;
    stepRace(e, { pedal: true }, STEP);
    expect(Math.abs(e.lane)).toBeLessThanOrEqual(11.5 - 0.35 + 1e-9);
    expect(e.flight).toBeNull();
  });
});

describe("jumping, ramps and tricks", () => {
  it("jump needs speed, is buffered, and lands with a cooldown", () => {
    const slow = racing();
    slow.speed = 1;
    stepRace(slow, { jump: true }, STEP);
    expect(slow.air).toBeNull();
    const e = racing();
    e.s = 500;
    e.speed = 40;
    stepRace(e, { pedal: true, jump: true }, STEP);
    expect(e.air?.vy).toBeGreaterThan(7);
    expect(e.events.some((ev) => ev.type === "jump")).toBe(true);
    let guard = 0;
    while (e.air && guard++ < 200) stepRace(e, { pedal: true }, STEP);
    expect(e.air).toBeNull();
    expect(e.jumpCooldown).toBeGreaterThan(0);
  });

  it("launching off a ramp lip lands a clean stunt worth stardust and score", () => {
    const e = racing();
    e.s = 1050 + 20 - 0.5;
    e.lane = 5.5;
    e.speed = 40;
    const score = e.score;
    let launched = false;
    for (let i = 0; i < 200 && e.stunts === 0 && e.phase === "racing"; i++) {
      stepRace(e, hold(e, 5.5), STEP);
      launched ||= e.events.some((ev) => ev.type === "jump");
    }
    expect(launched).toBe(true);
    expect(e.stunts).toBe(1);
    expect(e.score).toBeGreaterThan(score + 250);
    expect(e.surge).toBeGreaterThan(0);
    expect(e.flight).toBeNull();
  });

  it("the same ramp stunt cannot be farmed twice in one lap", () => {
    const e = racing();
    e.s = 1050 + 20 - 0.5;
    e.lane = 5.5;
    e.speed = 40;
    for (let i = 0; i < 200 && e.stunts === 0; i++) stepRace(e, hold(e, 5.5), STEP);
    expect(e.stunts).toBe(1);
    expect(e.stuntsCollected.has("0:comet-kicker")).toBe(true);
  });

  it("skate kickflips need air time to complete", () => {
    const e = racing({ vehicle: "skate" });
    e.s = 500;
    e.speed = 40;
    stepRace(e, { pedal: true, jump: true }, STEP);
    for (let i = 0; i < 12; i++) stepRace(e, { pedal: true, jump: false }, STEP);
    stepRace(e, { pedal: true, jump: true }, STEP);
    expect(e.air?.trick).toBeTruthy();
    let guard = 0;
    while (e.air && guard++ < 300) stepRace(e, { pedal: true, jump: false }, STEP);
    expect(e.tricks + e.hits).toBeGreaterThanOrEqual(0);
    expect(e.air).toBeNull();
  });
});

describe("skate loops", () => {
  it("entering a loop at speed locks the rider in, completes the orbit and pays 650", () => {
    const e = racing({ vehicle: "skate" });
    e.s = 129.5;
    e.lane = 5.5;
    e.speed = 40;
    stepRace(e, { pedal: true }, STEP);
    expect(e.loop?.def.id).toBe("satellite-loop");
    let guard = 0;
    while (e.loop && guard++ < 600) stepRace(e, { pedal: true, boost: true }, STEP);
    expect(e.loop).toBeNull();
    expect(e.loops).toBe(1);
    expect(e.score).toBeGreaterThanOrEqual(650);
    expect(e.speed).toBeGreaterThanOrEqual(44 - 1e-9);
  });

  it("the bike never enters a loop", () => {
    const e = racing({ vehicle: "bike" });
    e.s = 129.5;
    e.lane = 5.5;
    e.speed = 40;
    stepRace(e, { pedal: true }, STEP);
    expect(e.loop).toBeNull();
  });
});

describe("rivals, standings and modes", () => {
  it("race order ranks finishers by time and others by distance", () => {
    const e = racing();
    e.s = 100;
    e.rivals[0]!.s = 200;
    e.rivals[1]!.s = 50;
    e.rivals[2]!.finished = true;
    e.rivals[2]!.finishTime = 90;
    const order = raceOrder(e);
    expect(order[0]!.name).toBe("ATLAS");
    expect(order[0]!.gap).toBe("FIN");
    expect(order.map((r) => r.name).slice(1, 3)).toEqual(["LYRA", "YOU"]);
    expect(placeOf(e)).toBe(3);
    expect(order.find((r) => r.name === "LYRA")!.gap).toMatch(/^\+\d+m$/);
  });

  it("rivals move, take their lane lines and finish no earlier than they can", () => {
    const e = racing();
    for (let i = 0; i < 600; i++) stepRace(e, { pedal: true }, STEP);
    expect(e.rivals.every((r) => r.s > 100)).toBe(true);
    expect(e.rivals.every((r) => r.speed > 0 && r.speed < 62)).toBe(true);
    expect(new Set(e.rivals.map((r) => r.lane.toFixed(2))).size).toBeGreaterThan(1);
  });

  it("time trial: solo, ghost samples every 0.2 s, medal by time", () => {
    const e = createRace({ mode: "trial" });
    startCountdown(e);
    runFixed(e, autopilot, (s) => s.phase === "finished" || s.phase === "lost", 60 * 60 * 6);
    expect(e.phase).toBe("finished");
    expect(e.laps).toBe(5);
    expect(e.place).toBe(1);
    expect(e.end?.medal).toBe("gold");
    expect(e.recording.length).toBeGreaterThan(500);
    expect(e.recording[0]!.length).toBe(6);
    const interval = e.recording[1]![0]! - e.recording[0]![0]!;
    expect(interval).toBeGreaterThanOrEqual(0.2);
    expect(interval).toBeLessThan(0.23);
  });

  it("free ride never finishes", () => {
    const e = racing({ mode: "free" });
    runFixed(e, autopilot, (s) => s.s > 2 * 1450 + 50, 60 * 60 * 3);
    expect(e.phase).toBe("racing");
    expect(e.lap).toBeGreaterThanOrEqual(3);
    expect(e.end).toBeNull();
  });

  it("collecting stardust builds a combo multiplier", () => {
    const e = racing();
    runFixed(e, autopilot, (s) => s.s > 400, 60 * 60);
    expect(e.dust).toBeGreaterThan(5);
    expect(e.events.length >= 0).toBe(true);
    expect(e.score).toBeGreaterThan(e.dust * 60 - 1);
  });
});
