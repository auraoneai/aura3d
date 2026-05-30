// Lightweight rigid-body contact solver for the physics playground.
//
// This is a real (if compact) simulation: 50 axis-aligned cube bodies fall
// under gravity onto a tilted ramp + a catch floor, with positional collision
// resolution and restitution/friction. Every step it reports the number of
// *live contacts* (cube-ramp, cube-floor and cube-cube touching pairs), which
// the HUD reads each frame. The geometry mirrors the Aura `physicsPlayground`
// prefab (ramp tilted ~19.5deg about Z) so the overlay describes the rigid
// bodies that are actually rendered in the scene.

export type Vec3 = [number, number, number];

export interface CubeBody {
  pos: Vec3;
  vel: Vec3;
  /** half extent of the cube (cubes render at scale 0.18 -> half 0.09). */
  readonly half: number;
  resting: boolean;
}

export interface ContactStats {
  /** total live contacts this step (cube-ramp + cube-floor + cube-cube). */
  contacts: number;
  cubeRamp: number;
  cubeFloor: number;
  cubeCube: number;
  /** cubes that have come to rest. */
  settled: number;
  /** cubes still moving meaningfully. */
  falling: number;
  maxSpeed: number;
}

export type SimPhase = "dropping" | "settling" | "at-rest";

const GRAVITY = -9.81;
const RESTITUTION = 0.18;
const FRICTION = 0.78;
const REST_SPEED = 0.18; // below this a body is considered resting
const CONTACT_EPS = 0.02; // surface gap treated as a contact

// Tilted ramp, matching the prefab: a plane rotated -0.34 rad about Z.
// Rotating the up-vector (0,1,0) by -0.34 about Z gives this surface normal.
const RAMP_ANGLE = 0.34;
const RAMP_NORMAL: Vec3 = [Math.sin(RAMP_ANGLE), Math.cos(RAMP_ANGLE), 0];
// A point on the ramp top surface (prefab ramp center + half thickness up).
const RAMP_POINT: Vec3 = [-0.35, 0.34 + 0.09, -0.8];
// Ramp footprint (generous bounds in the un-tilted XZ span of the prefab box).
const RAMP_X: [number, number] = [-1.9, 1.0];
const RAMP_Z: [number, number] = [-1.45, -0.15];
// Catch floor (top of the prefab catch platform).
const FLOOR_Y = 0.1;

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

// Deterministic-enough PRNG so each reset produces a fresh but reproducible
// drop. Seeded from a counter passed by the caller (avoids Math.random global
// state surprises and keeps resets visibly different).
function makeRng(seed: number): () => number {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export class PhysicsWorld {
  readonly bodies: CubeBody[] = [];
  readonly count: number;
  private resetCount = 0;
  elapsed = 0;

  constructor(count = 50) {
    this.count = count;
    for (let i = 0; i < count; i += 1) {
      this.bodies.push({ pos: [0, 0, 0], vel: [0, 0, 0], half: 0.09, resting: false });
    }
    this.reset();
  }

  /** Re-drop all cubes from fresh randomized start positions above the ramp. */
  reset(): void {
    this.resetCount += 1;
    this.elapsed = 0;
    const rng = makeRng(this.resetCount * 97 + 7);
    for (let i = 0; i < this.count; i += 1) {
      const body = this.bodies[i];
      const col = i % 10;
      const row = Math.floor(i / 10);
      body.pos[0] = -1.4 + col * 0.3 + (rng() - 0.5) * 0.12;
      body.pos[1] = 1.6 + row * 0.34 + rng() * 0.4;
      body.pos[2] = -1.2 + (i % 5) * 0.22 + (rng() - 0.5) * 0.12;
      body.vel[0] = (rng() - 0.5) * 0.6;
      body.vel[1] = -rng() * 0.4;
      body.vel[2] = (rng() - 0.5) * 0.6;
      body.resting = false;
    }
  }

  /** Advance the simulation by dt seconds using fixed substeps. */
  step(dt: number): void {
    const maxStep = 1 / 120;
    let remaining = Math.min(dt, 1 / 20); // clamp huge frame gaps
    while (remaining > 1e-5) {
      const h = Math.min(maxStep, remaining);
      this.substep(h);
      remaining -= h;
      this.elapsed += h;
    }
  }

  private substep(h: number): void {
    const bodies = this.bodies;
    // Integrate under gravity.
    for (const b of bodies) {
      b.vel[1] += GRAVITY * h;
      b.pos[0] += b.vel[0] * h;
      b.pos[1] += b.vel[1] * h;
      b.pos[2] += b.vel[2] * h;
    }
    // Resolve cube-cube collisions (axis-aligned, min-translation separation).
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        this.resolvePair(bodies[i], bodies[j]);
      }
    }
    // Resolve cube vs static geometry (ramp + floor) and update resting flags.
    for (const b of bodies) {
      this.resolveStatic(b);
      b.resting = length(b.vel) < REST_SPEED;
    }
  }

  private resolvePair(a: CubeBody, b: CubeBody): void {
    const dx = b.pos[0] - a.pos[0];
    const dy = b.pos[1] - a.pos[1];
    const dz = b.pos[2] - a.pos[2];
    const overlapX = a.half + b.half - Math.abs(dx);
    const overlapY = a.half + b.half - Math.abs(dy);
    const overlapZ = a.half + b.half - Math.abs(dz);
    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) return;
    // Push apart along the axis of least penetration.
    if (overlapX <= overlapY && overlapX <= overlapZ) {
      const push = (overlapX / 2) * Math.sign(dx || 1);
      a.pos[0] -= push;
      b.pos[0] += push;
      a.vel[0] *= FRICTION;
      b.vel[0] *= FRICTION;
    } else if (overlapY <= overlapX && overlapY <= overlapZ) {
      const push = (overlapY / 2) * Math.sign(dy || 1);
      a.pos[1] -= push;
      b.pos[1] += push;
      a.vel[1] *= -RESTITUTION;
      b.vel[1] *= -RESTITUTION;
    } else {
      const push = (overlapZ / 2) * Math.sign(dz || 1);
      a.pos[2] -= push;
      b.pos[2] += push;
      a.vel[2] *= FRICTION;
      b.vel[2] *= FRICTION;
    }
  }

  private resolveStatic(b: CubeBody): void {
    const onRamp =
      b.pos[0] >= RAMP_X[0] &&
      b.pos[0] <= RAMP_X[1] &&
      b.pos[2] >= RAMP_Z[0] &&
      b.pos[2] <= RAMP_Z[1];

    if (onRamp) {
      // Signed distance from the cube center to the tilted plane, minus half.
      const rel: Vec3 = [
        b.pos[0] - RAMP_POINT[0],
        b.pos[1] - RAMP_POINT[1],
        b.pos[2] - RAMP_POINT[2],
      ];
      const dist = dot(rel, RAMP_NORMAL) - b.half;
      if (dist < 0) {
        b.pos[0] -= dist * RAMP_NORMAL[0];
        b.pos[1] -= dist * RAMP_NORMAL[1];
        b.pos[2] -= dist * RAMP_NORMAL[2];
        const vn = dot(b.vel, RAMP_NORMAL);
        if (vn < 0) {
          // Remove inward normal velocity (with a little bounce), keep tangent.
          b.vel[0] -= (1 + RESTITUTION) * vn * RAMP_NORMAL[0];
          b.vel[1] -= (1 + RESTITUTION) * vn * RAMP_NORMAL[1];
          b.vel[2] -= (1 + RESTITUTION) * vn * RAMP_NORMAL[2];
          b.vel[0] *= FRICTION;
          b.vel[2] *= FRICTION;
        }
      }
    }

    // Catch floor.
    const floor = FLOOR_Y + b.half;
    if (b.pos[1] < floor) {
      b.pos[1] = floor;
      if (b.vel[1] < 0) b.vel[1] = -b.vel[1] * RESTITUTION;
      b.vel[0] *= FRICTION;
      b.vel[2] *= FRICTION;
    }
  }

  /** Count live contacts and summarize the current state. */
  stats(): ContactStats {
    const bodies = this.bodies;
    let cubeRamp = 0;
    let cubeFloor = 0;
    let cubeCube = 0;
    let settled = 0;
    let maxSpeed = 0;

    for (const b of bodies) {
      const speed = length(b.vel);
      if (speed > maxSpeed) maxSpeed = speed;
      if (b.resting) settled += 1;

      const onRamp =
        b.pos[0] >= RAMP_X[0] &&
        b.pos[0] <= RAMP_X[1] &&
        b.pos[2] >= RAMP_Z[0] &&
        b.pos[2] <= RAMP_Z[1];
      if (onRamp) {
        const rel: Vec3 = [
          b.pos[0] - RAMP_POINT[0],
          b.pos[1] - RAMP_POINT[1],
          b.pos[2] - RAMP_POINT[2],
        ];
        const dist = dot(rel, RAMP_NORMAL) - b.half;
        if (dist < CONTACT_EPS) cubeRamp += 1;
      }
      if (b.pos[1] - b.half < FLOOR_Y + CONTACT_EPS) cubeFloor += 1;
    }

    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const a = bodies[i];
        const b = bodies[j];
        const gap = a.half + b.half + CONTACT_EPS;
        if (
          Math.abs(b.pos[0] - a.pos[0]) < gap &&
          Math.abs(b.pos[1] - a.pos[1]) < gap &&
          Math.abs(b.pos[2] - a.pos[2]) < gap
        ) {
          cubeCube += 1;
        }
      }
    }

    return {
      contacts: cubeRamp + cubeFloor + cubeCube,
      cubeRamp,
      cubeFloor,
      cubeCube,
      settled,
      falling: this.count - settled,
      maxSpeed,
    };
  }

  phase(stats: ContactStats): SimPhase {
    if (stats.maxSpeed > 1.4) return "dropping";
    if (stats.maxSpeed > REST_SPEED) return "settling";
    return "at-rest";
  }
}
