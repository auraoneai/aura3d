/**
 * Rooftop Buckets hoop simulation on the canonical Aura3D Rapier-backed surface.
 *
 * Replaces the route-local analytic rim/board/ground bounce that previously
 * integrated the ball by hand, clamped it to `groundY + radius`, and hard-stopped
 * it once a flight timer elapsed. Here Rapier owns physical state and the route
 * only reads transforms, which is the contract the mission requires for a game
 * whose whole verb is ball contact.
 *
 * Collider shapes are built from the public `physics.*` factories only. Colliders
 * carry no offset in this API, so every rim segment, the bracket, the backboard and
 * the floor are their own static bodies placed at world positions - the same
 * composition pattern Bank Shot uses for cushions and pocket sensors.
 *
 * Authored (non-simulated) behaviour, labelled wherever a claim is made:
 * - the launch vector is solved from the shot spot so power/aim map to a readable
 *   arc; it is applied as the ball's initial velocity, then the solver owns it;
 * - the defender contests by moving a kinematic body, so blocks are real contacts
 *   rather than a radius test.
 */
import { physics } from "@aura3d/engine";

export type SimBody = ReturnType<ReturnType<typeof physics.world>["createBody"]>;
export type SimWorld = ReturnType<typeof physics.world>;

export const BALL_RADIUS = 0.12;
/** Regulation basketball: 0.624 kg. */
export const BALL_MASS = 0.624;
export const BALL_FRICTION = 0.58;
export const BALL_RESTITUTION = 0.62;
export const BALL_LINEAR_DAMPING = 0.12;
export const BALL_ANGULAR_DAMPING = 0.45;

export const RIM_HEIGHT = 3.05;
export const RIM_INNER_RADIUS = 0.225;
export const RIM_PIPE_RADIUS = 0.015;
export const BACKBOARD_Y = 3.35;
export const BACKBOARD_Z = -0.35;
export const BACKBOARD_WIDTH = 1.8;
export const BACKBOARD_HEIGHT = 1.05;
export const BACKBOARD_DEPTH = 0.05;
export const GROUND_Y = 0.0;

/** Rim segments around the ring. Spacing stays well under a ball diameter so the
 *  ball cannot pass through the ring wall. */
const RIM_SEGMENTS = 24;

export interface HoopContactFacts {
  rim: boolean;
  backboard: boolean;
  ground: boolean;
  defender: boolean;
  /** True on the step the ball's centre passes downward through the rim sensor. */
  scored: boolean;
  /** Speed at the moment of the last contact, for audio and impact FX. */
  lastImpactSpeed: number;
}

export interface HoopSimOptions {
  readonly defenderEnabled: boolean;
}

export function createHoopSimulation(options: HoopSimOptions) {
  const world = physics.world({
    gravity: [0, -9.81, 0],
    fixedDelta: 1 / 60,
    solverIterations: 12,
    enableSleeping: true,
    sleepVelocityThreshold: 0.08,
    sleepDelay: 0.4,
    // Fast shots cross the rim plane in a fraction of a frame; substepping keeps
    // the ball from tunnelling the rim tube.
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 8, motionThreshold: 0.25, onSubstepLimit: "clamp" },
  });

  const colliderNameById = new Map<number, string>();
  const register = (colliderId: number, name: string): void => {
    colliderNameById.set(colliderId, name);
  };

  const addStatic = (
    name: string,
    shape: Parameters<SimWorld["createCollider"]>[1]["shape"],
    position: readonly [number, number, number],
    material: { friction: number; restitution: number },
    sensor = false,
  ): SimBody => {
    const body = world.createBody({ type: "static", position: [...position] as [number, number, number] });
    const collider = world.createCollider(body, {
      shape,
      ...(sensor ? { sensor: true } : {}),
      material: { friction: material.friction, restitution: material.restitution },
    });
    register(collider.id, name);
    return body;
  };

  // ---- court floor ------------------------------------------------------------
  addStatic("ground", physics.box(9.0, 0.1, 9.0), [0, GROUND_Y - 0.1, 4.0], {
    friction: 0.85,
    restitution: 0.68,
  });

  // ---- backboard --------------------------------------------------------------
  addStatic(
    "backboard",
    physics.box(BACKBOARD_WIDTH / 2, BACKBOARD_HEIGHT / 2, BACKBOARD_DEPTH / 2),
    [0, BACKBOARD_Y, BACKBOARD_Z],
    { friction: 0.32, restitution: 0.5 },
  );

  // ---- rim ring ---------------------------------------------------------------
  for (let index = 0; index < RIM_SEGMENTS; index += 1) {
    const angle = (index / RIM_SEGMENTS) * Math.PI * 2;
    addStatic(
      "rim",
      physics.sphere(RIM_PIPE_RADIUS),
      [Math.cos(angle) * RIM_INNER_RADIUS, RIM_HEIGHT, Math.sin(angle) * RIM_INNER_RADIUS],
      { friction: 0.36, restitution: 0.72 },
    );
  }

  // Rim-to-backboard bracket: a real body, so front-rim shots that carry the ball
  // into the stanchion meet something solid instead of nothing.
  addStatic("bracket", physics.box(0.02, 0.09, 0.2), [0, RIM_HEIGHT - 0.02, -RIM_INNER_RADIUS - 0.1], {
    friction: 0.4,
    restitution: 0.45,
  });

  // ---- scoring sensor ---------------------------------------------------------
  // A short cylinder-equivalent box hung just below the rim plane and inset from the
  // ring wall, so only a ball that actually travels down through the hoop triggers it.
  const sensorHalf = RIM_INNER_RADIUS - RIM_PIPE_RADIUS - BALL_RADIUS * 0.35;
  addStatic(
    "score-sensor",
    physics.box(sensorHalf, 0.06, sensorHalf),
    [0, RIM_HEIGHT - 0.09, 0],
    { friction: 0, restitution: 0 },
    true,
  );

  // ---- contesting defender ----------------------------------------------------
  const defenderBody = world.createBody({
    type: "kinematic",
    position: [0, 0.9, 2.2],
  });
  const defenderCollider = world.createCollider(defenderBody, {
    shape: physics.box(0.32, 0.9, 0.18),
    material: { friction: 0.5, restitution: 0.35 },
  });
  register(defenderCollider.id, "defender");

  // ---- the ball ---------------------------------------------------------------
  const ball = world.createBody({
    type: "dynamic",
    position: [0, 1.8, 4.6],
    mass: BALL_MASS,
    friction: BALL_FRICTION,
    restitution: BALL_RESTITUTION,
    linearDamping: BALL_LINEAR_DAMPING,
    angularDamping: BALL_ANGULAR_DAMPING,
  });
  const ballCollider = world.createCollider(ball, {
    shape: physics.sphere(BALL_RADIUS),
    material: { friction: BALL_FRICTION, restitution: BALL_RESTITUTION },
  });
  register(ballCollider.id, "ball");

  let scoreArmed = true;
  let scoredThisShot = false;
  let touchedRim = false;
  let touchedBoard = false;
  let touchedGround = false;
  let touchedDefender = false;
  let lastImpactSpeed = 0;

  const resetContactFlags = (): void => {
    scoreArmed = true;
    scoredThisShot = false;
    touchedRim = false;
    touchedBoard = false;
    touchedGround = false;
    touchedDefender = false;
    lastImpactSpeed = 0;
  };

  return {
    world,
    ball,

    /** Places the ball at a spot and clears contact state. Full physical reset. */
    placeBall(x: number, y: number, z: number): void {
      ball.setPosition([x, y, z]);
      ball.setVelocity([0, 0, 0]);
      ball.setAngularVelocity([0, 0, 0]);
      ball.setRotation([0, 0, 0, 1]);
      ball.wake();
      resetContactFlags();
    },

    /** Hands the solved launch vector to the solver; nothing is integrated by hand. */
    launch(velocity: readonly [number, number, number], spin: number): void {
      ball.setPosition([ball.position[0], ball.position[1], ball.position[2]]);
      ball.setVelocity([velocity[0], velocity[1], velocity[2]]);
      // Backspin about the horizontal axis perpendicular to travel.
      ball.setAngularVelocity([-spin, 0, 0]);
      ball.wake();
      resetContactFlags();
    },

    setDefender(x: number, y: number, z: number): void {
      if (!options.defenderEnabled) {
        defenderBody.setPosition([0, -50, 0]);
        return;
      }
      defenderBody.setPosition([x, y, z]);
    },

    /** Advances one fixed step and reports what the solver actually saw. */
    step(dt: number): HoopContactFacts {
      const events = world.step(dt);
      const facts: HoopContactFacts = {
        rim: false,
        backboard: false,
        ground: false,
        defender: false,
        scored: false,
        lastImpactSpeed,
      };
      for (const event of events) {
        const contact = event.contact;
        const a = colliderNameById.get(contact.colliderA);
        const b = colliderNameById.get(contact.colliderB);
        if (!a || !b) continue;
        if (!(a === "ball" || b === "ball")) continue;
        const other = a === "ball" ? b : a;
        if (event.type !== "begin") continue;
        const speed = Math.hypot(ball.velocity[0], ball.velocity[1], ball.velocity[2]);
        if (other === "rim") { touchedRim = true; facts.rim = true; lastImpactSpeed = speed; }
        else if (other === "backboard") { touchedBoard = true; facts.backboard = true; lastImpactSpeed = speed; }
        else if (other === "ground") { touchedGround = true; facts.ground = true; lastImpactSpeed = speed; }
        else if (other === "defender") { touchedDefender = true; facts.defender = true; lastImpactSpeed = speed; }
        else if (other === "score-sensor" && scoreArmed && ball.velocity[1] < 0) {
          scoreArmed = false;
          scoredThisShot = true;
          facts.scored = true;
        }
        facts.lastImpactSpeed = lastImpactSpeed;
      }
      return facts;
    },

    /** Rapier owns the transform; rendering follows it. */
    readBall() {
      return {
        position: ball.position,
        rotation: ball.rotation,
        velocity: ball.velocity,
        speed: Math.hypot(ball.velocity[0], ball.velocity[1], ball.velocity[2]),
        sleeping: ball.sleeping,
      };
    },

    shotState() {
      return { scored: scoredThisShot, rim: touchedRim, board: touchedBoard, defender: touchedDefender };
    },

    debug() {
      return world.debug();
    },

    /** Carries the active solver identity, which is how these tests prove Rapier is real. */
    snapshot() {
      return world.snapshot();
    },

    /** Live solver census, published in route evidence so the claim cannot drift. */
    bodyCount(): number {
      return world.debug().bodyCount;
    },

    contactCount(): number {
      return world.debug().contactCount;
    },

    /** The public controller owns teardown through `reset()`; bodies are not individually dropped. */
    dispose(): void {
      world.reset();
    },
  };
}

export type HoopSimulation = ReturnType<typeof createHoopSimulation>;
