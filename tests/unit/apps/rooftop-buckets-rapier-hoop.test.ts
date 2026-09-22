import { describe, expect, it } from "vitest";
import { physics } from "@aura3d/engine";
import { createHoopSimulation, BALL_RADIUS, RIM_HEIGHT } from "../../../apps/showcase-rooftop-buckets/src/hoop-sim";
import { calculateLaunchVelocity, createBallAtSpot, GRAVITY, stepBall } from "../../../apps/showcase-rooftop-buckets/src/shot";
import { COURT_SPOTS } from "../../../apps/showcase-rooftop-buckets/src/court";
import { initialHoopState } from "../../../apps/showcase-rooftop-buckets/src/rim";

/**
 * Rooftop Buckets runs on the canonical Rapier-backed world, so the hoop has to be
 * provable headless: a made shot must require real passage through the rim sensor,
 * a missed shot must not score, and a reset must restore physical state rather than
 * only the rendered mesh.
 */
function settle(world: ReturnType<typeof createHoopSimulation>, maxSteps = 900) {
  let steps = 0;
  let facts = { rim: false, backboard: false, ground: false, defender: false, scored: false, lastImpactSpeed: 0 };
  for (; steps < maxSteps; steps += 1) {
    const step = world.step(1 / 60);
    facts = {
      rim: facts.rim || step.rim,
      backboard: facts.backboard || step.backboard,
      ground: facts.ground || step.ground,
      defender: facts.defender || step.defender,
      scored: facts.scored || step.scored,
      lastImpactSpeed: Math.max(facts.lastImpactSpeed, step.lastImpactSpeed),
    };
    const pose = world.readBall();
    if (facts.scored && pose.position[1] < RIM_HEIGHT - 0.5) break;
    if (pose.sleeping) break;
  }
  return { steps, facts, pose: world.readBall() };
}

function fireAt(spotIndex: number, power: number, aimPitch = 0) {
  const world = createHoopSimulation({ defenderEnabled: false });
  const spot = COURT_SPOTS[spotIndex]!;
  const hoop = initialHoopState(1);
  world.placeBall(spot.x, 1.8, spot.z);
  const v = calculateLaunchVelocity(spot, power, aimPitch, hoop);
  world.launch([v.vx, v.vy, v.vz], Math.min(9, Math.hypot(v.vx, v.vy, v.vz) * 1.4));
  return { world, result: settle(world) };
}

describe("rooftop buckets rapier hoop", () => {
  it("builds a real Rapier world with the hoop, rim, floor, and sensor bodies", () => {
    const world = createHoopSimulation({ defenderEnabled: true });
    // The canonical adapter, not a route-local stand-in.
    expect(world.snapshot().backend.active).toBe("rapier");
    // floor + backboard + bracket + 24 rim segments + score sensor + defender + ball
    expect(world.debug().bodyCount).toBe(30);
    expect(world.debug().colliderCount).toBe(30);
    world.dispose();
  });

  it("scores a sweet-spot free throw through the rim sensor, not a radius rule", () => {
    const spot = COURT_SPOTS[1]!; // Free Throw (2-pt)
    const { world, result } = fireAt(1, spot.sweetPower);
    expect(result.facts.scored).toBe(true);
    expect(result.pose.position[1]).toBeLessThan(RIM_HEIGHT - 0.3);
    // The ball finished on the far (backboard) side of the rim plane: it went through.
    expect(result.pose.position[2]).toBeLessThan(0.1);
    world.dispose();
  });

  it("does not score an undershoot that falls short of the ring", () => {
    const spot = COURT_SPOTS[1]!;
    const { world, result } = fireAt(1, spot.sweetPower * 0.55);
    expect(result.facts.scored).toBe(false);
    world.dispose();
  });

  /**
   * A high, full-power arc legitimately drops through the hoop, so overshoot is not
   * a discriminating miss. Crossing the rim plane upward is: the sensor must only
   * register a downward pass, which is what makes it a basket rather than a proximity test.
   */
  it("does not score a ball that crosses the rim plane travelling upward", () => {
    const world = createHoopSimulation({ defenderEnabled: false });
    world.placeBall(0, RIM_HEIGHT - 0.6, 0);
    world.launch([0, 9, 0], 0);
    let scoredUpward = false;
    let apex = -Infinity;
    for (let step = 0; step < 40; step += 1) {
      if (world.step(1 / 60).scored) scoredUpward = true;
      apex = Math.max(apex, world.readBall().position[1]);
    }
    expect(scoredUpward).toBe(false);
    // The ball really did travel up through the ring plane, so this is a direction
    // test rather than a test that nothing happened.
    expect(apex).toBeGreaterThan(RIM_HEIGHT + 0.2);
    world.dispose();
  });

  it("reports a real rim contact when the ball strikes the ring", () => {
    const world = createHoopSimulation({ defenderEnabled: false });
    // Flat line drive at rim height, aimed at the near ring wall rather than the
    // open centre of the hoop, which a ball can legitimately pass straight through.
    world.placeBall(0.225, RIM_HEIGHT, 1.4);
    world.launch([0, 0, -9], 0);
    let rim = false;
    for (let step = 0; step < 40 && !rim; step += 1) rim = world.step(1 / 60).rim;
    expect(rim).toBe(true);
    // A real rim deflects a 9 m/s line drive to a fraction of its speed.
    expect(Math.abs(world.readBall().velocity[2])).toBeLessThan(5);
    world.dispose();
  });

  it("keeps every transform finite for the whole flight", () => {
    const spot = COURT_SPOTS[4]!; // Top of Key (3-pt), the longest shot
    const world = createHoopSimulation({ defenderEnabled: false });
    const hoop = initialHoopState(1);
    world.placeBall(spot.x, 1.8, spot.z);
    const v = calculateLaunchVelocity(spot, spot.sweetPower, 0, hoop);
    world.launch([v.vx, v.vy, v.vz], 4);
    for (let step = 0; step < 600; step += 1) {
      world.step(1 / 60);
      const pose = world.readBall();
      for (const value of [...pose.position, ...pose.velocity, ...pose.rotation]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
    world.dispose();
  });

  it("never tunnels the ball through the floor", () => {
    const spot = COURT_SPOTS[5]!;
    const { world, result } = fireAt(5, Math.min(1, spot.sweetPower * 1.15));
    expect(result.pose.position[1]).toBeGreaterThanOrEqual(BALL_RADIUS - 0.02);
    world.dispose();
  });

  it("restores full physical state on reset, not only the rendered mesh", () => {
    const spot = COURT_SPOTS[1]!;
    const { world, result } = fireAt(1, spot.sweetPower);
    expect(result.facts.scored).toBe(true);
    expect(result.pose.speed).toBeGreaterThan(0);

    world.placeBall(spot.x, 1.8, spot.z);
    const pose = world.readBall();
    expect(pose.position).toEqual([spot.x, 1.8, spot.z]);
    expect(pose.velocity).toEqual([0, 0, 0]);
    expect(pose.speed).toBe(0);
    expect(pose.sleeping).toBe(false);
    expect(world.shotState()).toEqual({ scored: false, rim: false, board: false, defender: false });
    world.dispose();
  });

  /**
   * The route accumulates browser time into fixed 1/60 steps, so a 30 fps frame and a
   * 144 fps frame must produce the same basket. This is the gameplay-physics-is-tied-
   * to-FPS failure mode the mission calls out, tested at the route entry point.
   */
  it("produces the same outcome at 30, 60, and 144 fps", () => {
    const spot = COURT_SPOTS[1]!;
    const hoop = initialHoopState(1);
    const v = calculateLaunchVelocity(spot, spot.sweetPower, 0, hoop);

    const runAt = (fps: number) => {
      let ball = createBallAtSpot(spot);
      ball = { ...ball, ...v, inFlight: true };
      const dt = 1 / fps;
      for (let frame = 0; frame < fps * 3; frame += 1) {
        const stepped = stepBall(ball, hoop, dt);
        ball = stepped.ball;
        if (stepped.events.scored) return true;
        if (ball.settled) break;
      }
      return false;
    };

    expect(runAt(30)).toBe(true);
    expect(runAt(60)).toBe(true);
    expect(runAt(144)).toBe(true);
  });

  it("keeps the solved arc physically consistent with the gravity the solver applies", () => {
    const spot = COURT_SPOTS[1]!;
    const hoop = initialHoopState(1);
    const v = calculateLaunchVelocity(spot, spot.sweetPower, 0, hoop);
    const apexAnalytic = 1.8 + (v.vy * v.vy) / (-2 * GRAVITY);
    const world = createHoopSimulation({ defenderEnabled: false });
    world.placeBall(spot.x, 1.8, spot.z);
    world.launch([v.vx, v.vy, v.vz], 4);
    let apexSimulated = -Infinity;
    for (let step = 0; step < 120; step += 1) {
      world.step(1 / 60);
      apexSimulated = Math.max(apexSimulated, world.readBall().position[1]);
    }
    // Rapier's integrator plus linear damping must track the analytic arc closely,
    // which is the point of handing the solved vector to a real solver.
    expect(apexSimulated).toBeGreaterThan(apexAnalytic - 0.6);
    expect(apexSimulated).toBeLessThan(apexAnalytic + 0.35);
    world.dispose();
  });
});
