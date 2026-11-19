import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBreakawayRimNode,
  buildHoopStanchionNode,
  buildProceduralCourtsideTableNodes,
  buildTautNetTopNode,
  buildTubularBallCartNode,
  netCollarRadius,
  rimRingDims
} from "../../../apps/showcase-aura-hoops-3d/src/art/proceduralModels";
import {
  BALL_CART,
  COMMON_OBSTACLES,
  DECOR_FOOTPRINTS,
  HOOPS_PLAYER_BOUNDS,
  SCORER_TABLE,
  STANCHION_BASE,
  STANCHION_PAD,
  bodyInsideObstacle,
  courtObstacles,
  courtsideBallColliders,
  obstacleClearance,
  resolveObstacles,
  stanchionBallColliders,
  venueBallColliders,
  type BallCollider
} from "../../../apps/showcase-aura-hoops-3d/src/courtObstacles";
import { BALL_R } from "../../../apps/showcase-aura-hoops-3d/src/dribble";
import { BODY_RADIUS, MIN_SEPARATION, passInterceptor, passLaneOpen, passLaunch, separate } from "../../../apps/showcase-aura-hoops-3d/src/rules";
import { RING_R, TUBE_R, advanceShotBall, createHoopWorld } from "../../../apps/showcase-aura-hoops-3d/src/shotPhysics";
import { SET_PIECE_PLACEMENTS } from "../../../apps/showcase-aura-hoops-3d/src/setPieces";
import { BLEACHER_STANDS } from "../../../apps/showcase-aura-hoops-3d/src/courtRigs";

const ROOT = path.resolve(__dirname, "../../..");
const MAIN = readFileSync(path.join(ROOT, "apps/showcase-aura-hoops-3d/src/main.ts"), "utf8");
const GRAVITY = -10.4;
const RIM: [number, number, number] = [0, 3.05, 0];
const HOOP = { rim: RIM, boardFaceZ: -0.35 + 0.06, boardHalfW: 0.9, boardY0: 2.82, boardY1: 3.9 };
const COURTS = ["rucker", "venice", "athens", "manila", "shanghai", "orbit"] as const;

type Json = { name?: string; position?: number[]; rotation?: number[]; geometry?: { positions?: ArrayLike<number> }; children?: unknown[] };
const toJson = (n: unknown): Json => (typeof (n as { toJSON?: unknown })?.toJSON === "function" ? (n as { toJSON(): Json }).toJSON() : n as Json);
function findNode(n: unknown, name: string): Json | undefined {
  const j = toJson(n);
  if (j.name === name) return j;
  for (const c of j.children ?? []) { const hit = findNode(c, name); if (hit) return hit; }
  return undefined;
}
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

describe("Aura Hoops pass-through: the rim you see is the rim the ball hits", () => {
  it("main.ts draws the rim, net collar and net skirt from the physics ring", () => {
    expect(MAIN).toMatch(/ringR: RING_R,\s*\n\s*tubeR: TUBE_R/);
    expect(MAIN).toMatch(/buildTautNetTopNode\(RIM\[1\], LOOK_ORIGINAL, RING_R\)/);
    expect(MAIN).toMatch(/buildTautNetSkirtNode\(RIM\[1\], venue\.id === "rucker", LOOK_ORIGINAL, RING_R\)/);
    expect(MAIN).not.toMatch(/RIM_R\b/);
    expect(rimRingDims({ rimR: 0, ringR: RING_R, tubeR: TUBE_R })).toEqual({ ringR: RING_R, tubeR: TUBE_R });
  });

  it("the drawn ring mesh spans exactly RING_R +- TUBE_R (the collider ring)", () => {
    const node = buildBreakawayRimNode({ overrides: [], rim: RIM, rimR: RING_R + 0.012, ringR: RING_R, tubeR: TUBE_R, boardZ: -0.35, lookOriginal: false });
    const ring = findNode(node, "hoop-rim-ring");
    const pos = ring?.geometry?.positions;
    expect(pos && pos.length).toBeGreaterThan(300);
    let minR = Infinity, maxR = 0, maxY = 0;
    for (let i = 0; i < pos!.length; i += 3) {
      const y = pos![i + 1]!;
      if (y <= 0.002) continue; // braces and net hooks hang below the ring; the upper half of the tube is ring only
      const r = Math.hypot(pos![i]!, pos![i + 2]!);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r); maxY = Math.max(maxY, y);
    }
    expect(minR).toBeCloseTo(RING_R - TUBE_R, 2);
    expect(maxR).toBeCloseTo(RING_R + TUBE_R, 2);
    expect(Math.abs(maxY - TUBE_R)).toBeLessThan(0.002);
    // nothing drawn on the rim assembly reaches into the opening the ball centre is allowed through
    for (let i = 0; i < pos!.length; i += 3) {
      if (Math.abs(pos![i + 1]!) > 0.06) continue;
      expect(Math.hypot(pos![i]!, pos![i + 2]!)).toBeGreaterThan(RING_R - TUBE_R - 0.002);
    }
  });

  it("the net collar hangs outside the clear opening (a make never cuts through the cord)", () => {
    expect(netCollarRadius(RING_R) - 0.0055).toBeGreaterThan(RING_R - TUBE_R);
    const net = findNode(buildTautNetTopNode(RIM[1], false, RING_R), "net-top");
    const pos = net!.geometry!.positions!;
    for (let i = 0; i < pos.length; i += 3) expect(Math.hypot(pos[i]!, pos[i + 2]!)).toBeGreaterThan(RING_R - TUBE_R);
  });
});

describe("Aura Hoops pass-through: athletes never stand inside the stanchion, scorer's table or ball cart", () => {
  it("the drawn furniture stands where its obstacle is", () => {
    expect(toJson(buildHoopStanchionNode([], false)).position).toEqual([STANCHION_BASE[0], 0, STANCHION_BASE[1]]);
    const cart = toJson(buildTubularBallCartNode());
    expect(cart.position).toEqual([BALL_CART.x, 0, BALL_CART.z]);
    expect(cart.rotation?.[1]).toBe(BALL_CART.yaw);
    expect(MAIN).toMatch(/separate\(bodyScratch, undefined, courtObstacles\(venue\.id\), PLAYER_BOUNDS\)/);
    expect(MAIN).toMatch(/resolveObstacles\(a, courtObstacles\(venue\.id\), BODY_RADIUS, PLAYER_BOUNDS\)/);
    // every scorer's-table vertex lies inside the table obstacle (grown by nothing): the capsule covers the mesh
    const table = toJson(buildProceduralCourtsideTableNodes()[0]);
    const steelAndWood = (table.children ?? []).slice(0, 2).map(toJson);
    const tableObstacle = COMMON_OBSTACLES.find((o) => o.id === "scorer-table")!;
    let checked = 0;
    for (const part of steelAndWood) {
      const p = part.geometry!.positions!;
      for (let i = 0; i < p.length; i += 3) {
        // the benches share the mesh: only vertices within 2 m of the table centre belong to it
        if (Math.hypot(p[i]! - SCORER_TABLE.x, p[i + 2]! - SCORER_TABLE.z) > 2) continue;
        expect(obstacleClearance(tableObstacle, p[i]!, p[i + 2]!)).toBeLessThan(0.01);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("separation never leaves a body inside an obstacle, on every court", () => {
    for (const court of COURTS) {
      const obstacles = courtObstacles(court);
      const rand = lcg(court.length * 7919);
      for (let trial = 0; trial < 60; trial++) {
        // a crowd thrown at the furniture: bodies start on and around each obstacle, plus the corner pockets
        const bodies: { x: number; z: number; pinned?: boolean }[] = [];
        for (const o of obstacles) {
          for (let k = 0; k < 3; k++) bodies.push({ x: (o.ax + o.bx) / 2 + (rand() - 0.5) * 2 * (o.r + 0.4), z: (o.az + o.bz) / 2 + (rand() - 0.5) * 2 * (o.r + 0.4) });
        }
        bodies.push({ x: HOOPS_PLAYER_BOUNDS.x1, z: HOOPS_PLAYER_BOUNDS.z0 }, { x: HOOPS_PLAYER_BOUNDS.x0, z: HOOPS_PLAYER_BOUNDS.z1 });
        bodies.push({ x: STANCHION_BASE[0], z: STANCHION_BASE[1], pinned: trial % 2 === 0 });
        for (const b of bodies) {
          b.x = Math.max(HOOPS_PLAYER_BOUNDS.x0, Math.min(HOOPS_PLAYER_BOUNDS.x1, b.x));
          b.z = Math.max(HOOPS_PLAYER_BOUNDS.z0, Math.min(HOOPS_PLAYER_BOUNDS.z1, b.z));
        }
        separate(bodies, MIN_SEPARATION, obstacles, HOOPS_PLAYER_BOUNDS);
        for (const b of bodies) {
          for (const o of obstacles) expect(bodyInsideObstacle(o, b.x, b.z, BODY_RADIUS), `${court} ${o.id} (${b.x.toFixed(2)}, ${b.z.toFixed(2)})`).toBe(false);
        }
      }
    }
  });

  it("pushing a body out of furniture keeps it on the floor it may stand on, corner pockets included", () => {
    for (const court of COURTS) {
      const obstacles = courtObstacles(court);
      const rand = lcg(court.length * 104729);
      const B = HOOPS_PLAYER_BOUNDS;
      const starts = [{ x: B.x1, z: B.z0 }, { x: B.x1 - 0.1, z: B.z0 + 0.1 }, { x: B.x0, z: B.z1 }];
      for (let i = 0; i < 400; i++) starts.push({ x: B.x0 + rand() * (B.x1 - B.x0), z: B.z0 + rand() * (B.z1 - B.z0) });
      for (const p of starts) {
        resolveObstacles(p, obstacles, BODY_RADIUS, B);
        for (const o of obstacles) expect(bodyInsideObstacle(o, p.x, p.z, BODY_RADIUS)).toBe(false);
        expect(p.x >= B.x0 && p.x <= B.x1 && p.z >= B.z0 && p.z <= B.z1).toBe(true);
      }
    }
  });

  it("without obstacles separation is unchanged (normal-play pairs behave as before)", () => {
    const a = [{ x: 0, z: 0 }, { x: 0.1, z: 0 }];
    const b = [{ x: 0, z: 0 }, { x: 0.1, z: 0 }];
    separate(a);
    separate(b, MIN_SEPARATION, []);
    expect(a).toEqual(b);
  });
});

describe("Aura Hoops pass-through: the ball bounces off the stanchion and furniture", () => {
  const world = (hits: BallCollider["tag"][]) => createHoopWorld(HOOP, (i) => hits.push(i.tag), [...stanchionBallColliders(), ...courtsideBallColliders()]);

  it("a ball fired low at the padded pole bounces back and never enters the pad", () => {
    const hits: BallCollider["tag"][] = [];
    const w = world(hits);
    const ball = { x: 0.05, y: 1.0, z: 3, vx: 0, vy: 2.5, vz: -9 };
    let minZ = Infinity;
    for (let i = 0; i < 90; i++) {
      advanceShotBall(w, ball, BALL_R, 1 / 60, GRAVITY);
      if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy) * 0.5; }
      if (ball.y < STANCHION_PAD.top) minZ = Math.min(minZ, ball.z);
      // never inside the pad volume grown by the ball radius
      const inside = Math.abs(ball.x - STANCHION_BASE[0]) < STANCHION_PAD.rx + BALL_R - 0.005 && Math.abs(ball.z - STANCHION_BASE[1]) < STANCHION_PAD.rz + BALL_R - 0.005 && ball.y < STANCHION_PAD.top;
      expect(inside).toBe(false);
    }
    expect(hits).toContain("pole");
    expect(minZ).toBeGreaterThan(STANCHION_BASE[1] + STANCHION_PAD.rz);
    expect(ball.vz).toBeGreaterThan(0);
  });

  it("the ball colliders wrap the drawn post, gooseneck and struts (no drawn steel outside them)", () => {
    const steel = findNode(buildHoopStanchionNode([], false), "hoop-stanchion-steel")!;
    const p = steel.geometry!.positions!;
    // the stanchion colliders plus the glass box createHoopWorld always adds (the backboard frame sits inside it)
    const cols: BallCollider[] = [...stanchionBallColliders(), { kind: "box", id: "board", center: [0, (HOOP.boardY0 + HOOP.boardY1) / 2, HOOP.boardFaceZ - 0.3], half: [HOOP.boardHalfW, (HOOP.boardY1 - HOOP.boardY0) / 2, 0.3] }];
    const gap = (x: number, y: number, z: number): number => {
      let best = Infinity;
      for (const c of cols) {
        if (c.kind === "sphere") best = Math.min(best, Math.hypot(x - c.center[0], y - c.center[1], z - c.center[2]) - c.radius);
        else {
          const dx = Math.max(0, Math.abs(x - c.center[0]) - c.half[0]), dy = Math.max(0, Math.abs(y - c.center[1]) - c.half[1]), dz = Math.max(0, Math.abs(z - c.center[2]) - c.half[2]);
          best = Math.min(best, Math.hypot(dx, dy, dz));
        }
      }
      return best;
    };
    let worst = 0, n = 0, at: number[] = [];
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]! + STANCHION_BASE[0], y = p[i + 1]!, z = p[i + 2]! + STANCHION_BASE[1];
      // everything above the pad: post, gooseneck, struts and the backboard frame
      if (y < STANCHION_PAD.top) continue;
      const g = gap(x, y, z);
      if (g > worst) { worst = g; at = [x, y, z]; }
      n++;
    }
    expect(n).toBeGreaterThan(200);
    expect(worst, `worst drawn steel point ${JSON.stringify(at)}`).toBeLessThan(0.02);
  });

  it("a ball dropping behind the glass onto the gooseneck arm is stopped by it", () => {
    const hits: BallCollider["tag"][] = [];
    const w = world(hits);
    const ball = { x: 0, y: 4.6, z: STANCHION_BASE[1] + 0.38, vx: 0, vy: 0, vz: 0 };
    for (let i = 0; i < 90; i++) advanceShotBall(w, ball, BALL_R, 1 / 60, GRAVITY);
    expect(hits).toContain("pole");
    // the arm (y 2.5..3.4 here) held it up instead of letting it fall through to the floor
    for (const c of stanchionBallColliders()) {
      if (c.kind !== "sphere") continue;
      expect(Math.hypot(ball.x - c.center[0], ball.y - c.center[1], ball.z - c.center[2])).toBeGreaterThan(c.radius + BALL_R - 0.01);
    }
  });

  it("a loose ball rolling at the scorer's table or the ball cart bounces off", () => {
    for (const target of [SCORER_TABLE, BALL_CART]) {
      const hits: BallCollider["tag"][] = [];
      const w = world(hits);
      const dx = target.x > 0 ? 1 : -1;
      const ball = { x: target.x - dx * 3, y: BALL_R, z: target.z, vx: dx * 6, vy: 0, vz: 0 };
      const c = Math.cos(target.yaw), sn = Math.sin(target.yaw);
      for (let i = 0; i < 90; i++) {
        advanceShotBall(w, ball, BALL_R, 1 / 60, 0);
        if (ball.y < BALL_R) ball.y = BALL_R;
        // in the piece's own frame the ball centre never gets inside its box grown by the ball radius
        const rx = ball.x - target.x, rz = ball.z - target.z;
        const lx = c * rx - sn * rz, lz = sn * rx + c * rz;
        expect(Math.abs(lx) < target.halfW + BALL_R - 0.005 && Math.abs(lz) < target.halfD + BALL_R - 0.005).toBe(false);
      }
      expect(hits).toContain("decor");
    }
  });

  it("Shanghai's lamp masts are solid for the ball (and only on Shanghai)", () => {
    expect(venueBallColliders("shanghai").length).toBe(12);
    expect(venueBallColliders("rucker")).toEqual([]);
  });
});

describe("Aura Hoops pass-through: passes do not fly through defenders", () => {
  /** Flies a chest pass the way main.ts does (passLaunch + the shot world), checking the receiver catch, then the lane. */
  function flyPass(from: [number, number, number], to: [number, number, number], defenders: { x: number; z: number; y?: number }[], loft = 0): "caught" | number | "none" {
    const w = createHoopWorld(HOOP, undefined, [...stanchionBallColliders(), ...courtsideBallColliders()]);
    const v = passLaunch(from, to);
    const ball = { x: from[0], y: from[1], z: from[2], vx: v[0], vy: v[1] + loft, vz: v[2] };
    for (let i = 0; i < 120; i++) {
      advanceShotBall(w, ball, BALL_R, 1 / 60, GRAVITY);
      if (Math.hypot(ball.x - to[0], ball.z - to[2]) < 0.9 && ball.y < 2.2) return "caught";
      const hit = passInterceptor(ball, defenders);
      if (hit >= 0) return hit;
      if (ball.y < BALL_R) return "none";
    }
    return "none";
  }

  it("a defender standing on the passing line picks it off before it reaches the receiver", () => {
    expect(flyPass([0, 1.5, 8.6], [0, 1.6, 2.2], [{ x: 0.12, z: 5.4 }])).toBe(0);
    expect(passLaneOpen({ x: 0, z: 8.6 }, { x: 0, z: 2.2 }, [{ x: 0.12, z: 5.4 }])).toBe(false);
  });

  it("the nearest of two defenders in the lane gets it, deterministically", () => {
    const defs = [{ x: 0.3, z: 5.4 }, { x: -0.05, z: 5.5 }];
    expect(flyPass([0, 1.5, 8.6], [0, 1.6, 2.2], defs)).toBe(1);
    expect(flyPass([0, 1.5, 8.6], [0, 1.6, 2.2], defs)).toBe(1);
  });

  it("an open lane is caught, and a lob over the top sails past a defender", () => {
    expect(flyPass([0, 1.5, 8.6], [-4.8, 1.6, 7.2], [{ x: 2, z: 5 }])).toBe("caught");
    expect(passLaneOpen({ x: 0, z: 8.6 }, { x: -4.8, z: 7.2 }, [{ x: 2, z: 5 }])).toBe(true);
    // a lob over the 2.1 m reach sails on; a defender who jumps gets his hand up to it
    expect(passInterceptor({ x: 0, y: 2.5, z: 5 }, [{ x: 0.1, z: 5 }])).toBe(-1);
    expect(passInterceptor({ x: 0, y: 2.5, z: 5 }, [{ x: 0.1, z: 5, y: 0.6 }])).toBe(0);
  });

  it("main.ts checks the lane every pass step and knocks the ball loose off the defender", () => {
    expect(MAIN).toMatch(/const hit = passInterceptor\(ball, lane\);\s*\n\s*if \(hit >= 0\) deflectPass\(lane\[hit\]!\);/);
    expect(MAIN).toMatch(/function deflectPass\(def: AthleteState\): void \{[\s\S]*?ball\.state = "loose";/);
  });
});

describe("Aura Hoops pass-through: decor audit", () => {
  const grown = { x0: HOOPS_PLAYER_BOUNDS.x0 - BODY_RADIUS, x1: HOOPS_PLAYER_BOUNDS.x1 + BODY_RADIUS, z0: HOOPS_PLAYER_BOUNDS.z0 - BODY_RADIUS, z1: HOOPS_PLAYER_BOUNDS.z1 + BODY_RADIUS };
  const reaches = (x: number, z: number, r: number) => {
    const cx = Math.max(grown.x0, Math.min(grown.x1, x)), cz = Math.max(grown.z0, Math.min(grown.z1, z));
    return Math.hypot(x - cx, z - cz) < r;
  };

  it("no decor footprint reaches the playable area unless an obstacle guards it on that court", () => {
    let guarded = 0;
    for (const f of DECOR_FOOTPRINTS) {
      if (!reaches(f.x, f.z, f.r)) continue;
      expect(f.collider, `${f.name} reaches the court with no collider`).toBeDefined();
      for (const court of f.courts === "all" ? COURTS : f.courts) {
        const o = courtObstacles(court).find((ob) => ob.id === f.collider);
        expect(o, `${f.name} on ${court}`).toBeDefined();
        // the obstacle sits on the piece (its centre is inside), not somewhere token
        expect(obstacleClearance(o!, f.x, f.z)).toBeLessThan(0);
        expect(o!.r).toBeGreaterThan(0.15);
      }
      guarded++;
    }
    expect(guarded).toBeGreaterThanOrEqual(3); // at least the stanchion, scorer's table and ball cart
  });

  it("per-court set pieces and bleachers stand clear of the playable area", () => {
    for (const [court, list] of Object.entries(SET_PIECE_PLACEMENTS)) {
      for (const p of list) expect(reaches(p.position[0], p.position[2], 2.5), `${court} ${p.name}`).toBe(false);
    }
    for (const [x, z] of BLEACHER_STANDS) expect(reaches(x, z, 2.5)).toBe(false);
  });
});
