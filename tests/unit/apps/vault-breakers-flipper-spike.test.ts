import { describe, expect, it } from "vitest";
import { physics } from "@aura3d/engine";

/**
 * VB-01 flipper-contact spike (PRD M3 entry gate) — PASSED, joint mode GO.
 *
 * Verdict and tuning history: apps/showcase-vault-breakers/SPIKE-FLIPPER.md.
 *
 * Headline finding: the vendored Rapier adapter degrades two simultaneously
 * active motorised hinges whose motor speeds have OPPOSITE signs (the first
 * joint stalls near its rest angle). Workaround adopted by the route: mirror
 * the right flipper's joint axis to [0, -1, 0] and negate its limits so BOTH
 * motors raise with the SAME positive speed. With 0.18 kg bats and a velocity
 * target of 60 rad/s both flippers reach their up limits in <= 144 ms, hold as
 * walls under ball load, and launch resting balls up-slope deterministically.
 */

const REST = -0.52;
const UP = 0.5;
const RIGHT_REST = Math.PI + 0.52;
const RIGHT_UP = Math.PI - 0.5;
const MOTOR_SPEED = 60;
const MOTOR_TORQUE = 240;
const BALL_RADIUS = 0.14;
const BAT_MASS = 0.18;

interface FlipperRig {
  readonly joint: { setMotorSpeed(speed: number): unknown };
  readonly bat: ReturnType<ReturnType<typeof physics.world>["createBody"]>;
}

interface Probe {
  readonly raiseBoth: (speed?: number) => void;
  readonly anglesAfter: (ms: number, speed?: number) => { left: number; right: number };
  readonly dropBallOnRaisedFlippers: () => { maxSpeed: number; belowFlippers: boolean };
  readonly launchRestingBall: () => { exitSpeed: number; upSlope: boolean };
  readonly poseHash: () => string;
}

function buildProbe(): Probe {
  const world = physics.world({
    gravity: [0, -9.81, 2.35],
    fixedDelta: 1 / 60,
    solverIterations: 8,
    enableSleeping: true,
    sleepVelocityThreshold: 0.06,
    sleepDelay: 0.45,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 256, motionThreshold: 0.35 }
  });

  const floor = world.createBody({ type: "static", position: [0, -0.1, 0], friction: 0.12, restitution: 0.18 });
  world.createCollider(floor, { shape: physics.box(4, 0.1, 6), material: { friction: 0.12, restitution: 0.18 } });

  // Outlane guide walls just outside the flipper pivots: the bat pivot-end
  // corners reach |x| ~0.832 while sweeping, so the guide face at |x| = 0.87
  // never touches the bat but leaves a 0.04 m gap a 0.28 m ball cannot pass.
  for (const x of [-0.93, 0.93]) {
    const post = world.createBody({ type: "static", position: [x, BALL_RADIUS + 0.06, 3.0] });
    world.createCollider(post, { shape: physics.box(0.06, 0.07, 0.55), material: { friction: 0.4, restitution: 0.35 } });
  }
  // Outlane side walls sealing the table edges down to the drain end, as on a
  // real cabinet: nothing escapes around the flippers except through them.
  for (const x of [-1.1, 1.1]) {
    const wall = world.createBody({ type: "static", position: [x, 0.3, 3.6] });
    world.createCollider(wall, { shape: physics.box(0.06, 0.3, 0.85), material: { friction: 0.4, restitution: 0.35 } });
  }

  /**
   * A flipper bat is a dynamic box whose local +X points at the tip; the bat
   * body starts at its rest yaw so the joint anchor is consistent at t=0.
   * The right flipper uses the mirrored joint axis (see file header) so both
   * motors raise with the same positive speed.
   */
  const makeFlipper = (
    pivotX: number,
    restYaw: number,
    upYaw: number,
    axis: readonly [number, number, number],
    limitMin: number,
    limitMax: number
  ): FlipperRig => {
    const pivot: readonly [number, number, number] = [pivotX, BALL_RADIUS + 0.02, 3.35];
    const batCenter: readonly [number, number, number] = [
      pivot[0] + Math.cos(restYaw) * 0.4,
      pivot[1],
      pivot[2] - Math.sin(restYaw) * 0.4
    ];
    const restQuat: readonly [number, number, number, number] = [0, Math.sin(restYaw / 2), 0, Math.cos(restYaw / 2)];
    const anchor = world.createBody({ type: "static", position: [...pivot] as [number, number, number] });
    const bat = world.createBody({
      type: "dynamic",
      position: [...batCenter] as [number, number, number],
      rotation: [...restQuat] as [number, number, number, number],
      mass: BAT_MASS,
      friction: 0.55,
      restitution: 0.65,
      linearDamping: 0.4,
      angularDamping: 0.3
    });
    world.createCollider(bat, { shape: physics.box(0.4, 0.055, 0.065), material: { friction: 0.55, restitution: 0.65 } });
    const joint = world.createConstraint({
      type: "motorised-hinge",
      bodyA: anchor,
      bodyB: bat,
      localAnchorA: [0, 0, 0],
      localAnchorB: [-0.4, 0, 0],
      axis,
      limits: [limitMin, limitMax],
      motorSpeed: 0,
      maxMotorTorque: MOTOR_TORQUE
    });
    return { joint, bat };
  };

  const left = makeFlipper(-0.8, REST, UP, [0, 1, 0], REST, UP);
  // Mirrored axis: joint-space angles are the negated world yaws.
  const right = makeFlipper(0.8, RIGHT_REST, RIGHT_UP, [0, -1, 0], -RIGHT_REST, -RIGHT_UP);

  const raiseBoth = (speed = MOTOR_SPEED): void => {
    // Sleeping bodies ignore joint motors until woken (same discipline as the
    // siege-golf ball strike: always wake() before driving a body).
    left.bat.wake();
    right.bat.wake();
    left.joint.setMotorSpeed(speed);
    right.joint.setMotorSpeed(speed);
  };

  const yawOf = (bat: FlipperRig["bat"]): number => Math.atan2(bat.rotation[1], bat.rotation[3]) * 2;

  const anglesAfter = (ms: number, speed = MOTOR_SPEED): { left: number; right: number } => {
    raiseBoth(speed);
    for (let i = 0; i < Math.round(ms / (1000 / 60)); i += 1) world.step(1 / 60);
    return { left: yawOf(left.bat), right: yawOf(right.bat) };
  };

  const makeBall = (position: readonly [number, number, number], velocity: readonly [number, number, number] = [0, 0, 0]) => {
    const ball = world.createBody({
      type: "dynamic",
      position: [...position] as [number, number, number],
      mass: 0.28,
      friction: 0.16,
      restitution: 0.5,
      linearDamping: 0.05,
      angularDamping: 0.2
    });
    world.createCollider(ball, { shape: physics.sphere(BALL_RADIUS), material: { friction: 0.16, restitution: 0.5 } });
    ball.wake();
    ball.setVelocity([...velocity] as [number, number, number]);
    return ball;
  };

  const dropBallOnRaisedFlippers = () => {
    raiseBoth();
    for (let i = 0; i < 24; i += 1) world.step(1 / 60); // flippers up first
    // Low drop (0.5 m) landing UP-SLOPE of the raised bat line (the bat at
    // x=-0.3 sits at z≈3.08 when raised), so the ball must roll into the
    // flippers and be stopped — a real table's apron makes high hops over the
    // bats impossible, so the wall test must not win by flying clean over.
    const ball = makeBall([-0.3, 0.5, 2.7]);
    let maxSpeed = 0;
    for (let i = 0; i < 300; i += 1) {
      world.step(1 / 60);
      const v = ball.velocity;
      maxSpeed = Math.max(maxSpeed, Math.hypot(v[0], v[1], v[2]));
      if (ball.position[2] > 4.4) break; // drained between/past raised flippers
    }
    return { maxSpeed, belowFlippers: ball.position[2] > 4.2 };
  };

  const launchRestingBall = () => {
    for (let i = 0; i < 120; i += 1) world.step(1 / 60); // settle to rest angle
    const ball = makeBall([-0.45, BALL_RADIUS + 0.12, 3.15], [0.25, 0, 0.9]);
    for (let i = 0; i < 18; i += 1) world.step(1 / 60); // ball arrives on the resting bat
    raiseBoth();
    for (let i = 0; i < 90; i += 1) world.step(1 / 60);
    const v = ball.velocity;
    return { exitSpeed: Math.hypot(v[0], v[1], v[2]), upSlope: v[2] < -1.5 };
  };

  const poseHash = (): string => {
    const q = (x: number) => String(Math.round(x * 1000));
    let s = "probe";
    for (const rig of [left, right]) {
      const p = rig.bat.position;
      const r = rig.bat.rotation;
      s += q(p[0]) + q(p[1]) + q(p[2]) + q(r[0]) + q(r[1]) + q(r[2]) + q(r[3]);
    }
    return s;
  };

  return { raiseBoth, anglesAfter, dropBallOnRaisedFlippers, launchRestingBall, poseHash };
}

describe("vault breakers flipper spike (VB-01)", () => {
  it("both motorised flippers reach their up limits in under 150 ms", () => {
    const probe = buildProbe();
    const angles = probe.anglesAfter(150);
    expect(angles.left).toBeGreaterThan(0.4);
    // Right flipper raises from RIGHT_REST down to RIGHT_UP in world yaw.
    expect(angles.right).toBeLessThan(RIGHT_REST - 0.9);
  });

  it("raised flippers hold as a wall: dropped ball never drains past them", () => {
    const probe = buildProbe();
    const result = probe.dropBallOnRaisedFlippers();
    expect(result.belowFlippers).toBe(false);
    expect(result.maxSpeed).toBeGreaterThan(0.5);
  });

  it("a moving flipper launches a resting ball up-slope with real speed", () => {
    const probe = buildProbe();
    const result = probe.launchRestingBall();
    expect(result.exitSpeed).toBeGreaterThan(2.5);
    expect(result.upSlope).toBe(true);
  });

  it("identical motor scripts reproduce identical poses (determinism)", () => {
    const a = buildProbe();
    const b = buildProbe();
    a.anglesAfter(300);
    b.anglesAfter(300);
    expect(a.poseHash()).toBe(b.poseHash());
  });
});
