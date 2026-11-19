import { game, material, primitives, type AuraMaterialSpec, type AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { MatchState } from "../contract/sim";
import type { Vec3 } from "../contract/units";
import type { NodeInput } from "./rigPort";
import type { DrawnBallTracker } from "./courtSolids";
import { COURT_X, COURT_Y, COURT_Z, HIDDEN_SCALE, MARK_COUNT, TRAIL_COUNT, clamp } from "./constants";

export interface BallNodeOptions {
  /** The eight trail spheres (`?look=original`; GU47 TT-V2 draws one `app.effects.trail` ribbon instead). */
  readonly trail?: boolean;
  /** The eight court-mark cylinders (`?look=original`; GU47 TT-V1 stamps `app.effects.decal` marks instead). */
  readonly marks?: boolean;
  /** GU47 TT-M2: the ball's material (felt in the World Tour look; the 4.6.1 emissive ball by default). */
  readonly ballMaterial?: AuraMaterialSpec;
}

export function buildBallNodes(options: BallNodeOptions = {}): NodeInput[] {
  const withTrail = options.trail !== false;
  const withMarks = options.marks !== false;
  const nodes: NodeInput[] = [
    primitives
      .sphere({ name: "tennis-ball", size: [0.156, 0.156, 0.156], material: options.ballMaterial ?? material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 0.42 }) })
      .position(0, 0.8, 6.4)
      .runtime(game.runtimeNode("tennis-ball")),
    // a seam ring around the ball (slightly proud of the felt) so its spin reads on screen; rotated with the ball
    primitives
      .torus({ name: BALL_SEAM_ID, size: [0.186, 0.186, 0.03], params: { tube: 0.06 }, castShadow: false, material: material.pbr({ color: "#f4f6e8", roughness: 0.6 }) })
      .position(0, 0.8, 6.4)
      .runtime(game.runtimeNode(BALL_SEAM_ID)),
    primitives
      .cylinder({ name: "tennis-ball-shadow", size: [0.19, 0.006, 0.19], material: material.pbr({ color: "#122022", roughness: 0.95 }) })
      .position(0, 0.014, 6.4)
      .runtime(game.runtimeNode("tennis-ball-shadow")),
    primitives
      .sphere({ name: "retiring-ball", size: [0.144, 0.144, 0.144], material: material.pbr({ color: "#c9eb3b", roughness: 0.55 }) })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("retiring-ball"))
  ];
  for (let i = 0; withTrail && i < TRAIL_COUNT; i++) {
    nodes.push(
      primitives
        .sphere({ name: `ball-trail-${i}`, size: [0.096, 0.096, 0.096], material: material.emissive({ color: "#e6eb8d", emissive: "#e6eb8d", emissiveIntensity: 0.35 }) })
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`ball-trail-${i}`))
    );
  }
  for (let i = 0; withMarks && i < MARK_COUNT; i++) {
    nodes.push(
      primitives
        .cylinder({ name: `court-mark-${i}`, size: [0.144, 0.006, 0.144], material: material.pbr({ color: "#d6bb95", roughness: 0.75 }) })
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`court-mark-${i}`))
    );
  }
  return nodes;
}

export const BALL_SEAM_ID = "tennis-ball-seam";
export const BALL_RADIUS = 0.078;
/** readable spin cap (rad/s): real topspin (~300 rad/s) would alias to a random flicker at 60 fps */
export const BALL_SPIN_MAX = 38;

type Quat = [number, number, number, number];
const qMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
/** Euler angles for the engine's default "ZYX" order (R = Rz Ry Rx; sceneGraph.eulerToQuaternion) from a unit quaternion. */
export function quatToEulerZYX(q: Quat): [number, number, number] {
  const [x, y, z, w] = q;
  const m11 = 1 - 2 * (y * y + z * z), m21 = 2 * (x * y + z * w), m31 = 2 * (x * z - y * w);
  const m32 = 2 * (y * z + x * w), m33 = 1 - 2 * (x * x + y * y), m12 = 2 * (x * y - z * w), m22 = 1 - 2 * (x * x + z * z);
  const ry = Math.asin(-clamp(m31, -1, 1));
  return Math.abs(m31) < 0.9999999 ? [Math.atan2(m32, m33), ry, Math.atan2(m21, m11)] : [0, ry, Math.atan2(-m12, m22)];
}

/**
 * Ball spin from travel: it rolls about (up x velocity) at speed / radius (capped at BALL_SPIN_MAX so it stays readable),
 * accumulated as a quaternion. Presentation only: reads the sim ball, writes nothing back.
 */
export function createBallSpin() {
  let q: Quat = [0, 0, 0, 1];
  return {
    get quaternion(): Quat { return q; },
    step(ball: { vx?: number; vy?: number; vz?: number; active?: boolean } | undefined, dt: number): [number, number, number] {
      const vx = (ball?.vx ?? 0) * COURT_X, vy = (ball?.vz ?? 0) * COURT_Y, vz = (ball?.vy ?? 0) * COURT_Z;
      // axis = up x v (forward roll); a vertical toss spins about the court's lateral axis
      let ax = vz, az = -vx;
      const horiz = Math.hypot(ax, az);
      if (horiz < 1e-4) { ax = 1; az = 0; } else { ax /= horiz; az /= horiz; }
      const speed = Math.hypot(vx, vy, vz);
      const ang = Math.min(BALL_SPIN_MAX, speed / BALL_RADIUS) * Math.max(0, Math.min(0.1, dt));
      if (ang > 1e-6) {
        const s = Math.sin(ang / 2);
        q = qMul([ax * s, 0, az * s, Math.cos(ang / 2)], q);
        const l = Math.hypot(...q) || 1;
        q = q.map((v) => v / l) as Quat;
      }
      return quatToEulerZYX(q);
    }
  };
}

export interface BallHandles {
  seam?: AuraRuntimeNodeHandle;
  ball: AuraRuntimeNodeHandle;
  shadow: AuraRuntimeNodeHandle;
  retiring: AuraRuntimeNodeHandle;
  trail: AuraRuntimeNodeHandle[];
  marks: AuraRuntimeNodeHandle[];
}

export function resolveBallHandles(req: (id: string) => AuraRuntimeNodeHandle, options: BallNodeOptions = {}): BallHandles {
  return {
    ball: req("tennis-ball"),
    ...((): { seam?: AuraRuntimeNodeHandle } => { try { return { seam: req(BALL_SEAM_ID) }; } catch { return {}; } })(),
    shadow: req("tennis-ball-shadow"),
    retiring: req("retiring-ball"),
    trail: options.trail === false ? [] : Array.from({ length: TRAIL_COUNT }, (_, i) => req(`ball-trail-${i}`)),
    marks: options.marks === false ? [] : Array.from({ length: MARK_COUNT }, (_, i) => req(`court-mark-${i}`))
  };
}

/** Scene-space position of a sim ball (x lateral, z height, y along court). */
export function ballWorld(ball: { x?: number; y?: number; z?: number } | undefined): Vec3 {
  const b = ball ?? { x: 0, y: 0.8, z: 0.3 };
  return [(b.x ?? 0) * COURT_X, Math.max(0.072, (b.z ?? 0.3) * COURT_Y), (b.y ?? 0) * COURT_Z];
}

export interface UpdateBallOptions {
  /** ball + seam rotation (ZYX Euler) from createBallSpin; omitted keeps the ball unrotated */
  readonly spin?: readonly [number, number, number];
  /** Draw the cylinder ground-shadow disc (`?look=original`). GU47 TT-L2: the World Tour look grounds the ball with the key's shadow and contact shadows instead. */
  readonly shadowDisc?: boolean;
  /** Drawn-ball containment (view/courtSolids.ts): the ball stops at drawn solids the sim lets a dead ball roll through. */
  readonly contain?: DrawnBallTracker;
  /** frame seconds for the containment drop */
  readonly dt?: number;
}

/** Ball, ground shadow, retiring ball, flight trail and bounce marks; returns the ball's scene position. */
export function updateBall(h: BallHandles, state: Readonly<MatchState>, options: UpdateBallOptions = {}): Vec3 {
  const ball = state.ball;
  const drawn = options.contain?.update(state as never, options.dt ?? 1 / 60);
  const [bx, by, bz] = drawn?.ball ?? ballWorld(ball);
  h.ball.setPosition(bx, by, bz).setScale([1, 1, 1]).setVisible(true);
  if (options.spin) h.ball.setRotation(options.spin[0], options.spin[1], options.spin[2]);
  h.seam?.setPosition(bx, by, bz).setRotation(...((options.spin ?? [0, 0, 0]) as [number, number, number])).setVisible(true);
  if (options.shadowDisc !== false) {
    const shadowScale = clamp(1 - by * 0.16, 0.35, 1.05);
    h.shadow.setPosition(bx, 0.014, bz).setScale([shadowScale, 1, shadowScale]).setVisible(true);
  } else if (h.shadow.visible !== false) {
    h.shadow.setScale(HIDDEN_SCALE).setVisible(false);
  }

  if (state.retiringBall) {
    const [rx, ry, rz] = drawn?.retiring ?? [state.retiringBall.x * COURT_X, Math.max(0.072, state.retiringBall.z * COURT_Y), state.retiringBall.y * COURT_Z];
    h.retiring.setPosition(rx, ry, rz).setScale([0.92, 0.92, 0.92]).setVisible(true);
  } else {
    h.retiring.setScale(HIDDEN_SCALE).setVisible(false);
  }

  const trail = Array.isArray(ball?.trail) ? ball.trail : [];
  for (let i = 0; i < h.trail.length; i++) {
    const pt = trail[trail.length - 1 - i];
    if (pt && state.mode === "playing" && (ball.active || state.phase === "serveToss")) {
      const s = Math.max(0.25, 1 - i / (TRAIL_COUNT + 1));
      h.trail[i]!.setPosition(pt.x * COURT_X, Math.max(0.06, pt.z * COURT_Y), pt.y * COURT_Z).setScale([s, s, s]).setVisible(true);
    } else {
      h.trail[i]!.setScale(HIDDEN_SCALE).setVisible(false);
    }
  }

  const marks = (Array.isArray(state.marks) ? state.marks : []) as Array<{ x: number; y: number; life: number }>;
  for (let i = 0; i < h.marks.length; i++) {
    const mk = marks[i];
    if (mk && state.mode !== "menu" && mk.life > 0) {
      h.marks[i]!.setPosition(mk.x * COURT_X, 0.016, mk.y * COURT_Z).setScale([1, 1, 1]).setVisible(true);
    } else {
      h.marks[i]!.setScale(HIDDEN_SCALE).setVisible(false);
    }
  }
  return [bx, by, bz];
}
