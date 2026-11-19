/**
 * Owner pass-through audit (2026-11-18): what is drawn matches what the ball can hit, without touching the sim.
 * - Every sim deflector (physics.ts REAR_BOARDS: the rear wall and two angled corner panels) has a drawn solid whose front
 *   face is the collider face, and a probe ball rolled at it bounces exactly where it is drawn (and nowhere beside it).
 * - Over every recorded ball path of the golden replays (evidence/aura-slam/reference.json, six scenarios, and the two
 *   autoplay-golden full matches), the DRAWN ball (view/courtSolids.ts containment) never passes through a drawn solid,
 *   and the live (in-play) ball never reaches the courtside furniture, side stands or TV cameras.
 */
import { describe, expect, it } from "vitest";
import { physics, RADIUS } from "../../../examples/aura-slam/sim/physics";
import { REAR_BOARDS } from "../../../examples/aura-slam/contract/venues";
import { createMatchEngine } from "../../../examples/aura-slam/sim/create";
import {
  BALL_DRAW_RADIUS, CORNER_PANELS, createDrawnBallTracker, deflectorVisuals, drawnSolids, insideSolid, rearWallSegments, REAR_WALL_FACE_Z, restHeight, type DrawnSolid
} from "../../../examples/aura-slam/view/courtSolids";
import { buildTennisScene } from "../../../examples/aura-slam/view/scene";
import { createPoseRig } from "../../../examples/aura-slam/view/poseRig";
import { humanPolicy, mulberry32 } from "../../browser/aura-slam-policy";
import { loadReference, nativeFactory, replayScenario, type EngineFactory } from "./replay-lib";

const SX = 5.5, SY = 2.177, SZ = 8;
/** Scene position where a rolling probe ball, sent along -normal at (face point + 1.2 m of normal), turns back; null = no bounce. */
function probe(at: { x: number; z: number }, normal: { x: number; z: number }): { x: number; z: number } | null {
  const speed = 9;
  const ball: any = {
    x: (at.x + normal.x * 1.2) / SX, y: (at.z + normal.z * 1.2) / SZ, z: RADIUS,
    vx: (-normal.x * speed) / SX, vy: (-normal.z * speed) / SZ, vz: 0, settling: true, rolling: true, active: false, dead: true
  };
  for (let i = 0; i < 240; i++) {
    const before = ball.vx * SX * normal.x + ball.vy * SZ * normal.z;
    physics.advanceLoose(ball, 1 / 240, "hard");
    const after = ball.vx * SX * normal.x + ball.vy * SZ * normal.z;
    if (before < 0 && after > 0) return { x: ball.x * SX, z: ball.y * SZ };
    if (!ball.settling) return null;
  }
  return null;
}

describe("aura-slam: every sim deflector is drawn where it deflects", () => {
  const visuals = deflectorVisuals();

  it("the contract board list is the physics module's list (x, z, half width, height, angle)", () => {
    expect(REAR_BOARDS.map((b) => [b.x, b.y, b.halfWidth, b.height, Math.abs(b.angle)])).toEqual([
      [-5.2, -9.3, 0.75, 0.96, 0.16], [5.2, -9.3, 0.75, 0.96, 0.16], [0, -10.8, 7.2, 0.765, 0]
    ]);
  });

  it("the rear wall: sponsor boards + padded segments span the collider exactly, front faces on its plane, collider height", () => {
    const wall = visuals.filter((v) => v.id.startsWith("sponsor-board") || v.id.startsWith("rear-wall-pad")).sort((a, b) => a.cx - b.cx);
    expect(wall).toHaveLength(5);
    expect(rearWallSegments()).toHaveLength(3);
    for (const w of wall) {
      expect(w.yaw).toBe(0);
      expect(Math.abs(w.cz + w.hz - REAR_WALL_FACE_Z)).toBeLessThan(1e-9);
      expect(w.y0).toBe(0);
      expect(w.y1).toBeGreaterThanOrEqual(0.765 - 1e-9);
      expect(w.y1).toBeLessThanOrEqual(0.765 + 0.03);
    }
    expect(wall[0]!.cx - wall[0]!.hx).toBeCloseTo(-7.2, 9);
    expect(wall[4]!.cx + wall[4]!.hx).toBeCloseTo(7.2, 9);
    for (let i = 1; i < wall.length; i++) expect(wall[i]!.cx - wall[i]!.hx).toBeCloseTo(wall[i - 1]!.cx + wall[i - 1]!.hx, 9);
  });

  it("the two corner panels: yaw = collider angle, face centre on the collider point, collider width and height", () => {
    expect(CORNER_PANELS).toHaveLength(2);
    for (const b of CORNER_PANELS) {
      const v = visuals.find((d) => d.id === `corner-panel-${b.x < 0 ? "left" : "right"}`)!;
      expect(v.yaw).toBe(b.angle);
      expect(v.hx).toBe(b.halfWidth);
      expect(v.y1).toBe(b.height);
      const n = { x: Math.sin(b.angle), z: Math.cos(b.angle) };
      expect(Math.hypot(v.cx + n.x * v.hz - b.x, v.cz + n.z * v.hz - b.y)).toBeLessThan(1e-9);
    }
  });

  it("a ball rolled at each drawn deflector bounces on its drawn face; rolled just beside it, it does not bounce there", () => {
    const faces: Array<{ id: string; centre: { x: number; z: number }; n: { x: number; z: number }; t: { x: number; z: number }; half: number }> = [];
    for (const b of CORNER_PANELS) faces.push({ id: `corner ${b.x}`, centre: { x: b.x, z: b.y }, n: { x: Math.sin(b.angle), z: Math.cos(b.angle) }, t: { x: Math.cos(b.angle), z: -Math.sin(b.angle) }, half: b.halfWidth });
    faces.push({ id: "rear wall", centre: { x: 0, z: REAR_WALL_FACE_Z }, n: { x: 0, z: 1 }, t: { x: 1, z: 0 }, half: 7.2 });
    for (const f of faces) {
      for (const u of [-0.9, -0.5, 0, 0.5, 0.9]) {
        const at = { x: f.centre.x + f.t.x * u * f.half, z: f.centre.z + f.t.z * u * f.half };
        const hit = probe(at, f.n);
        expect(hit, `${f.id} u=${u}`).not.toBeNull();
        // the ball centre turns back one contact radius (0.072) in front of the drawn face
        const gap = (hit!.x - at.x) * f.n.x + (hit!.z - at.z) * f.n.z;
        expect(gap, `${f.id} u=${u}`).toBeGreaterThan(0.05);
        expect(gap, `${f.id} u=${u}`).toBeLessThan(0.09);
        // and that point is in front of a drawn deflector solid, within the drawn ball radius
        const touching = visuals.some((v) => insideSolid(v, hit!.x, 0.08, hit!.z, BALL_DRAW_RADIUS + 0.01));
        expect(touching, `${f.id} u=${u}`).toBe(true);
      }
      if (f.id === "rear wall") continue;
      for (const u of [-1, 1]) {
        const at = { x: f.centre.x + f.t.x * u * (f.half + 0.3), z: f.centre.z + f.t.z * u * (f.half + 0.3) };
        const hit = probe(at, f.n);
        if (hit) expect(Math.hypot(hit.x - at.x, hit.z - at.z), `${f.id} beside u=${u}`).toBeGreaterThan(0.5);
      }
    }
  });

  it("the scene mounts both corner panels at the collider pose and the rear-wall statics", () => {
    type N = { name?: string; position?: number[]; rotation?: number[]; children?: N[] };
    const flat = (nodes: N[] = []): N[] => nodes.flatMap((n) => [n, ...flat(n.children)]);
    const nodes = flat((buildTennisScene(createPoseRig()).toJSON() as unknown as { nodes: N[] }).nodes);
    for (const b of CORNER_PANELS) {
      const g = nodes.find((n) => n.name === `wt-corner-panel-${b.x < 0 ? "left" : "right"}`);
      expect(g, String(b.x)).toBeDefined();
      expect(g!.position?.[0]).toBeCloseTo(b.x, 9);
      expect(g!.position?.[2]).toBeCloseTo(b.y, 9);
      for (const name of ["face", "trim", "leaf"]) expect(nodes.some((n) => n.name === `wt-corner-panel-${b.x < 0 ? "left" : "right"}-${name}`)).toBe(true);
    }
    expect(nodes.some((n) => n.name === "static-sponsorBoard")).toBe(true);
  }, 60_000);
});

/** Every frame of every golden path: sim state after each fixed step (the page renders the latest state each frame). */
function forEachGoldenFrame(visit: (state: any, run: string) => void): void {
  const ref = loadReference();
  for (const sc of ref.scenarios) {
    const make: EngineFactory = (o) => {
      const e = nativeFactory(o);
      const step = e.step.bind(e);
      e.step = (dt) => { step(dt); visit(e.state, sc.id); };
      return e;
    };
    replayScenario(sc, make);
  }
  for (const sc of [{ options: { difficulty: "club", venue: "hard" }, seed: 20261023 }, { options: { difficulty: "pro", venue: "clay" }, seed: 7 }]) {
    const e: any = createMatchEngine({ onEvent: () => {} } as never);
    e.resetMatch(sc.options);
    const rng = mulberry32(sc.seed);
    for (let t = 0; t < 400_000; t++) {
      humanPolicy(e, rng, t);
      e.step(1 / 60);
      visit(e.state, `golden-${sc.options.difficulty}-${sc.options.venue}`);
      if (e.state.mode === "gameover") break;
    }
  }
}

describe("aura-slam: recorded ball paths never pass through anything drawn", () => {
  const PENETRATION_GROW = BALL_DRAW_RADIUS - 0.03;
  const earth = drawnSolids();
  const moon = drawnSolids({ moon: true });
  const COURTSIDE = /^(umpire-chair|bench-|cooler-|towels-|side-|tv-camera-)/;
  const world = (b: any): [number, number, number] => [b.x * SX, Math.max(0.072, b.z * SY), b.y * SZ];

  it("drawn balls: no penetration; live balls: never at the courtside furniture; contained balls come to rest", () => {
    const drawnHits: string[] = [];
    const liveCourtside: string[] = [];
    let frames = 0, rawHits = 0, captures = 0, floating = 0;
    const trackers = new Map<string, ReturnType<typeof createDrawnBallTracker>>();
    const held = new Map<string, { y: number; frames: number }>();
    forEachGoldenFrame((state, run) => {
      let tracker = trackers.get(run);
      if (!tracker) trackers.set(run, (tracker = createDrawnBallTracker()));
      const solids = state.venue === "moon" ? moon : earth;
      const drawn = tracker.update(state, 1 / 60);
      frames++;
      for (const [label, p] of [["ball", drawn.ball], ["retiring", drawn.retiring]] as const) {
        if (!p) continue;
        for (const s of solids) if (insideSolid(s, p[0], p[1], p[2], PENETRATION_GROW)) drawnHits.push(`${run} ${label} ${s.id} @${state.time.toFixed(2)}`);
      }
      const sim = world(state.ball);
      if (solids.some((s) => insideSolid(s, sim[0], sim[1], sim[2], PENETRATION_GROW))) rawHits++;
      if (state.ball.active) {
        for (const s of solids) if (COURTSIDE.test(s.id) && insideSolid(s, sim[0], sim[1], sim[2], PENETRATION_GROW)) liveCourtside.push(`${run} ${s.id}`);
      }
      // a ball stopped by a solid drops onto what is under it within a second (never left hanging)
      const differs = Math.hypot(drawn.ball[0] - sim[0], drawn.ball[1] - sim[1], drawn.ball[2] - sim[2]) > 1e-9;
      const h = held.get(run);
      if (differs) {
        if (!h) { captures++; held.set(run, { y: drawn.ball[1], frames: 0 }); } else { h.frames++; if (h.frames === 60 && drawn.ball[1] > restHeight(solids, drawn.ball[0], drawn.ball[1], drawn.ball[2]) + 1e-6) floating++; }
      } else if (h) held.delete(run);
    });
    expect(frames).toBeGreaterThan(200_000);
    // the sim alone runs dead balls through stands, chair and benches; the drawn ball never does
    expect(rawHits).toBeGreaterThan(500);
    expect(captures).toBeGreaterThan(20);
    expect(drawnHits.slice(0, 10)).toEqual([]);
    expect(liveCourtside.slice(0, 10)).toEqual([]);
    expect(floating).toBe(0);
  }, 600_000);

  it("solids are boxes with positive extents; deflector visuals are flagged as colliders", () => {
    const ids = new Set<string>();
    for (const s of earth as DrawnSolid[]) {
      expect(ids.has(s.id), s.id).toBe(false);
      ids.add(s.id);
      expect(s.hx > 0 && s.hz > 0 && s.y1 > s.y0, s.id).toBe(true);
    }
    expect(earth.filter((s) => s.collider).map((s) => s.id).filter((id) => !id.startsWith("net-post"))).toHaveLength(7);
  });
});
