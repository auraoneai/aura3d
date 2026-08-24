import { describe, expect, it } from "vitest";
import { SIEGE_GOLF_HOLES } from "../../../apps/showcase-siege-golf/src/course";
import { HoleFlow } from "../../../apps/showcase-siege-golf/src/hole-flow";
import { createHoleSimulation } from "../../../apps/showcase-siege-golf/src/structures";
import {
  SIEGE_GOLF_CANONICAL_SOLUTIONS,
  directionForAbsoluteAngle
} from "../../../apps/showcase-siege-golf/src/solutions";
import { ShotController } from "../../../apps/showcase-siege-golf/src/shot";

/**
 * PRD definition-of-done pins for Siege Golf physics:
 * - identical shot inputs reproduce identical outcomes (hash verified);
 * - reset restores a byte-identical body layout;
 * - cup sensors fire exactly once per entry;
 * - every authored hole builds headless on Rapier and stays contained.
 */

function runDriveSequence(holeIndex = 0, steps = 260): string {
  const sim = createHoleSimulation(SIEGE_GOLF_HOLES[holeIndex]!);
  sim.stepFixed(30);
  sim.strike([0, 0, -1], 2.0);
  for (let index = 0; index < steps; index += 1) sim.stepFixed(1);
  return sim.poseHash();
}

describe("siege golf physics determinism", { timeout: 30_000 }, () => {
  it("reproduces identical outcomes for identical shot inputs", () => {
    expect(runDriveSequence()).toBe(runDriveSequence());
  });

  it("diverges when the shot input differs", () => {
    const simA = createHoleSimulation(SIEGE_GOLF_HOLES[0]!);
    const simB = createHoleSimulation(SIEGE_GOLF_HOLES[0]!);
    simA.stepFixed(30);
    simB.stepFixed(30);
    simA.strike([0, 0, -1], 2.0);
    simB.strike([0.35, 0, -1], 1.4);
    for (let index = 0; index < 200; index += 1) {
      simA.stepFixed(1);
      simB.stepFixed(1);
    }
    expect(simA.poseHash()).not.toBe(simB.poseHash());
  });

  it("keeps the world still during an idle window after settling", () => {
    const sim = createHoleSimulation(SIEGE_GOLF_HOLES[0]!);
    sim.stepFixed(90); // stacking transient
    const before = sim.poseHash();
    sim.stepFixed(120); // idle window
    expect(sim.poseHash()).toBe(before);
    expect(sim.activity().settled).toBe(true);
  });
});

describe("siege golf reset integrity", () => {
  it("rebuilds a byte-identical layout from the hole definition", () => {
    const freshHash = createHoleSimulation(SIEGE_GOLF_HOLES[0]!).poseHash();
    const rebuiltHash = createHoleSimulation(SIEGE_GOLF_HOLES[0]!).poseHash();
    expect(rebuiltHash).toBe(freshHash);
  });

  it("flow reset proves hash match after play", () => {
    const flow = new HoleFlow(SIEGE_GOLF_HOLES[0]!);
    expect(flow.strike([0, -1], 1.8)).toBe(true);
    for (let index = 0; index < 200; index += 1) flow.update(1);
    flow.resetHole();
    expect(flow.resetHashMatch).toBe(true);
    expect(flow.strokes).toBe(0);
    expect(flow.phase).toBe("aiming");
  });

  it("captures the pre-shot pose hash at strike time", () => {
    const flow = new HoleFlow(SIEGE_GOLF_HOLES[0]!);
    flow.sim.stepFixed(30);
    const preStrike = flow.sim.poseHash();
    expect(flow.strike([0, -1], 1.5)).toBe(true);
    expect(flow.lastShotHash).toBe(preStrike);
  });

  it("allows exactly one stroke past the limit, then blocks", () => {
    const flow = new HoleFlow(SIEGE_GOLF_HOLES[0]!);
    const limit = flow.hole.par + 4;
    let accepted = 0;
    for (let index = 0; index < limit + 3; index += 1) {
      // Strikes only register from "aiming", so resolve each stroke fully
      // (bounded by MAX_SIM_FRAMES) before requesting the next one.
      if (flow.strike([0, -1], 0.6)) accepted += 1;
      for (let step = 0; step < 700 && flow.phase === "simulating"; step += 1) flow.update(1);
    }
    expect(accepted).toBe(limit + 1);
    expect(flow.phase).toBe("hole-failed");
  });
});

describe("siege golf sensors", () => {
  it("counts a cup entry exactly once per overlap", () => {
    const sim = createHoleSimulation(SIEGE_GOLF_HOLES[0]!);
    sim.stepFixed(40);
    const pin = sim.pinBodies.get("pin-a")!;
    const cupCenter = sim.cupCenter("cup-a");
    pin.wake();
    pin.setVelocity([(cupCenter[0] - pin.position[0]) * 1.4, 0.6, (cupCenter[1] - pin.position[2]) * 1.4]);
    // Keep stepping long past entry: resting inside must not re-fire.
    for (let index = 0; index < 300; index += 1) sim.stepFixed(1);
    const flashes = sim.consumeSensorFlashes();
    expect(flashes.length).toBe(1);
    expect(flashes[0]!.cupId.startsWith("cup:")).toBe(true);
    expect(sim.sunkPinIds()).toContain("pin-a");
  });
});

describe("siege golf mechanics", () => {
  it("a clean full-power drive topples and sinks the hole-1 pin", () => {
    const sim = createHoleSimulation(SIEGE_GOLF_HOLES[0]!);
    sim.strike([0, 0, -1], 2.2);
    for (let index = 0; index < 320; index += 1) sim.stepFixed(1);
    expect(sim.sunkPinIds()).toContain("pin-a");
  });

  it("every authored hole builds on rapier and stays contained", { timeout: 60_000 }, () => {
    for (let index = 0; index < SIEGE_GOLF_HOLES.length; index += 1) {
      const def = SIEGE_GOLF_HOLES[index]!;
      const sim = createHoleSimulation(def);
      expect(sim.backend).toBe("rapier");
      sim.strike([def.aim[0], 0, def.aim[1]], 2.1);
      for (let step = 0; step < 300; step += 1) sim.stepFixed(1);
      const p = sim.ball.position;
      const label = def.name;
      expect(p.every(Number.isFinite), label + " ball position must stay finite").toBe(true);
      expect(
        Math.abs(p[0]) < 6 && p[1] > -0.6 && p[2] > -18 && p[2] < 6,
        label + " ball escaped the course"
      ).toBe(true);
    }
  });

  it("completes and deterministically resets all nine authored holes with legal player shots", { timeout: 60_000 }, () => {
    expect(SIEGE_GOLF_CANONICAL_SOLUTIONS).toHaveLength(SIEGE_GOLF_HOLES.length);
    expect(new Set(SIEGE_GOLF_CANONICAL_SOLUTIONS.map((solution) => solution.scenario))).toEqual(new Set([
      "direct",
      "fixed-gate",
      "collapse",
      "bank",
      "spring",
      "pendulum",
      "tower",
      "double-hinge",
      "final"
    ]));

    for (const [holeIndex, hole] of SIEGE_GOLF_HOLES.entries()) {
      const solution = SIEGE_GOLF_CANONICAL_SOLUTIONS[holeIndex]!;
      expect(solution.holeId).toBe(hole.id);
      const flow = new HoleFlow(hole);

      for (const stroke of solution.strokes) {
        expect(stroke.angle, `${hole.name} angle`).toBeGreaterThanOrEqual(-Math.PI / 3);
        expect(stroke.angle, `${hole.name} angle`).toBeLessThanOrEqual(Math.PI / 3);
        expect(stroke.power, `${hole.name} power`).toBeGreaterThanOrEqual(0.55);
        expect(stroke.power, `${hole.name} power`).toBeLessThanOrEqual(2.3);
        expect(flow.strike(directionForAbsoluteAngle(stroke.angle), stroke.power), `${hole.name} accepted stroke`).toBe(true);
        for (let frame = 0; frame < 700 && flow.phase === "simulating"; frame += 1) flow.update(1);
      }

      const completed = flow.snapshot();
      expect(completed.phase, `${hole.name} completion`).toBe("hole-complete");
      expect(completed.targetsSunk, `${hole.name} sunk targets`).toBe(completed.totalTargets);
      expect(completed.strokes, `${hole.name} par`).toBeLessThanOrEqual(hole.par);

      flow.resetHole();
      expect(flow.resetHashMatch, `${hole.name} reset hash`).toBe(true);
      expect(flow.snapshot().targetsSunk, `${hole.name} reset targets`).toBe(0);
      expect(flow.strokes, `${hole.name} reset strokes`).toBe(0);
      expect(flow.phase, `${hole.name} reset phase`).toBe("aiming");
    }
  });

  it("gives every second stroke a fresh resolution budget", () => {
    const finalHole = SIEGE_GOLF_HOLES[8]!;
    const solution = SIEGE_GOLF_CANONICAL_SOLUTIONS[8]!;
    const flow = new HoleFlow(finalHole);

    for (const stroke of solution.strokes) {
      expect(flow.strike(directionForAbsoluteAngle(stroke.angle), stroke.power)).toBe(true);
      let resolutionFrames = 0;
      while (flow.phase === "simulating" && resolutionFrames < 700) {
        flow.update(1);
        resolutionFrames += 1;
      }
      expect(resolutionFrames, `stroke ${flow.strokes} must not inherit the prior frame cap`).toBeGreaterThan(1);
    }

    expect(flow.phase).toBe("hole-complete");
    expect(flow.snapshot().targetsSunk).toBe(2);
  });

  it("completes all nine through the player-facing precision controller used by the mounted route", { timeout: 60_000 }, () => {
    for (const [holeIndex, hole] of SIEGE_GOLF_HOLES.entries()) {
      const flow = new HoleFlow(hole);
      const controller = new ShotController();
      controller.loadHole(hole.aim);
      const baseAngle = Math.atan2(hole.aim[0], -hole.aim[1]);

      for (const stroke of SIEGE_GOLF_CANONICAL_SOLUTIONS[holeIndex]!.strokes) {
        controller.aimTo(stroke.angle - baseAngle);
        const result = controller.strikeAtPower(stroke.power);
        expect(result, `${hole.name} precision input`).not.toBeNull();
        expect(flow.strike(result!.input.vector, result!.input.power)).toBe(true);
        for (let frame = 0; frame < 700 && flow.phase === "simulating"; frame += 1) flow.update(1);
        controller.armNextShot();
      }

      expect(flow.phase, `${hole.name} mounted-controller completion`).toBe("hole-complete");
    }
  });

  it("keeps fixed-joint gate anchors stable after an off-axis drive", () => {
    const flow = new HoleFlow(SIEGE_GOLF_HOLES[4]!);
    expect(flow.strike(directionForAbsoluteAngle(-1.04), 0.95)).toBe(true);
    expect(() => {
      for (let frame = 0; frame < 650 && flow.phase === "simulating"; frame += 1) flow.update(1);
    }).not.toThrow();
    const snapshot = flow.sim.world.snapshot().snapshot;
    expect(snapshot.stats.kineticEnergy).toBeLessThan(100);
    for (const body of snapshot.bodies) {
      expect(body.position.every(Number.isFinite)).toBe(true);
      expect(body.velocity.every(Number.isFinite)).toBe(true);
    }
  });
});
