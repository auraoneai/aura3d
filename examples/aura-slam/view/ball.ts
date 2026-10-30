import { game, material, primitives, type AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { MatchState } from "../contract/sim";
import type { Vec3 } from "../contract/units";
import type { NodeInput } from "./rigPort";
import { COURT_X, COURT_Y, COURT_Z, HIDDEN_SCALE, MARK_COUNT, TRAIL_COUNT, clamp } from "./constants";

export function buildBallNodes(): NodeInput[] {
  const nodes: NodeInput[] = [
    primitives
      .sphere({ name: "tennis-ball", size: [0.156, 0.156, 0.156], material: material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 0.42 }) })
      .position(0, 0.8, 6.4)
      .runtime(game.runtimeNode("tennis-ball")),
    primitives
      .cylinder({ name: "tennis-ball-shadow", size: [0.19, 0.006, 0.19], material: material.pbr({ color: "#122022", roughness: 0.95 }) })
      .position(0, 0.014, 6.4)
      .runtime(game.runtimeNode("tennis-ball-shadow")),
    primitives
      .sphere({ name: "retiring-ball", size: [0.144, 0.144, 0.144], material: material.pbr({ color: "#c9eb3b", roughness: 0.55 }) })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("retiring-ball"))
  ];
  for (let i = 0; i < TRAIL_COUNT; i++) {
    nodes.push(
      primitives
        .sphere({ name: `ball-trail-${i}`, size: [0.096, 0.096, 0.096], material: material.emissive({ color: "#e6eb8d", emissive: "#e6eb8d", emissiveIntensity: 0.35 }) })
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`ball-trail-${i}`))
    );
  }
  for (let i = 0; i < MARK_COUNT; i++) {
    nodes.push(
      primitives
        .cylinder({ name: `court-mark-${i}`, size: [0.144, 0.006, 0.144], material: material.pbr({ color: "#d6bb95", roughness: 0.75 }) })
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`court-mark-${i}`))
    );
  }
  return nodes;
}

export interface BallHandles {
  ball: AuraRuntimeNodeHandle;
  shadow: AuraRuntimeNodeHandle;
  retiring: AuraRuntimeNodeHandle;
  trail: AuraRuntimeNodeHandle[];
  marks: AuraRuntimeNodeHandle[];
}

export function resolveBallHandles(req: (id: string) => AuraRuntimeNodeHandle): BallHandles {
  return {
    ball: req("tennis-ball"),
    shadow: req("tennis-ball-shadow"),
    retiring: req("retiring-ball"),
    trail: Array.from({ length: TRAIL_COUNT }, (_, i) => req(`ball-trail-${i}`)),
    marks: Array.from({ length: MARK_COUNT }, (_, i) => req(`court-mark-${i}`))
  };
}

/** Scene-space position of a sim ball (x lateral, z height, y along court). */
export function ballWorld(ball: { x?: number; y?: number; z?: number } | undefined): Vec3 {
  const b = ball ?? { x: 0, y: 0.8, z: 0.3 };
  return [(b.x ?? 0) * COURT_X, Math.max(0.072, (b.z ?? 0.3) * COURT_Y), (b.y ?? 0) * COURT_Z];
}

export interface UpdateBallOptions {
  /** Draw the cylinder ground-shadow disc (`?look=original`). GU47 TT-L2: the World Tour look grounds the ball with the key's shadow and contact shadows instead. */
  readonly shadowDisc?: boolean;
}

/** Ball, ground shadow, retiring ball, flight trail and bounce marks; returns the ball's scene position. */
export function updateBall(h: BallHandles, state: Readonly<MatchState>, options: UpdateBallOptions = {}): Vec3 {
  const ball = state.ball;
  const [bx, by, bz] = ballWorld(ball);
  h.ball.setPosition(bx, by, bz).setScale([1, 1, 1]).setVisible(true);
  if (options.shadowDisc !== false) {
    const shadowScale = clamp(1 - by * 0.16, 0.35, 1.05);
    h.shadow.setPosition(bx, 0.014, bz).setScale([shadowScale, 1, shadowScale]).setVisible(true);
  } else if (h.shadow.visible !== false) {
    h.shadow.setScale(HIDDEN_SCALE).setVisible(false);
  }

  if (state.retiringBall) {
    const rx = state.retiringBall.x * COURT_X;
    const ry = Math.max(0.072, state.retiringBall.z * COURT_Y);
    const rz = state.retiringBall.y * COURT_Z;
    h.retiring.setPosition(rx, ry, rz).setScale([0.92, 0.92, 0.92]).setVisible(true);
  } else {
    h.retiring.setScale(HIDDEN_SCALE).setVisible(false);
  }

  const trail = Array.isArray(ball?.trail) ? ball.trail : [];
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const pt = trail[trail.length - 1 - i];
    if (pt && state.mode === "playing" && (ball.active || state.phase === "serveToss")) {
      const s = Math.max(0.25, 1 - i / (TRAIL_COUNT + 1));
      h.trail[i]!.setPosition(pt.x * COURT_X, Math.max(0.06, pt.z * COURT_Y), pt.y * COURT_Z).setScale([s, s, s]).setVisible(true);
    } else {
      h.trail[i]!.setScale(HIDDEN_SCALE).setVisible(false);
    }
  }

  const marks = (Array.isArray(state.marks) ? state.marks : []) as Array<{ x: number; y: number; life: number }>;
  for (let i = 0; i < MARK_COUNT; i++) {
    const mk = marks[i];
    if (mk && state.mode !== "menu" && mk.life > 0) {
      h.marks[i]!.setPosition(mk.x * COURT_X, 0.016, mk.y * COURT_Z).setScale([1, 1, 1]).setVisible(true);
    } else {
      h.marks[i]!.setScale(HIDDEN_SCALE).setVisible(false);
    }
  }
  return [bx, by, bz];
}
