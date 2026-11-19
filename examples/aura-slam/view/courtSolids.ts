/**
 * What the ball can touch, as drawn (owner pass-through audit, 2026-11-18).
 *
 * The sim (physics.ts / contract REAR_BOARDS, pinned by the golden replays) deflects loose balls off three faces only: the
 * padded rear wall behind the far baseline (|x| <= 7.2, z -10.8, 0.765 m) and two angled courtside panels in the far
 * corners (x +-5.2, z -9.3, 1.5 m wide, 0.96 m). Everything else (umpire chair, benches, stands, crowd, urns, TV cameras)
 * has no collider: a dead ball rolls on through it in the sim. So the drawn world is made to match without touching the
 * sim:
 * - every deflector gets a visible solid whose front face lies on the collider plane (`DEFLECTOR_VISUALS`, view/scene.ts);
 * - the drawn ball is contained (`createBallContainment`): when its path would enter a drawn solid that the sim lets it
 *   pass, the drawn ball stops at the contact point and drops onto whatever is under it (the sim ball is already out of
 *   play there; live rallies never reach those solids, tests/unit/aura-slam/court-solids.test.ts).
 * Scene units: x lateral, y up (metres), z along the court (sim x * 5.5, z * 2.177, y * 8).
 */
import { game, group, primitives, type AuraMaterialSpec, type AuraSceneNode } from "@aura3d/engine";
import { REAR_BOARDS, type BoardSpec } from "../contract/venues";
import type { Vec3 } from "../contract/units";
import { NET_POST_X } from "./constants";

/** Drawn tennis-ball radius (view/ball.ts sphere size 0.156) and the court rest height the drawn ball is clamped to. */
export const BALL_DRAW_RADIUS = 0.078;
export const BALL_REST_Y = 0.072;

/** An upright box: centre (cx, cz), half extents along its local x (hx) and z (hz), yaw about +Y, vertical span y0..y1. */
export interface DrawnSolid {
  readonly id: string;
  readonly cx: number;
  readonly cz: number;
  readonly hx: number;
  readonly hz: number;
  readonly yaw: number;
  readonly y0: number;
  readonly y1: number;
  /** the visual of a sim deflector: the sim bounces the ball off its front face */
  readonly collider?: boolean;
  /** set dressing the Moon does not mount (the stadium bowl and Idol bowl pieces) */
  readonly offMoon?: boolean;
}

const box = (id: string, size: Vec3, at: Vec3, extra: Partial<DrawnSolid> = {}): DrawnSolid => ({
  id, cx: at[0], cz: at[2], hx: size[0] / 2, hz: size[2] / 2, yaw: 0, y0: at[1] - size[1] / 2, y1: at[1] + size[1] / 2, ...extra
});

/** Depth of the deflector visuals behind their collider face. */
export const DEFLECTOR_DEPTH = 0.12;
/**
 * The sponsor boards (TT-H2 lettering) form the outer parts of the rear wall: x +-4.3, 3.24 m wide, 0.78 m tall. They and the
 * padded wall segments are shallow (0.14 / 0.06 m) so their back top edges stay under the v2 eye's sight line to the stand line.
 */
export const SPONSOR_BOARD = { x: 4.3, width: 3.24, depth: 0.14, height: 0.78 } as const;
export const REAR_PAD_DEPTH = 0.06;

/** Front face (z) of the rear wall collider and the wall's half width / height (contract REAR_BOARDS[2]). */
const REAR_WALL = REAR_BOARDS.find((b) => b.angle === 0 && b.halfWidth > 2)!;
export const REAR_WALL_FACE_Z = REAR_WALL.y;
export const SPONSOR_BOARD_Z = REAR_WALL_FACE_Z - SPONSOR_BOARD.depth / 2;

/** Padded rear-wall segments between and outside the sponsor boards (x ranges), so the drawn wall spans the collider exactly. */
export function rearWallSegments(): Array<{ x0: number; x1: number }> {
  const inner = SPONSOR_BOARD.x - SPONSOR_BOARD.width / 2;
  const outer = SPONSOR_BOARD.x + SPONSOR_BOARD.width / 2;
  const w = REAR_WALL.halfWidth;
  return [{ x0: -w, x1: -outer }, { x0: -inner, x1: inner }, { x0: outer, x1: w }];
}

/** The two angled courtside panels (every non-rear-wall entry of REAR_BOARDS). */
export const CORNER_PANELS: readonly BoardSpec[] = REAR_BOARDS.filter((b) => b !== REAR_WALL);

/** Box centre of a deflector visual whose front face (normal (sin a, cos a)) lies on the collider plane. */
export function deflectorBoxCentre(board: BoardSpec, depth = DEFLECTOR_DEPTH): { x: number; z: number } {
  return { x: board.x - Math.sin(board.angle) * depth / 2, z: board.y - Math.cos(board.angle) * depth / 2 };
}

/** Visual solids of the sim deflectors: the rear wall (sponsor boards + padded segments) and the two corner panels. */
export function deflectorVisuals(): DrawnSolid[] {
  const out: DrawnSolid[] = [];
  for (const sx of [-1, 1]) {
    out.push(box(`sponsor-board-${sx < 0 ? "left" : "right"}`, [SPONSOR_BOARD.width, SPONSOR_BOARD.height, SPONSOR_BOARD.depth], [sx * SPONSOR_BOARD.x, SPONSOR_BOARD.height / 2, SPONSOR_BOARD_Z], { collider: true }));
  }
  rearWallSegments().forEach((s, i) => {
    out.push(box(`rear-wall-pad-${i}`, [s.x1 - s.x0, REAR_WALL.height, REAR_PAD_DEPTH], [(s.x0 + s.x1) / 2, REAR_WALL.height / 2, REAR_WALL_FACE_Z - REAR_PAD_DEPTH / 2], { collider: true }));
  });
  CORNER_PANELS.forEach((b) => {
    const c = deflectorBoxCentre(b, CORNER_PANEL_DEPTH);
    out.push({ id: `corner-panel-${b.x < 0 ? "left" : "right"}`, cx: c.x, cz: c.z, hx: b.halfWidth, hz: CORNER_PANEL_DEPTH / 2, yaw: b.angle, y0: 0, y1: b.height, collider: true });
  });
  return out;
}

/** Footprint depth of a corner panel: the upright face (DEFLECTOR_DEPTH) and its A-frame back leaf reaching 0.5 m behind. */
export const CORNER_PANEL_DEPTH = DEFLECTOR_DEPTH + 0.5;
export const CORNER_PANEL_TRIM_IDS = ["wt-corner-panel-trim-left", "wt-corner-panel-trim-right"] as const;

/**
 * The two angled courtside A-frame boards the sim deflects balls off (REAR_BOARDS[0..1]): an upright face on the collider
 * plane (normal (sin a, cos a), 2 x halfWidth wide, `height` tall), the LED trim ribbon of the rear boards, and a back leaf.
 */
export function buildCornerPanelNodes(boardMat: AuraMaterialSpec, trimMat: AuraMaterialSpec): AuraSceneNode[] {
  const leafRun = CORNER_PANEL_DEPTH - DEFLECTOR_DEPTH;
  return CORNER_PANELS.map((b, i) => {
    const side = b.x < 0 ? "left" : "right";
    const leafLen = Math.hypot(b.height, leafRun);
    return group(`wt-corner-panel-${side}`, [
      primitives.box({ name: `wt-corner-panel-${side}-face`, size: [b.halfWidth * 2, b.height, DEFLECTOR_DEPTH], material: boardMat })
        .position(0, b.height / 2, -DEFLECTOR_DEPTH / 2).toJSON() as AuraSceneNode,
      primitives.box({ name: `wt-corner-panel-${side}-trim`, size: [b.halfWidth * 2 - 0.2, 0.18, DEFLECTOR_DEPTH + 0.01], castShadow: false, material: trimMat })
        .position(0, 0.42, -DEFLECTOR_DEPTH / 2).runtime(game.runtimeNode(CORNER_PANEL_TRIM_IDS[i]!)).toJSON() as AuraSceneNode,
      primitives.box({ name: `wt-corner-panel-${side}-leaf`, size: [b.halfWidth * 2 - 0.1, leafLen, 0.04], material: boardMat })
        .position(0, b.height / 2, -DEFLECTOR_DEPTH - leafRun / 2).rotate(Math.atan2(leafRun, b.height), 0, 0).toJSON() as AuraSceneNode
    ], { position: [b.x, 0, b.y], rotation: [0, b.angle, 0] }).toJSON() as AuraSceneNode;
  });
}

/** Idol set-piece footprints (view/idolVenue.ts placements; GLB bounds turned by their yaw). */
const UMPIRE_X = -7.35;
function setPieces(): DrawnSolid[] {
  const out: DrawnSolid[] = [
    // slamUmpireChair 1.698 x 2.568 x 2.222 turned a quarter (its depth runs along x), the official seated on it
    box("umpire-chair", [2.222, 2.6, 1.698], [UMPIRE_X, 1.3, 0])
  ];
  for (const sz of [-1, 1]) {
    // benches: two 0.97 m two-seaters (GLB 1.94 x 1.658 x 1.355 at 0.83 m) end to end, turned to face the court
    for (const dz of [-0.485, 0.485]) out.push(box(`bench-${sz}-${dz}`, [0.678, 0.83, 0.971], [UMPIRE_X, 0.415, sz * 3.4 + dz]));
    out.push(box(`cooler-${sz}`, [0.416, 0.58, 0.588], [UMPIRE_X, 0.29, sz * 1.85]));
    out.push(box(`towels-${sz}`, [0.541, 0.88, 0.879], [UMPIRE_X, 0.44, sz * 4.78]));
  }
  for (const sx of [-1, 1]) {
    out.push(box(`net-post-${sx}`, [0.308, 1.08, 0.525], [sx * NET_POST_X, 0.54, 0], { collider: true }));
    out.push(box(`boxwood-urn-${sx}`, [0.8, 1.3, 0.8], [sx * 8.2, 0.65, -11.35], { offMoon: true }));
    out.push(box(`tv-camera-${sx}`, [1.36, 1.9, 1.36], [sx * 10.55, 0.95, 4.4], { offMoon: true }));
    out.push({ id: `floodlight-${sx}`, cx: sx * 12.5, cz: -13.2, hx: 1.8, hz: 0.76, yaw: sx * -0.2, y0: 0, y1: 9.5 });
  }
  return out;
}

/** Stands (view/spectators.ts bleacher boxes), the seated crowd on them (view/crowd.ts rows), the grandstand and facade. */
function stands(): DrawnSolid[] {
  const out: DrawnSolid[] = [
    box("rear-step", [18.6, 0.44, 0.36], [0, 0.22, -11.55]),
    box("rear-tier-1", [18.8, 0.9, 1.44], [0, 0.45, -12.4]),
    box("rear-riser", [19.4, 1.28, 0.44], [0, 0.64, -13.02]),
    box("rear-tier-2", [19.8, 1.65, 1.48], [0, 0.825, -13.6]),
    box("rear-parapet", [20.4, 2.24, 0.46], [0, 1.12, -14.52]),
    box("rear-crowd-1", [18.3, 0.95, 0.6], [0, 1.05 + 0.475, -12.25]),
    box("rear-crowd-2", [19.2, 0.95, 1.25], [0, 1.8 + 0.475, -13.62]),
    box("grandstand", [24, 5.4, 4.2], [0, 2.7, -19.5]),
    box("arcade", [23.62, 5.6, 1.8], [0, 2.8, -16.45], { offMoon: true }),
    box("scoreboard", [4.4, 4.4, 0.95], [0, 2.2, -15.6], { offMoon: true })
  ];
  for (const sx of [-1, 1]) {
    out.push(
      box(`side-step-${sx}`, [0.36, 0.56, 18.0], [sx * 8.32, 0.28, -0.8]),
      box(`side-tier-${sx}`, [1.52, 1.1, 18.2], [sx * 9.2, 0.55, -0.8]),
      box(`side-parapet-${sx}`, [0.28, 1.58, 18.4], [sx * 10.05, 0.79, -0.8]),
      box(`side-crowd-${sx}`, [1.3, 0.95, 17.8], [sx * 9.2, 1.25 + 0.475, -0.8])
    );
  }
  return out;
}

/** Every drawn solid a ball can reach (World Tour look), optionally without the off-Moon set dressing. */
export function drawnSolids(options: { moon?: boolean } = {}): DrawnSolid[] {
  const all = [...deflectorVisuals(), ...setPieces(), ...stands()];
  return options.moon ? all.filter((s) => !s.offMoon) : all;
}

/** True when a point is inside the solid grown by `grow` on every side. */
export function insideSolid(s: DrawnSolid, x: number, y: number, z: number, grow: number): boolean {
  if (y < s.y0 - grow || y > s.y1 + grow) return false;
  const dx = x - s.cx, dz = z - s.cz;
  const c = Math.cos(s.yaw), n = Math.sin(s.yaw);
  const u = dx * c - dz * n; // along the box's local x (cos a, -sin a)
  const v = dx * n + dz * c; // along its face normal (sin a, cos a)
  return Math.abs(u) <= s.hx + grow && Math.abs(v) <= s.hz + grow;
}

/** Contact test grow: a ball centre closer than this to a solid is touching it (the sim's 0.072 deflection distance stays clear). */
export const CONTACT_GROW = BALL_DRAW_RADIUS - 0.01;
/** A frame's travel longer than this (or than 70 m/s over a long frame) is a reset (new point, serve), not flight. */
export const BALL_JUMP = 2.5;
const GRAVITY = 9.81;

export interface BallContainment {
  /** Drawn position for this frame's sim position (scene units); `active` is the sim ball's live flag. */
  step(sim: Vec3, active: boolean, dt: number): Vec3;
  /** Continue from another tracker (the retiring ball takes over the dead ball when the next serve starts). */
  adopt(other: BallContainment): void;
  reset(): void;
  readonly captured: boolean;
  /** internal state (for adopt) */
  readonly snapshot: ContainmentState;
}

export interface ContainmentState { prevSim: Vec3 | null; prevActive: boolean; hold: { x: number; y: number; z: number; vy: number; restY: number } | null }

function firstHit(solids: readonly DrawnSolid[], x: number, y: number, z: number): DrawnSolid | null {
  for (const s of solids) if (insideSolid(s, x, y, z, CONTACT_GROW)) return s;
  return null;
}

/** Height the drawn ball comes to rest at, dropping from (x, y, z): the top of the highest solid under it, else the court. */
export function restHeight(solids: readonly DrawnSolid[], x: number, y: number, z: number): number {
  let top = 0;
  for (const s of solids) {
    if (s.y1 > y + 1e-6 || s.y1 <= top) continue;
    if (insideSolid({ ...s, y0: -Infinity, y1: Infinity }, x, 0, z, BALL_DRAW_RADIUS * 0.5)) top = s.y1;
  }
  return top > 0 ? top + BALL_DRAW_RADIUS : BALL_REST_Y;
}

/** Drawn-ball containment against `solids` (see the module comment). Pure; one tracker per drawn ball. */
export function createBallContainment(solids: readonly DrawnSolid[]): BallContainment {
  let st: ContainmentState = { prevSim: null, prevActive: false, hold: null };
  const api: BallContainment = {
    get captured() { return st.hold !== null; },
    get snapshot() { return st; },
    reset() { st = { prevSim: null, prevActive: false, hold: null }; },
    adopt(other) {
      const o = other.snapshot;
      st = { prevSim: o.prevSim ? [...o.prevSim] as Vec3 : null, prevActive: o.prevActive, hold: o.hold ? { ...o.hold } : null };
    },
    step(sim, active, dt) {
      const prev = st.prevSim;
      const frame = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
      const jumped = !prev || Math.hypot(sim[0] - prev[0], sim[1] - prev[1], sim[2] - prev[2]) > Math.max(BALL_JUMP, 70 * frame);
      const relaunched = active && !st.prevActive;
      if (st.hold && (jumped || relaunched)) st.hold = null;
      if (!st.hold && prev && !jumped && firstHit(solids, sim[0], sim[1], sim[2])) {
        // last free point on the segment prev -> sim (the sim's per-frame travel is far below a solid's depth)
        let lo = 0, hi = 1;
        for (let i = 0; i < 14; i++) {
          const m = (lo + hi) / 2;
          if (firstHit(solids, prev[0] + (sim[0] - prev[0]) * m, prev[1] + (sim[1] - prev[1]) * m, prev[2] + (sim[2] - prev[2]) * m)) hi = m; else lo = m;
        }
        const x = prev[0] + (sim[0] - prev[0]) * lo, y = prev[1] + (sim[1] - prev[1]) * lo, z = prev[2] + (sim[2] - prev[2]) * lo;
        st.hold = { x, y, z, vy: 0, restY: Math.min(y, restHeight(solids, x, y, z)) };
      }
      st.prevSim = [sim[0], sim[1], sim[2]];
      st.prevActive = active;
      const h = st.hold;
      if (!h) return sim;
      const step = Math.min(frame, 0.1);
      if (h.y > h.restY) {
        h.vy -= GRAVITY * step;
        h.y = Math.max(h.restY, h.y + h.vy * step);
      }
      return [h.x, h.y, h.z];
    }
  };
  return api;
}

type SimBall = { x?: number; y?: number; z?: number; active?: boolean } | null | undefined;
const simWorld = (b: NonNullable<SimBall>): Vec3 => [(b.x ?? 0) * 5.5, Math.max(BALL_REST_Y, (b.z ?? 0.3) * 2.177), (b.y ?? 0) * 8];

export interface DrawnBallTracker {
  /** Drawn positions of the match ball and the retiring ball for this frame (`retiring` null when there is none). */
  update(state: { ball?: SimBall; retiringBall?: SimBall; venue?: string }, dt: number): { ball: Vec3; retiring: Vec3 | null };
}

/** The match ball and the retiring ball (the dead ball handed over when the next serve starts) against the drawn solids. */
export function createDrawnBallTracker(): DrawnBallTracker {
  const earth = drawnSolids();
  const moon = drawnSolids({ moon: true });
  let venue = "";
  let main = createBallContainment(earth);
  let retiring = createBallContainment(earth);
  let hadRetiring = false;
  return {
    update(state, dt) {
      const v = state.venue ?? "hard";
      if (v !== venue) {
        venue = v;
        main = createBallContainment(v === "moon" ? moon : earth);
        retiring = createBallContainment(v === "moon" ? moon : earth);
        hadRetiring = false;
      }
      const r = state.retiringBall;
      if (r && !hadRetiring) retiring.adopt(main);
      if (!r && hadRetiring) retiring.reset();
      hadRetiring = Boolean(r);
      const b = state.ball;
      const ball = b ? main.step(simWorld(b), Boolean(b.active), dt) : simWorld({});
      return { ball, retiring: r ? retiring.step(simWorld(r), false, dt) : null };
    }
  };
}
