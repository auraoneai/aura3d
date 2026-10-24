import { createImpactWorld, type Impact, type ImpactWorld } from "@aura3d/engine/game";

/** Rim ring centreline radius and tube radius (m). Clearance for a ball centre = RING_R - TUBE_R - ball radius. */
export const RING_R = 0.27;
export const TUBE_R = 0.022;
const RING_SPHERES = 28;

export interface HoopGeometry {
  readonly rim: readonly [number, number, number];
  /** z of the front face of the glass. */
  readonly boardFaceZ: number;
  readonly boardHalfW: number;
  readonly boardY0: number;
  readonly boardY1: number;
}

/** Rim as a ring of small spheres and the glass as a thin box: a swept ball cannot tunnel through either, and every contact emits one impact. */
export function createHoopWorld(hoop: HoopGeometry, onImpact?: (impact: Impact) => void): ImpactWorld {
  const colliders: Parameters<typeof createImpactWorld>[0]["colliders"][number][] = [];
  for (let i = 0; i < RING_SPHERES; i += 1) {
    const a = (i / RING_SPHERES) * Math.PI * 2;
    colliders.push({
      kind: "sphere", id: `rim-${i}`, tag: "rim", radius: TUBE_R, restitution: 0.52, friction: 0.22,
      center: [hoop.rim[0] + Math.cos(a) * RING_R, hoop.rim[1], hoop.rim[2] + Math.sin(a) * RING_R]
    });
  }
  const half = 0.3;
  colliders.push({
    kind: "box", id: "board", tag: "board", restitution: 0.6, friction: 0.05,
    center: [hoop.rim[0], (hoop.boardY0 + hoop.boardY1) / 2, hoop.boardFaceZ - half],
    half: [hoop.boardHalfW, (hoop.boardY1 - hoop.boardY0) / 2, half]
  });
  return createImpactWorld({ colliders, eventMinSpeed: 0.6, ...(onImpact ? { onImpact } : {}) });
}

export interface ShotBall { x: number; y: number; z: number; vx: number; vy: number; vz: number }

/** Fixed substep for the ball: frame-rate independent, and small enough that the launch compensation below is exact to millimetres. */
export const SHOT_SUBSTEP = 1 / 240;

/** Advances `ball` by `dt` in fixed substeps, collecting every rim and glass impact. */
export function advanceShotBall(world: ImpactWorld, ball: ShotBall, radius: number, dt: number, gravity: number): Impact[] {
  const out: Impact[] = [];
  let left = Math.max(0, dt);
  while (left > 1e-9) {
    const h = Math.min(SHOT_SUBSTEP, left);
    out.push(...stepShotBall(world, ball, radius, h, gravity));
    left -= h;
  }
  return out;
}

/** Gravity, then the swept collision step; writes position and velocity back into `ball`. */
export function stepShotBall(world: ImpactWorld, ball: ShotBall, radius: number, dt: number, gravity: number): Impact[] {
  const body = { position: [ball.x, ball.y, ball.z] as [number, number, number], velocity: [ball.vx, ball.vy + gravity * dt, ball.vz] as [number, number, number], radius };
  const impacts = world.step(body, dt);
  ball.x = body.position[0]; ball.y = body.position[1]; ball.z = body.position[2];
  ball.vx = body.velocity[0]; ball.vy = body.velocity[1]; ball.vz = body.velocity[2];
  return impacts;
}

/** True when the ball centre crossed the rim plane downward inside the clear opening (the physics already kept it out of the ring). */
export function crossedRimDownward(prev: readonly [number, number, number], cur: readonly [number, number, number], rim: readonly [number, number, number]): boolean {
  if (!(prev[1] >= rim[1] && cur[1] < rim[1])) return false;
  const u = (prev[1] - rim[1]) / (prev[1] - cur[1] || 1);
  const x = prev[0] + (cur[0] - prev[0]) * u - rim[0];
  const z = prev[2] + (cur[2] - prev[2]) * u - rim[2];
  return Math.hypot(x, z) < RING_R - TUBE_R;
}

const gauss = (rand: () => number): number => Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand());

/**
 * Horizontal aim error (m) from the release read. Quality 1 is nearly exact, a late or early release spreads the shot;
 * distance, a defender in the face and the shooter's skill scale it. Nothing here decides a make: the ball is launched
 * at `rim + error` and the rim and glass colliders decide.
 */
export function aimError(quality: number, distance: number, contest: number, skill: number, rand: () => number): { dx: number; dz: number } {
  const q = Math.max(0, Math.min(1, quality));
  const sigma = (0.012 + Math.pow(1 - q, 1.4) * 0.55) * (1 + 0.07 * distance) * (1 + Math.max(0, -contest) * 1.4) * Math.max(0.6, Math.min(1.4, 1 - skill * 1.2));
  return { dx: gauss(rand) * sigma, dz: gauss(rand) * sigma };
}

/** Launch velocity that arcs from `from` to `target` with a readable apex (the same arc the game always used). */
export function solveLaunch(from: readonly [number, number, number], target: readonly [number, number, number], gravity: number, arcBoost = 0.9): [number, number, number] {
  const horiz = Math.hypot(target[0] - from[0], target[2] - from[2]);
  const apex = Math.max(target[1] + 0.55, Math.max(from[1], target[1]) + arcBoost + horiz * 0.16);
  const vy = Math.sqrt(Math.max(0.1, -2 * gravity * (apex - from[1])));
  const tUp = vy / -gravity;
  const tDown = Math.sqrt(Math.max(0.01, (2 * (apex - target[1])) / -gravity));
  const t = Math.max(0.4, tUp + tDown);
  // advanceShotBall applies gravity before moving (semi-implicit Euler), which lands the ball 0.5*|g|*h*t low; start that much faster.
  return [(target[0] - from[0]) / t, vy - 0.5 * gravity * SHOT_SUBSTEP, (target[2] - from[2]) / t];
}
