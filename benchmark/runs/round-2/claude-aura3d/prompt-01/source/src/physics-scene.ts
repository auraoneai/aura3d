/**
 * Physics playground simulation built on the Aura3D engine's public physics
 * module (`@aura3d/engine/physics`). This file owns the real rigid-body world:
 * a tilted ramp, a catch floor, containment walls, and 50 dynamic cubes that
 * fall, collide, slide down the ramp, and pile up.
 *
 * Rendering is intentionally NOT handled here — this module exposes plain data
 * (cube transforms, static geometry, live contact count) so it can be driven by
 * any renderer (see `main.ts`) and exercised headlessly.
 */
import {
  PhysicsWorld,
  RigidBody,
  Shape,
  type Vec3,
} from "@aura3d/engine/physics";

export const CUBE_COUNT = 50;

/** Ramp incline in radians. tan(28°) ≈ 0.53 > cube friction, so cubes slide. */
export const RAMP_ANGLE = (28 * Math.PI) / 180;

/** Containment bounds for the catch bin at the base of the ramp. */
const BACK_WALL_Z = -6.5;
const SIDE_WALL_X = 5;

/** Description of a cube for the renderer (size + colour are stable for life). */
export interface CubeView {
  readonly id: number;
  /** Full edge lengths (x, y, z) of the rendered box. */
  readonly size: Vec3;
  readonly color: string;
  /** Live world position, updated in place every step. */
  readonly position: [number, number, number];
  /** Live world rotation quaternion [x, y, z, w], updated in place. */
  readonly rotation: [number, number, number, number];
}

/** Static surface descriptions so the renderer can draw matching meshes. */
export interface StaticGeometry {
  readonly rampAngle: number;
  readonly backWallZ: number;
  readonly sideWallX: number;
}

interface CubeRecord {
  readonly view: CubeView;
  readonly body: RigidBody;
  readonly spawn: {
    readonly position: [number, number, number];
    readonly rotation: [number, number, number, number];
  };
}

/** Small deterministic PRNG so the layout (and screenshots) are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUBE_PALETTE = [
  "#ff6b6b",
  "#ffd166",
  "#06d6a0",
  "#4cc9f0",
  "#b388ff",
  "#f78c6b",
  "#80ed99",
  "#ff9fb2",
];

export class PhysicsPlayground {
  readonly world: PhysicsWorld;
  readonly statics: StaticGeometry = {
    rampAngle: RAMP_ANGLE,
    backWallZ: BACK_WALL_Z,
    sideWallX: SIDE_WALL_X,
  };

  private readonly cubes: CubeRecord[] = [];
  private readonly fixedDelta: number;

  constructor() {
    this.world = new PhysicsWorld({
      gravity: [0, -9.81, 0],
      fixedDelta: 1 / 60,
      // Several solver passes per step keep stacked cubes stable.
      solverIterations: 8,
      enableSleeping: true,
      sleepVelocityThreshold: 0.05,
      sleepDelay: 0.4,
    });
    this.fixedDelta = this.world.fixedDelta;

    this.createStaticSurfaces();
    this.createCubes();
  }

  /** Infinite planes: tilted ramp (z > 0), flat floor (z < 0), and 3 walls. */
  private createStaticSurfaces(): void {
    const c = Math.cos(RAMP_ANGLE);
    const s = Math.sin(RAMP_ANGLE);

    // Ramp surface passes through the world origin line: y = z * tan(angle)
    // for z > 0. Normal points up-and-toward -z.
    this.addStaticPlane([0, c, -s], 0, { friction: 0.34, restitution: 0.04 });

    // Flat catch floor at y = 0 (dominates the z < 0 region).
    this.addStaticPlane([0, 1, 0], 0, { friction: 0.7, restitution: 0.0 });

    // Back wall the sliding cubes pile against (surface z = BACK_WALL_Z).
    this.addStaticPlane([0, 0, 1], -BACK_WALL_Z, { friction: 0.4, restitution: 0.0 });

    // Side walls keep the pile contained (surfaces x = -X and x = +X).
    this.addStaticPlane([1, 0, 0], SIDE_WALL_X, { friction: 0.4, restitution: 0.0 });
    this.addStaticPlane([-1, 0, 0], SIDE_WALL_X, { friction: 0.4, restitution: 0.0 });
  }

  private addStaticPlane(
    normal: Vec3,
    constant: number,
    material: { friction: number; restitution: number },
  ): void {
    const body = this.world.createRigidBody({ type: "static", position: [0, 0, 0] });
    this.world.createCollider(body, {
      shape: Shape.plane(normal, constant),
      material,
    });
  }

  private createCubes(): void {
    const rng = mulberry32(0x5eed);

    for (let i = 0; i < CUBE_COUNT; i += 1) {
      const col = i % 5;
      const layer = Math.floor(i / 5);

      // Larger z (further up the ramp) + larger y → cubes cascade in waves.
      const edge = 0.78 + rng() * 0.34;
      const half = edge / 2;
      const x = (col - 2) * 1.45 + (rng() - 0.5) * 0.5;
      const z = 2.2 + layer * 0.55 + (rng() - 0.5) * 0.4;
      const y = 6.5 + layer * 1.7 + rng() * 0.6;

      const spawnPos: [number, number, number] = [x, y, z];
      const spawnRot: [number, number, number, number] = [0, 0, 0, 1];

      const body = this.world.createRigidBody({
        type: "dynamic",
        position: spawnPos,
        rotation: spawnRot,
        mass: edge * edge * edge,
        restitution: 0.12,
        friction: 0.34,
        linearDamping: 0.02,
        angularDamping: 0.5,
      });
      this.world.createCollider(body, {
        shape: Shape.box(half, half, half),
        material: { friction: 0.34, restitution: 0.12 },
      });

      const view: CubeView = {
        id: body.id,
        size: [edge, edge, edge],
        color: CUBE_PALETTE[i % CUBE_PALETTE.length],
        position: [...spawnPos],
        rotation: [...spawnRot],
      };

      this.cubes.push({ view, body, spawn: { position: spawnPos, rotation: spawnRot } });
    }
  }

  /** Cube descriptors for the renderer (stable references; transforms mutate). */
  getCubeViews(): readonly CubeView[] {
    return this.cubes.map((c) => c.view);
  }

  /**
   * Advance the simulation by `dt` seconds using fixed sub-steps, then mirror
   * each body's transform into its CubeView so the renderer can read it.
   * Returns the number of fixed steps taken.
   */
  advance(dt: number): number {
    // Clamp to avoid a spiral-of-death after a long frame / tab refocus.
    const clamped = Math.min(dt, 0.1);
    let accumulated = clamped;
    let steps = 0;
    while (accumulated >= this.fixedDelta && steps < 6) {
      this.world.step(this.fixedDelta);
      accumulated -= this.fixedDelta;
      steps += 1;
    }
    this.syncViews();
    return steps;
  }

  private syncViews(): void {
    for (const { view, body } of this.cubes) {
      view.position[0] = body.position[0];
      view.position[1] = body.position[1];
      view.position[2] = body.position[2];
      view.rotation[0] = body.rotation[0];
      view.rotation[1] = body.rotation[1];
      view.rotation[2] = body.rotation[2];
      view.rotation[3] = body.rotation[3];
    }
  }

  /** Live number of active contact points reported by the physics world. */
  getContactCount(): number {
    return this.world.snapshot().stats.contacts;
  }

  /** Count of cubes that have come to rest (asleep) — handy diagnostic. */
  getSettledCount(): number {
    return this.world.snapshot().stats.sleepingBodies;
  }

  /** Restore every cube to its spawn transform and re-drop the playground. */
  reset(): void {
    for (const { body, spawn, view } of this.cubes) {
      body.setPosition(spawn.position);
      body.setRotation(spawn.rotation);
      body.setVelocity([0, 0, 0]);
      body.setAngularVelocity([0, 0, 0]);
      body.wake();
      view.position[0] = spawn.position[0];
      view.position[1] = spawn.position[1];
      view.position[2] = spawn.position[2];
      view.rotation[0] = spawn.rotation[0];
      view.rotation[1] = spawn.rotation[1];
      view.rotation[2] = spawn.rotation[2];
      view.rotation[3] = spawn.rotation[3];
    }
  }
}
