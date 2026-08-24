/**
 * Pulse Tunnel unit proof PT-11 — scheduler math, drift flip, pattern determinism.
 *
 * These tests drive the route's pure systems (beat-clock, chart, gates, player,
 * style) against fake clocks. They re-derive the music arrangement numbers from
 * scripts/build-music.mjs's contract (BPM 120, 90 s, four sections) so any drift
 * between the stems and the scheduler fails here first.
 */
import { describe, expect, it } from "vitest";
import {
  PULSE_BEAT_SECONDS,
  PULSE_DRIFT_CHECKS_TO_FLIP,
  PULSE_DRIFT_TOLERANCE_MS,
  PULSE_RUN_SECONDS,
  PULSE_TOTAL_BEATS,
  createBeatClock,
  pulseSectionAtBeat,
  pulseTimeForBeat
} from "../../../apps/showcase-pulse-tunnel/src/beat-clock";
import { buildPulseChart, pulseChartSectionSummary } from "../../../apps/showcase-pulse-tunnel/src/patterns";
import {
  PULSE_GATE_SPEED,
  PULSE_PLAYER_Z,
  createGateSystem,
  pulseGateGeometry
} from "../../../apps/showcase-pulse-tunnel/src/gates";
import {
  PULSE_JUMP_APEX,
  PULSE_LANE_SWITCH_BUFFER_MS,
  PULSE_SLIDE_SECONDS,
  createPulsePlayer
} from "../../../apps/showcase-pulse-tunnel/src/player";
import {
  PULSE_CRUISE_SPEED,
  PULSE_GRAZE_DECAY_PER_SECOND,
  PULSE_GRAZE_IDLE_SECONDS,
  PULSE_MAX_GRAZE_HEAT,
  createPulseStyleSystem,
  pulseDecayedHeat,
  pulseHeatAfterGraze,
  pulseMultiplierForHeat
} from "../../../apps/showcase-pulse-tunnel/src/style";

interface FakeClocks {
  audio: number;
  frame: number;
}

function createFakeBeatClock(clocks: FakeClocks, options?: { injectDriftMs?: () => number; onBeat?: (beat: number) => void }) {
  const emittedBeats: number[] = [];
  const clock = createBeatClock({
    getAudioTime: () => clocks.audio,
    getFrameTime: () => clocks.frame,
    injectDriftMs: options?.injectDriftMs,
    onBeat: (beat) => {
      emittedBeats.push(beat);
      options?.onBeat?.(beat);
    }
  });
  return { clock, emittedBeats };
}

describe("pulse tunnel music/scheduler contract", () => {
  it("derives 180 beats from a 90 s run at BPM 120", () => {
    expect(PULSE_BEAT_SECONDS).toBeCloseTo(0.5, 10);
    expect(PULSE_TOTAL_BEATS).toBe(180);
    expect(PULSE_RUN_SECONDS).toBe(180 * PULSE_BEAT_SECONDS);
    expect(pulseTimeForBeat(45)).toBeCloseTo(22.5, 10);
  });

  it("maps section boundaries onto the authored stem sections", () => {
    expect(pulseSectionAtBeat(0).id).toBe("intro");
    expect(pulseSectionAtBeat(31).id).toBe("intro");
    expect(pulseSectionAtBeat(32).id).toBe("build");
    expect(pulseSectionAtBeat(79).id).toBe("build");
    expect(pulseSectionAtBeat(80).id).toBe("drop");
    expect(pulseSectionAtBeat(127).id).toBe("drop");
    expect(pulseSectionAtBeat(128).id).toBe("finale");
    expect(pulseSectionAtBeat(PULSE_TOTAL_BEATS - 1).id).toBe("finale");
  });
});

describe("beat clock", () => {
  it("emits each integer beat exactly once while the audio clock advances", () => {
    const clocks: FakeClocks = { audio: 10, frame: 100 };
    const { clock, emittedBeats } = createFakeBeatClock(clocks);
    clock.start(clocks.audio);
    // First frame lands inside beat 0.
    clocks.frame += 0.1;
    clock.update();
    expect(emittedBeats).toEqual([0]);
    // Jump straight across three beats in one long frame.
    clocks.audio += PULSE_BEAT_SECONDS * 3 + 0.01;
    clocks.frame += PULSE_BEAT_SECONDS * 3 + 0.01;
    clock.update();
    expect(emittedBeats).toEqual([0, 1, 2, 3]);
    // A sub-beat frame emits nothing new.
    clocks.audio += 0.2;
    clocks.frame += 0.2;
    clock.update();
    expect(emittedBeats).toEqual([0, 1, 2, 3]);
  });

  it("stays in beat mode while drift stays inside the published tolerance", () => {
    const clocks: FakeClocks = { audio: 5, frame: 50 };
    const { clock } = createFakeBeatClock(clocks);
    clock.start(clocks.audio);
    for (let second = 1; second <= 6; second += 1) {
      // The monitor compares CUMULATIVE elapsed clocks; keep total skew at 5 ms/step,
      // so after six checks drift is 30 ms - inside the +/-80 ms tolerance.
      clocks.frame += 1;
      clocks.audio += 0.995;
      clock.update();
    }
    expect(clock.mode).toBe("beat");
    expect(clock.flipped).toBe(false);
    expect(Math.abs(clock.sample().driftMs)).toBeLessThan(PULSE_DRIFT_TOLERANCE_MS);
  });

  it("flips permanently to pattern mode after three consecutive out-of-tolerance checks", () => {
    const clocks: FakeClocks = { audio: 5, frame: 50 };
    let injection = 0;
    const { clock } = createFakeBeatClock(clocks, { injectDriftMs: () => injection });
    clock.start(clocks.audio);
    injection = PULSE_DRIFT_TOLERANCE_MS + 25;
    clocks.frame += 1;
    clock.update();
    expect(clock.mode).toBe("beat");
    clocks.frame += 1;
    clock.update();
    expect(clock.mode).toBe("beat");
    clocks.frame += 1;
    clock.update();
    expect(clock.mode).toBe("pattern");
    expect(clock.flipped).toBe(true);
    expect(clock.sample().flippedAtTime).not.toBeNull();

    // A recovery never un-flips the run.
    injection = 0;
    clocks.frame += 1;
    clocks.audio += 1;
    clock.update();
    expect(clock.mode).toBe("pattern");
    expect(PULSE_DRIFT_CHECKS_TO_FLIP).toBe(3);
  });

  it("a good reading between failures resets the consecutive counter", () => {
    const clocks: FakeClocks = { audio: 5, frame: 50 };
    let injection = 90;
    const { clock } = createFakeBeatClock(clocks, { injectDriftMs: () => injection });
    clock.start(clocks.audio);
    // Advance both clocks equally; only the injection creates fault readings.
    const tick = () => {
      clocks.frame += 1;
      clocks.audio += 1;
      clock.update();
    };
    tick();
    tick();
    expect(clock.sample().driftChecksFailed).toBe(2);
    injection = 0;
    tick();
    expect(clock.sample().driftChecksFailed).toBe(0);
    expect(clock.mode).toBe("beat");
    injection = 95;
    tick();
    tick();
    // Only two consecutive failures since the reset -> still beat mode.
    expect(clock.mode).toBe("beat");
    tick();
    expect(clock.mode).toBe("pattern");
  });

  it("pattern mode continues scheduling without a jump at flip time", () => {
    const clocks: FakeClocks = { audio: 5, frame: 50 };
    // Constant out-of-tolerance fault: the flip must land on the third check.
    const injection = PULSE_DRIFT_TOLERANCE_MS + 40;
    const { clock } = createFakeBeatClock(clocks, { injectDriftMs: () => injection });
    clock.start(clocks.audio);
    let stepAcrossFlip = 0;
    for (let index = 0; index < 12 && !clock.flipped; index += 1) {
      const beforeTime = clock.time();
      clocks.frame += 0.4;
      clocks.audio += 0.9; // audio runs away from frames
      clock.update();
      if (!clock.flipped) continue;
      // The update that flips seeds pattern time with the live audio scheduler
      // time, so the scheduler may only advance by that single frame's audio delta.
      stepAcrossFlip = clock.time() - beforeTime;
    }
    expect(clock.mode).toBe("pattern");
    expect(stepAcrossFlip).toBeGreaterThan(0);
    expect(stepAcrossFlip).toBeLessThanOrEqual(1.0);
    const patternTimeAtFlip = clock.time();
    clocks.frame += 0.25;
    clock.update();
    // From here on, pattern mode tracks the FRAME accumulator.
    expect(clock.time()).toBeCloseTo(patternTimeAtFlip + 0.25, 5);
  });

  it("start(null) means honest permanent pattern mode (no usable audio clock)", () => {
    const clocks: FakeClocks = { audio: 0, frame: 7 };
    const { clock } = createFakeBeatClock(clocks);
    clock.start(null);
    expect(clock.mode).toBe("pattern");
    expect(clock.flipped).toBe(true);
    clocks.frame += 1.5;
    clock.update();
    expect(clock.time()).toBeCloseTo(1.5, 5);
  });
});

describe("authored chart", () => {
  it("is byte-deterministic across builds", () => {
    expect(buildPulseChart()).toEqual(buildPulseChart());
  });

  it("only schedules resolvable gates inside the run", () => {
    const chart = buildPulseChart();
    expect(chart.length).toBeGreaterThan(24);
    for (const entry of chart) {
      expect(entry.beat).toBeGreaterThan(0);
      expect(entry.beat).toBeLessThan(PULSE_TOTAL_BEATS);
      expect(["wall", "low", "high", "pylon"]).toContain(entry.kind);
      expect(entry.lane).toBeGreaterThanOrEqual(0);
      expect(entry.lane).toBeLessThanOrEqual(2);
    }
    for (let index = 1; index < chart.length; index += 1) {
      expect(chart[index].beat).toBeGreaterThanOrEqual(chart[index - 1].beat);
    }
  });

  it("covers every section and escalates density into the drop", () => {
    const summary = pulseChartSectionSummary();
    const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(buildPulseChart().length);
    expect(summary.intro).toBeGreaterThan(0);
    expect(summary.build).toBeGreaterThan(summary.intro);
    expect(summary.drop).toBeGreaterThanOrEqual(summary.build);
    expect(summary.finale).toBeGreaterThan(0);
  });
});

describe("gate geometry and pass evaluation", () => {
  it("low gates span the tunnel below jump clearance and high gates hang above slide height", () => {
    const low = pulseGateGeometry({ kind: "low", lane: 1 }, 0);
    expect(low.centerX).toBe(0);
    expect(low.bottomY).toBe(0);
    expect(low.topY).toBeCloseTo(0.34, 5);
    const high = pulseGateGeometry({ kind: "high", lane: 1 }, 0);
    expect(high.bottomY).toBeGreaterThanOrEqual(0.35);
    expect(high.topY).toBeGreaterThan(high.bottomY);
  });

  it("walls sit on their lane center and pylons sweep between their two lanes", () => {
    const wall = pulseGateGeometry({ kind: "wall", lane: 0 }, 0);
    expect(wall.centerX).toBeCloseTo(-0.75, 5);
    // Cosine out-and-back: from at t=0, far lane reached at the half-period,
    // midpoint on both legs, back home after one full second.
    const pylonFrom = pulseGateGeometry({ kind: "pylon", lane: 0, moveTo: 2 }, 0);
    expect(pylonFrom.centerX).toBeCloseTo(-0.75, 5);
    const pylonQuarter = pulseGateGeometry({ kind: "pylon", lane: 0, moveTo: 2 }, 0.25);
    expect(pylonQuarter.centerX).toBeCloseTo(0, 5);
    const pylonFar = pulseGateGeometry({ kind: "pylon", lane: 0, moveTo: 2 }, 0.5);
    expect(pylonFar.centerX).toBeCloseTo(0.75, 5);
    const pylonHome = pulseGateGeometry({ kind: "pylon", lane: 0, moveTo: 2 }, 1);
    expect(pylonHome.centerX).toBeCloseTo(-0.75, 5);
  });

  function driveGateSystem(playerPose: { x: number; y: number; colliderTop: number }) {
    let schedulerTime = 0;
    let audioElapsed = 0;
    const passes: { type: string; missDistance: number; scheduledAudioTime: number; arrivedAudioTime: number }[] = [];
    const system = createGateSystem({
      chart: [{ id: "g-low", beat: 8, kind: "low", lane: 1 }],
      getSchedulerTime: () => schedulerTime,
      getAudioElapsed: () => audioElapsed,
      getPlayer: () => ({ ...playerPose, invulnRemaining: 0 }),
      onPass: (event) =>
        passes.push({
          type: event.type,
          missDistance: event.missDistance,
          scheduledAudioTime: event.scheduledAudioTime,
          arrivedAudioTime: event.arrivedAudioTime
        })
    });
    const advance = (seconds: number) => {
      const stepCount = Math.max(8, Math.ceil(seconds * 60));
      for (let index = 0; index < stepCount; index += 1) {
        schedulerTime += seconds / stepCount;
        audioElapsed = schedulerTime;
        system.update(seconds / stepCount);
      }
    };
    return { system, advance, passes };
  }

  it("spawns on schedule and reports a clean pass with audio timestamps", () => {
    // Airborne above the low gate's top edge with margin beyond the graze window.
    const driver = driveGateSystem({ x: 0, y: 0.8, colliderTop: 0.72 + 0.8 });
    driver.advance(3);
    expect(driver.system.activeGates()).toHaveLength(1); // spawned inside travel window
    expect(driver.system.pendingCount()).toBe(0);
    expect(driver.system.preFlashActive()).toBe(false); // still far up-tunnel
    driver.advance((4 - 3) + (PULSE_PLAYER_Z + 13.5) / PULSE_GATE_SPEED);
    expect(driver.passes).toHaveLength(1);
    expect(driver.passes[0].type).toBe("pass");
    expect(driver.passes[0].scheduledAudioTime).toBeCloseTo(4, 5);
    expect(Math.abs(driver.passes[0].arrivedAudioTime - 4)).toBeLessThan(0.2);
    expect(driver.system.preFlashActive()).toBe(false);
  });

  it("reports a collision for a grounded player inside a low gate and a graze near it", () => {
    const grounded = driveGateSystem({ x: 0, y: 0, colliderTop: 0.72 });
    grounded.advance((4 - (PULSE_PLAYER_Z + 13.5) / PULSE_GATE_SPEED) + (PULSE_PLAYER_Z + 13.5) / PULSE_GATE_SPEED + 0.5);
    expect(grounded.passes).toHaveLength(1);
    expect(grounded.passes[0].type).toBe("collision");
    expect(grounded.passes[0].missDistance).toBe(0);

    const nearMiss = driveGateSystem({ x: 0, y: 0.5, colliderTop: 0.72 + 0.5 });
    nearMiss.advance(5);
    expect(nearMiss.passes).toHaveLength(1);
    expect(nearMiss.passes[0].type).toBe("graze");
    expect(nearMiss.passes[0].missDistance).toBeGreaterThan(0);
    expect(nearMiss.passes[0].missDistance).toBeLessThanOrEqual(0.35);
  });

  it("flags pre-flash inside the half-second window before arrival", () => {
    let schedulerTime = 0;
    let audioElapsed = 0;
    const passes: unknown[] = [];
    const system = createGateSystem({
      chart: [{ id: "g-wall", beat: 20, kind: "wall", lane: 2 }],
      getSchedulerTime: () => schedulerTime,
      getAudioElapsed: () => audioElapsed,
      // Standing in the wall's lane guarantees a collision at the pass moment.
      getPlayer: () => ({ x: 0.75, y: 0, colliderTop: 0.72, invulnRemaining: 0 }),
      onPass: (event) => passes.push(event)
    });
    const arrivalSeconds = 20 * PULSE_BEAT_SECONDS;
    const travelSeconds = (PULSE_PLAYER_Z + 13.5) / PULSE_GATE_SPEED;
    // Step the sim forward until just after spawn: far away -> no flash yet.
    while (schedulerTime < arrivalSeconds - travelSeconds + 0.05) {
      schedulerTime += 1 / 60;
      audioElapsed = schedulerTime;
      system.update(1 / 60);
    }
    expect(system.activeGates()).toHaveLength(1);
    expect(system.preFlashActive()).toBe(false);
    // Keep stepping until 0.3 s of travel remain -> flash window open.
    while ((PULSE_PLAYER_Z - system.activeGates()[0].z) / PULSE_GATE_SPEED > 0.3) {
      schedulerTime += 1 / 60;
      audioElapsed = schedulerTime;
      system.update(1 / 60);
    }
    expect(system.preFlashActive()).toBe(true);
    expect(passes).toHaveLength(0);
  });
});

describe("player kinematics", () => {
  it("buffers a lane switch pressed slightly early and clamps at tunnel edges", () => {
    const playerSystem = createPulsePlayer();
    const t0 = 1000;
    playerSystem.step(0.016, t0, { left: false, right: true, jump: false, slide: false });
    expect(playerSystem.snapshot().targetLane).toBe(2);
    // Pressing right again at the right edge must not leave the tunnel.
    playerSystem.step(0.016, t0 + 200, { left: false, right: true, jump: false, slide: false });
    expect(playerSystem.snapshot().targetLane).toBe(2);
    // Buffered left arrives within the 120 ms window and resolves on the next step.
    playerSystem.step(0.016, t0 + 260, { left: true, right: false, jump: false, slide: false });
    expect(playerSystem.snapshot().targetLane).toBe(1);
  });

  it("expires intents older than the published 120 ms buffer", () => {
    expect(PULSE_LANE_SWITCH_BUFFER_MS).toBe(120);
    const playerSystem = createPulsePlayer();
    playerSystem.step(0.016, 0, { left: false, right: true, jump: false, slide: false });
    // Wait longer than the buffer without new input: nothing queued anymore.
    playerSystem.step(0.016, 500, { left: false, right: false, jump: false, slide: false });
    expect(playerSystem.snapshot().targetLane).toBe(2);
  });

  it("jump reaches its authored apex and returns to ground; slide drops collider height", () => {
    expect(PULSE_JUMP_APEX).toBeGreaterThan(0.34); // clears the low gate
    const playerSystem = createPulsePlayer();
    let now = 0;
    let maxY = 0;
    let landed = false;
    playerSystem.step(0.016, now, { left: false, right: false, jump: true, slide: false });
    for (let index = 0; index < 80 && !landed; index += 1) {
      now += 16;
      const state = playerSystem.step(0.016, now, { left: false, right: false, jump: false, slide: false });
      maxY = Math.max(maxY, state.y);
      if (index > 5 && !state.airborne) landed = true;
    }
    expect(maxY).toBeGreaterThan(PULSE_JUMP_APEX * 0.85);
    expect(maxY).toBeLessThan(PULSE_JUMP_APEX * 1.15);
    expect(landed).toBe(true);

    const slider = createPulsePlayer();
    const slidState = slider.step(0.016, 0, { left: false, right: false, jump: false, slide: true });
    expect(slidState.sliding).toBe(true);
    expect(slidState.colliderTop).toBeLessThan(0.34);
    // Slide expires.
    let later = slidState;
    for (let index = 0; index < Math.ceil(PULSE_SLIDE_SECONDS / 0.016) + 4; index += 1) {
      later = slider.step(0.016, (index + 1) * 16, { left: false, right: false, jump: false, slide: false });
    }
    expect(later.sliding).toBe(false);
    expect(later.colliderTop).toBeGreaterThan(0.6);
  });
});

describe("style multiplier", () => {
  it("adds heat per graze, caps it, and reads as an x-multiplier", () => {
    expect(pulseMultiplierForHeat(0)).toBe(1);
    expect(pulseMultiplierForHeat(0.5)).toBe(1.5);
    expect(pulseHeatAfterGraze(PULSE_MAX_GRAZE_HEAT)).toBe(PULSE_MAX_GRAZE_HEAT);
    const style = createPulseStyleSystem();
    style.graze();
    style.graze();
    expect(style.snapshot().multiplier).toBe(2);
  });

  it("holds heat for the idle window then decays linearly to zero", () => {
    expect(PULSE_GRAZE_IDLE_SECONDS).toBe(3);
    expect(PULSE_GRAZE_DECAY_PER_SECOND).toBeCloseTo(0.5, 10);
    expect(pulseDecayedHeat(2, 2.9, 0.5)).toBe(2);
    expect(pulseDecayedHeat(2, 3.1, 0.5)).toBeCloseTo(1.75, 5);
    expect(pulseDecayedHeat(0.2, 9, 10)).toBe(0);
  });

  it("accrues score as distance times the live multiplier", () => {
    const style = createPulseStyleSystem();
    const first = style.step(1);
    expect(first.distance).toBeCloseTo(PULSE_CRUISE_SPEED, 5);
    expect(first.score).toBeCloseTo(PULSE_CRUISE_SPEED * 1, 5);
    style.graze();
    const second = style.step(1);
    expect(second.multiplier).toBe(1.5);
    expect(second.score).toBeCloseTo(first.score + PULSE_CRUISE_SPEED * 1.5, 5);
  });
});
