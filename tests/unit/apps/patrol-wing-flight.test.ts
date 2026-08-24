import { describe, expect, it } from "vitest";
import {
  FLIGHT_CONSTANTS,
  FLIGHT_DT,
  FlightModel,
  NEUTRAL_INPUT,
  type FlightInput
} from "../../../apps/showcase-patrol-wing/src/flight";
import {
  createArenaPhysics,
  islandHeight,
  PAD_CENTER,
  PAD_HEADING_YAW,
  PAD_RADIUS,
  PAD_Y,
  RING_COUNT,
  RING_GATES,
  terrainSurface
} from "../../../apps/showcase-patrol-wing/src/sky";
import {
  gradePatrol,
  gradeRank,
  RingTracker,
  ringHalfExtent,
  WAVE_TRIGGERS
} from "../../../apps/showcase-patrol-wing/src/patrol";
import { encodeControlFrame } from "../../../apps/showcase-patrol-wing/src/weapons";
import { GhostPlayer, GhostRecorder } from "../../../apps/showcase-patrol-wing/src/ghost";

/**
 * PRD definition-of-done pins for Patrol Wing flight/patrol (PW-13):
 * - authored flight determinism: identical input scripts -> identical hashes;
 * - throttle/pitch inputs visibly change position and heading;
 * - stall and crash thresholds behave as authored;
 * - ring ordering + skipped-ring invalidation;
 * - grading math;
 * - sensor layer: once-per-entry ring events, pad sensor, orb hit;
 * - ghost replay reproduces the recorded trajectory hash.
 */

const LANDING = { padCenter: PAD_CENTER, padY: PAD_Y, padRadius: PAD_RADIUS };

function padSpawn(): FlightModel {
  return new FlightModel({
    position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]],
    headingYaw: PAD_HEADING_YAW
  });
}

type ScriptFrame = Partial<FlightInput>;

function frame(overrides: ScriptFrame = {}): FlightInput {
  return { ...NEUTRAL_INPUT, ...overrides };
}

/** A deterministic 40 s flight script: takeoff roll, climb, banked turns. */
function patrolScript(): readonly FlightInput[] {
  const script: FlightInput[] = [];
  for (let index = 0; index < 2400; index += 1) {
    const t = index / 60;
    if (t < 2.6) {
      script.push(frame({ throttleUp: true }));
    } else if (t < 6) {
      script.push(frame({ throttleUp: true, pitchUp: true }));
    } else if (t < 10) {
      script.push(frame({ throttleUp: true, rollLeft: true, pitchUp: t < 8 }));
    } else if (t < 16) {
      script.push(frame({ throttleUp: true, rollRight: true, pitchUp: t % 2 < 1 }));
    } else if (t < 22) {
      script.push(frame({ pitchDown: t % 3 < 1 }));
    } else {
      script.push(frame({ yawLeft: t % 4 < 2, throttleUp: t % 5 < 4 }));
    }
  }
  return script;
}

function runScript(script: readonly FlightInput[]): { model: FlightModel; outcome: string } {
  const model = padSpawn();
  let outcome = "none";
  for (const input of script) {
    const result = model.step(input, FLIGHT_DT, terrainSurface, LANDING);
    if (result.outcome !== "none") outcome = result.outcome;
    if (outcome === "crash-terrain" || outcome === "crash-ocean") break;
  }
  return { model, outcome };
}

describe("patrol wing authored flight model", () => {
  it("determinism: identical input scripts produce identical trajectory hashes", () => {
    const script = patrolScript();
    const first = runScript(script);
    const second = runScript(script);
    expect(first.model.trajectoryHash()).toBe(second.model.trajectoryHash());
    expect(first.model.trajectoryFrameCount()).toBeGreaterThan(600);
    // And the two runs agree on the exact final state.
    expect(first.model.position).toEqual(second.model.position);
  });

  it("a different script produces a different hash", () => {
    const base = patrolScript();
    const varied = [...base];
    varied[300] = frame({ throttleUp: true, rollRight: true });
    const a = runScript(base);
    const b = runScript(varied);
    expect(a.model.trajectoryHash()).not.toBe(b.model.trajectoryHash());
  });

  it("throttle builds speed, the plane lifts off, and flight position changes", () => {
    const { model, outcome } = runScript(patrolScript().slice(0, 600));
    expect(outcome).not.toBe("crash-terrain");
    expect(model.grounded).toBe("airborne");
    expect(model.speed).toBeGreaterThan(FLIGHT_CONSTANTS.takeoffSpeed);
    expect(model.position[0]).toBeLessThan(PAD_CENTER[0] - 2); // departed west
    expect(model.position[1]).toBeGreaterThan(PAD_Y + 1); // climbed
  });

  it("pitch and roll inputs visibly change heading and bank", () => {
    const climb = runScript(patrolScript().slice(0, 450)).model;
    expect(climb.forward[1]).toBeGreaterThan(0.05); // nose above horizon from S climbs
    const banking = runScript(patrolScript().slice(0, 700)).model;
    expect(Math.abs(banking.bank)).toBeGreaterThan(0.2); // A/D rolls
    // Heading measurably changes once the script banks the plane around.
    const turned = runScript(patrolScript().slice(0, 1300)).model;
    const straight = runScript(patrolScript().slice(0, 260)).model;
    const headingDelta = Math.abs(turned.euler.y - straight.euler.y);
    expect(Math.min(headingDelta, Math.PI * 2 - headingDelta)).toBeGreaterThan(0.15);
  });

  it("soft stall: cutting throttle sinks the nose, dampens controls, and recovers with power", () => {
    const model = padSpawn();
    for (let index = 0; index < 400; index += 1) {
      model.step(frame({ throttleUp: true }), FLIGHT_DT, terrainSurface, LANDING);
    }
    expect(model.grounded).toBe("airborne");
    // Cut power and hold a slight nose-up so the stall develops.
    let stalledAt: number | null = null;
    let climbBeforeStall = 0;
    for (let index = 0; index < 600; index += 1) {
      const before = model.forward[1];
      const result = model.step(frame({ pitchUp: index % 4 < 1 }), FLIGHT_DT, terrainSurface, LANDING);
      if (result.outcome === "crash-terrain" || result.outcome === "crash-ocean") break;
      if (!model.stalled && model.speed < FLIGHT_CONSTANTS.stallSpeed + 1) climbBeforeStall = before;
      if (model.stalled && stalledAt === null) stalledAt = index;
      if (stalledAt !== null && index > stalledAt + 120) break;
    }
    expect(model.stalled || stalledAt !== null).toBe(true);
    if (stalledAt !== null) {
      // The nose drops under stall (authored stallNoseDrop).
      expect(model.forward[1]).toBeLessThan(climbBeforeStall + 0.05);
    }
    // Recovery: full throttle climbs back above the stall band.
    for (let index = 0; index < 600; index += 1) {
      model.step(frame({ throttleUp: true, pitchUp: false }), FLIGHT_DT, terrainSurface, LANDING);
      if (!model.stalled && model.speed > FLIGHT_CONSTANTS.stallRecoverSpeed) break;
    }
    expect(model.stalled).toBe(false);
  });

  it("crash rules: ocean contact and terrain contact are distinct outcomes", () => {
    // Ocean: dive from high altitude far out at sea.
    const ocean = new FlightModel({ position: [40, 18, 60], headingYaw: Math.PI, grounded: "airborne", throttle: 1, speed: 20 });
    let oceanOutcome = "none";
    for (let index = 0; index < 600 && oceanOutcome === "none"; index += 1) {
      oceanOutcome = ocean.step(frame({ pitchDown: true }), FLIGHT_DT, terrainSurface, LANDING).outcome;
    }
    expect(oceanOutcome).toBe("crash-ocean");

    // Terrain: dive into the island peak from above.
    const terrain = new FlightModel({ position: [0, 16, 0], headingYaw: 0, grounded: "airborne", throttle: 1, speed: 14 });
    let terrainOutcome = "none";
    for (let index = 0; index < 600 && terrainOutcome === "none"; index += 1) {
      terrainOutcome = terrain.step(frame({ pitchDown: true }), FLIGHT_DT, terrainSurface, LANDING).outcome;
    }
    expect(terrainOutcome).toBe("crash-terrain");
  });

  it("landing: a slow, wings-level pad approach touches down; a hot approach bounces", () => {
    // Touchdown: creep over the pad below the landing speed, wings level.
    const lander = new FlightModel({ position: [PAD_CENTER[0], PAD_Y + 1.0, PAD_CENTER[2] + 6], headingYaw: Math.PI / 2, grounded: "airborne", throttle: 0.25, speed: 4 });
    let landed = "none";
    for (let index = 0; index < 600 && landed === "none"; index += 1) {
      landed = lander.step(frame({ throttleDown: true }), FLIGHT_DT, terrainSurface, LANDING).outcome;
    }
    expect(landed).toBe("pad-touchdown");

    // Bounce: same geometry but fast and banked.
    const hot = new FlightModel({ position: [PAD_CENTER[0], PAD_Y + 1.0, PAD_CENTER[2] + 6], headingYaw: Math.PI / 2, grounded: "airborne", throttle: 1, speed: 18 });
    let bounced = "none";
    for (let index = 0; index < 240 && bounced === "none"; index += 1) {
      bounced = hot.step(frame({ rollRight: true }), FLIGHT_DT, terrainSurface, LANDING).outcome;
    }
    expect(bounced).toBe("pad-bounce");
  });
});

describe("patrol wing ring ordering and grading", () => {
  it("rings advance in order; skipping marks progress invalid until re-flown", () => {
    const rings = new RingTracker();
    expect(rings.registerEntry(0)).toBe("advanced");
    expect(rings.registerEntry(1)).toBe("advanced");
    expect(rings.validity).toBe(true);
    // Enter ring 3 while ring 2 is unflown.
    expect(rings.registerEntry(3)).toBe("skipped-invalid");
    expect(rings.validity).toBe(false);
    expect(rings.complete).toBe(false);
    // Re-fly the missed ring: validity restores and progress continues.
    expect(rings.registerEntry(2)).toBe("advanced");
    expect(rings.validity).toBe(true);
    // Re-enter ring 3 now that it is the expected ring: it advances.
    expect(rings.registerEntry(3)).toBe("advanced");
    expect(rings.nextRing).toBe(4);
  });

  it("completes only after all six rings in order, and reset restores a fresh course", () => {
    const rings = new RingTracker();
    for (let index = 0; index < RING_COUNT; index += 1) {
      expect(rings.registerEntry(index)).toBe("advanced");
    }
    expect(rings.complete).toBe(true);
    rings.reset();
    expect(rings.complete).toBe(false);
    expect(rings.nextRing).toBe(0);
    expect(rings.validity).toBe(true);
  });

  it("grading math: time + accuracy + hull with A/B/C thresholds", () => {
    const fast = gradePatrol(60, 1, 1);
    expect(fast.grade).toBe("A");
    expect(fast.total).toBeCloseTo(60 + 30 + 30, 1);
    const mid = gradePatrol(95, 0.5, 0.7);
    expect(mid.timeScore).toBeGreaterThan(0);
    expect(mid.accuracyScore).toBeCloseTo(15, 1);
    expect(mid.hullScore).toBeCloseTo(21, 1);
    expect(["B", "C"]).toContain(mid.grade);
    const slow = gradePatrol(150, 0, 0.05);
    expect(slow.grade).toBe("C");
    expect(gradeRank("A")).toBeGreaterThan(gradeRank("B"));
    expect(gradeRank("B")).toBeGreaterThan(gradeRank("C"));
  });

  it("patrol escalation: waves per patrol, tighter rings, faster drones", () => {
    expect(ringHalfExtent(1)).toBeGreaterThan(ringHalfExtent(2));
    expect(ringHalfExtent(2)).toBeGreaterThan(ringHalfExtent(3));
    expect(WAVE_TRIGGERS).toEqual([1, 3, 5]);
  });
});

describe("patrol wing arena sensors (rapier)", () => {
  it("builds on the rapier backend with the expected sensor body count", () => {
    const arena = createArenaPhysics();
    expect(arena.backend).toBe("rapier");
    expect(arena.bodyCount()).toBe(1 + RING_COUNT + 1 + 8);
  });

  it("ring sensors fire exactly once per entry and re-arm after exit", () => {
    const arena = createArenaPhysics();
    const gate = RING_GATES[0]!;
    // Start far away, step once to establish empty state.
    arena.setPlayerPosition([gate.position[0] + 40, gate.position[1], gate.position[2] + 40]);
    arena.step(FLIGHT_DT);
    // Enter the gate.
    arena.setPlayerPosition([gate.position[0], gate.position[1], gate.position[2]]);
    let events = arena.step(FLIGHT_DT);
    expect(events.filter((event) => event.kind === "ring")).toHaveLength(1);
    // Lingering inside must NOT re-fire (once-per-entry arming).
    for (let index = 0; index < 30; index += 1) arena.step(FLIGHT_DT);
    events = arena.step(FLIGHT_DT);
    expect(events.filter((event) => event.kind === "ring")).toHaveLength(0);
    // Leave and re-enter: fires again.
    arena.setPlayerPosition([gate.position[0] + 40, gate.position[1], gate.position[2] + 40]);
    for (let index = 0; index < 5; index += 1) arena.step(FLIGHT_DT);
    arena.setPlayerPosition([gate.position[0], gate.position[1], gate.position[2]]);
    events = arena.step(FLIGHT_DT);
    expect(events.filter((event) => event.kind === "ring")).toHaveLength(1);
    expect(arena.sensorEventCount()).toBeGreaterThanOrEqual(2);
  });

  it("the pad sensor reports entries over the pad", () => {
    const arena = createArenaPhysics();
    arena.setPlayerPosition([PAD_CENTER[0] + 30, PAD_Y + 3, PAD_CENTER[2]]);
    arena.step(FLIGHT_DT);
    arena.setPlayerPosition([PAD_CENTER[0], PAD_Y + 0.8, PAD_CENTER[2]]);
    const events = arena.step(FLIGHT_DT);
    expect(events.some((event) => event.kind === "pad")).toBe(true);
  });

  it("a spawned return-fire orb travels to the player and lands an orb-hit", () => {
    const arena = createArenaPhysics();
    arena.setPlayerPosition([0, 20, 20]);
    arena.step(FLIGHT_DT);
    expect(arena.spawnOrb([0, 20, 2], [0, 20, 20])).toBe(true);
    let hit = false;
    for (let index = 0; index < 120 && !hit; index += 1) {
      const events = arena.step(FLIGHT_DT);
      hit = events.some((event) => event.kind === "orb-hit" && event.other === "player");
    }
    expect(hit).toBe(true);
  });

  it("authored island heights: pad plateau flat, peak above the pad, ocean floor negative", () => {
    expect(Math.abs(islandHeight(PAD_CENTER[0], PAD_CENTER[2]) - PAD_Y)).toBeLessThan(0.05);
    expect(islandHeight(0, 0)).toBeGreaterThan(PAD_Y + 3);
    expect(islandHeight(40, 40)).toBeLessThan(0);
    expect(terrainSurface(40, 40)).toBe(0);
  });
});

describe("patrol wing ghost replay", () => {
  it("recorded script replays to the identical trajectory hash", () => {
    const script = patrolScript().map((input, index) =>
      encodeControlFrame(input, index % 30 === 0)
    );
    const recorder = new GhostRecorder();
    recorder.begin();
    for (const code of script) recorder.record(code);
    recorder.end();
    expect(recorder.frameCount).toBe(script.length);

    const live = padSpawn();
    let liveOutcome = "none";
    for (const code of script) {
      const decoded = decode(code);
      const result = live.step(decoded.input, FLIGHT_DT, terrainSurface, LANDING);
      if (result.outcome !== "none") liveOutcome = result.outcome;
      if (liveOutcome.startsWith("crash")) break;
    }

    const ghost = new GhostPlayer(script, {
      position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]],
      headingYaw: PAD_HEADING_YAW
    });
    ghost.start();
    let running = true;
    while (running) {
      const result = ghost.step(terrainSurface);
      if (result === null) running = false;
    }
    expect(ghost.trajectoryHash()).toBe(live.trajectoryHash());
  });
});

// decode helper mirroring weapons.ts for the ghost test.
function decode(code: number): { input: FlightInput; fire: boolean } {
  return {
    fire: (code & (1 << 8)) !== 0,
    input: {
      pitchUp: (code & (1 << 0)) !== 0,
      pitchDown: (code & (1 << 1)) !== 0,
      rollLeft: (code & (1 << 2)) !== 0,
      rollRight: (code & (1 << 3)) !== 0,
      yawLeft: (code & (1 << 4)) !== 0,
      yawRight: (code & (1 << 5)) !== 0,
      throttleUp: (code & (1 << 6)) !== 0,
      throttleDown: (code & (1 << 7)) !== 0
    }
  };
}
