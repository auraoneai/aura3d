import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });
import { collideGoalFrame, constrainPlayerPosition, createSim, separatePlayers } from "../../../apps/showcase-aura-fc-3d/src/game/sim";
import {
  BALL_R, BALL_VIS_R, BAR_Y, CAGE_INNER_X, CAGE_INNER_Z, CAGE_TOP, FRAME_HIT_R, GOAL_DEPTH, GOAL_H, GOAL_HALF_W,
  PITCH_HX, PITCH_HZ, PLAYER_MIN_SEP, PLAYER_R, POST_R, POST_X, POST_Z
} from "../../../apps/showcase-aura-fc-3d/src/game/dims";
import type { MatchConfig, MatchState, SimEvent, UserInputFrame } from "../../../apps/showcase-aura-fc-3d/src/game/types";
import { buildFcScene, HOARDING_END_X, hoardingTransforms } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import { buildFifaGoalFrameNode, buildMatchBallNode } from "../../../apps/showcase-aura-fc-3d/src/art/proceduralModels";
import { assets as routeAssets } from "../../../apps/showcase-aura-fc-3d/src/aura-assets.route";

/** Owner rule: nothing visibly passes through anything solid (ball ↔ woodwork / nets / cage, player ↔ player / frame). */
const IDLE: UserInputFrame = {
  move: [0, 0], sprint: false, passShort: false, passDriven: false, shootHeld: false, shootReleased: false,
  skillStepover: false, skillChop: false, switchPlayer: false, pause: false
};
const DT = 1 / 60;
const CPU: MatchConfig = { mode: "quick", venue: "munich", homeClub: "aurora", awayClub: "iron", userTeam: null, difficulty: 0.65, goldenGoal: false, shootoutOnTie: false };
const seedOf = (i: number) => (i * 2654435761) >>> 0;
const LIFT = BALL_VIS_R - BALL_R;
const VENUES = ["munich", "kyoto", "favela", "lagos", "uyuni", "glacier"] as const;

/** A live sim with every player parked far from the action so nobody traps the test ball. */
function liveSim(venue: MatchConfig["venue"] = "munich") {
  const sim = createSim();
  sim.startMatch({ ...CPU, venue, userTeam: 0 });
  const s = sim.state;
  s.phase = "live";
  s.players.forEach((p, i) => { p.x = -12 + i * 1.5; p.z = (p.team ? 1 : -1) * 12; p.vx = 0; p.vz = 0; });
  return sim;
}

/** Distance from the drawn ball centre to the crossbar axis (only meaningful between the posts). */
function barDistance(b: { x: number; y: number; z: number }) {
  const gx = Math.sign(b.x || 1) * POST_X;
  return Math.hypot(b.x - gx, b.y + LIFT - BAR_Y);
}

function minPairDistance(ps: readonly { x: number; z: number }[]) {
  let m = Infinity;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) m = Math.min(m, Math.hypot(ps[i]!.x - ps[j]!.x, ps[i]!.z - ps[j]!.z));
  return m;
}

/** Every way a player can be inside something solid; empty when he is clear. */
function playerViolations(p: { id: string; x: number; z: number }, walled: boolean): string[] {
  const out: string[] = [];
  const eps = 1e-6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const d = Math.hypot(p.x - sx * POST_X, p.z - sz * POST_Z);
    if (d < POST_R + PLAYER_R - eps) out.push(`${p.id} inside post (${sx},${sz}) d=${d.toFixed(3)}`);
  }
  if (Math.abs(p.x) > PITCH_HX + eps) {
    if (Math.abs(p.z) > POST_Z - POST_R - PLAYER_R + eps) out.push(`${p.id} in the goal box outside the mouth (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
    if (Math.abs(p.x) > PITCH_HX + GOAL_DEPTH - PLAYER_R + eps) out.push(`${p.id} through the back net`);
  }
  if (walled) {
    if (Math.abs(p.z) > CAGE_INNER_Z - PLAYER_R + eps) out.push(`${p.id} in the cage side wall z=${p.z.toFixed(2)}`);
  }
  return out;
}

describe("(a) the crossbar is solid from every side", () => {
  it("a dipping ball onto the bar rebounds instead of dropping through it", () => {
    const sim = liveSim();
    const s = sim.state, b = s.ball;
    // drawn centre above the bar, dipping onto its top while moving toward goal: the old rising-only bar let it drop
    // straight through the bar and under it into the net
    b.x = POST_X - 0.5; b.y = BAR_Y + 0.35 - LIFT; b.z = 0;
    b.vx = 8; b.vy = -3; b.vz = 0; b.mode = "flight"; b.lastShot = "shot"; b.freeT = 1; b.rolling = false; b.spin = 0;
    const ev: SimEvent[] = [];
    let minD = Infinity, after: { vx: number; vy: number } | null = null;
    for (let i = 0; i < 40 && s.phase === "live"; i++) {
      const e = sim.step(DT, IDLE);
      ev.push(...e);
      if (Math.abs(b.z) < POST_Z) minD = Math.min(minD, barDistance(b));
      if (!after && e.some((x) => x.type === "crossbar")) after = { vx: b.vx, vy: b.vy };
    }
    expect(ev.some((e) => e.type === "crossbar")).toBe(true);
    expect(after!.vy).toBeGreaterThan(0);                 // bounced up off the top of the bar
    expect(minD).toBeGreaterThanOrEqual(FRAME_HIT_R - 1e-3); // drawn ball never overlaps the drawn bar
    expect(s.score).toEqual([0, 0]);
  });

  it("a ball dropping straight down onto the bar bounces up (pure collider)", () => {
    const b = { x: POST_X, y: BAR_Y + FRAME_HIT_R - LIFT - 0.02, z: 0.5, vx: 0, vy: -4, vz: 0 };
    const hit = collideGoalFrame(b, POST_X, BAR_Y + FRAME_HIT_R - LIFT + 0.05, 0.5);
    expect(hit).toBe("crossbar");
    expect(b.vy).toBeGreaterThan(0);
    expect(barDistance(b)).toBeGreaterThanOrEqual(FRAME_HIT_R - 1e-3);
  });

  it("a rising ball clipping the underside is sent down, and a fast strike cannot tunnel the bar in one long step", () => {
    const b = { x: POST_X - 0.5, y: BAR_Y - 0.3 - LIFT, z: 1, vx: 30, vy: 6, vz: 0 };
    // one 1/20 s step: 1.5 m, straight through the bar zone
    const px = b.x, py = b.y, pz = b.z;
    b.x += b.vx / 20; b.y += b.vy / 20;
    expect(collideGoalFrame(b, px, py, pz)).toBe("crossbar");
    expect(b.vy).toBeLessThan(0);
    expect(barDistance(b)).toBeGreaterThanOrEqual(FRAME_HIT_R - 1e-3);
    expect(b.x).toBeLessThan(POST_X);   // stopped at first contact, not carried on past the bar
  });

  it("a ball running along the goal line into a post stops at the drawn post surface", () => {
    const sim = liveSim();
    const s = sim.state, b = s.ball;
    b.x = POST_X; b.y = BALL_R; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 8; b.mode = "loose"; b.lastShot = "none"; b.freeT = 1; b.rolling = true;
    let minD = Infinity;
    const ev: SimEvent[] = [];
    for (let i = 0; i < 40 && s.phase === "live"; i++) {
      ev.push(...sim.step(DT, IDLE));
      minD = Math.min(minD, Math.hypot(b.x - POST_X, b.z - POST_Z));
    }
    expect(ev.some((e) => e.type === "post")).toBe(true);
    expect(minD).toBeGreaterThanOrEqual(FRAME_HIT_R - 1e-3);
  });
});

describe("(b) players never overlap", () => {
  it("ten players driven at one point never get closer than the minimum separation (pure pass)", () => {
    const ps = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return { x: 4 + Math.cos(a) * 3, z: 2 + Math.sin(a) * 3, vx: 0, vz: 0 };
    });
    for (let step = 0; step < 240; step++) {
      for (const p of ps) {
        const dx = 4 - p.x, dz = 2 - p.z, d = Math.hypot(dx, dz) || 1;
        p.vx = (dx / d) * 6; p.vz = (dz / d) * 6;
        p.x += p.vx * DT; p.z += p.vz * DT;
      }
      separatePlayers(ps, () => false, (i) => constrainPlayerPosition(ps[i]!, false));
      expect(minPairDistance(ps)).toBeGreaterThanOrEqual(PLAYER_MIN_SEP - 1e-3);
    }
  });

  it("a pinned (scripted) player is never moved; the other player takes the whole correction", () => {
    const ps = [{ x: 0, z: 0, vx: 0, vz: 0 }, { x: 0.2, z: 0, vx: -3, vz: 0 }];
    separatePlayers(ps, (i) => i === 0, () => {});
    expect(ps[0]).toMatchObject({ x: 0, z: 0 });
    expect(ps[1]!.x).toBeCloseTo(PLAYER_MIN_SEP, 6);
    expect(ps[1]!.vx).toBeGreaterThanOrEqual(0);   // closing speed removed
  });

  it("sim: every player charged at the same spot ends up separated, step by step", () => {
    const sim = createSim();
    sim.startMatch({ ...CPU, userTeam: 0 });
    const s = sim.state;
    s.phase = "halftime"; s.phaseT = 0;   // players drift on their own velocity (celebrating), no AI steering
    s.players.forEach((p, i) => {
      const a = (i / s.players.length) * Math.PI * 2;
      p.x = 5 + Math.cos(a) * 1.5; p.z = 2 + Math.sin(a) * 1.5;
      p.vx = -Math.cos(a) * 12; p.vz = -Math.sin(a) * 12; p.celebrateT = 2;
    });
    for (let i = 0; i < 90; i++) {
      sim.step(DT, IDLE);
      expect(minPairDistance(s.players)).toBeGreaterThanOrEqual(PLAYER_MIN_SEP - 1e-3);
    }
  });

  it("CPU matches: no two players overlap at any step of live play", () => {
    for (const [venue, seed] of [["munich", 3], ["favela", 4]] as const) {
      const sim = createSim();
      sim.setAutopilot(true);
      sim.startMatch({ ...CPU, venue, seed: seedOf(seed) });
      const s = sim.state;
      let worst = Infinity;
      for (let i = 0; i < 90 * 60 && s.phase !== "ended"; i++) {
        sim.step(DT, IDLE);
        if (s.phase === "live") worst = Math.min(worst, minPairDistance(s.players));
      }
      expect(worst, venue).toBeGreaterThanOrEqual(PLAYER_MIN_SEP - 1e-3);
    }
  });
});

describe("(c) players stay out of the posts, the goal box and the cage", () => {
  it("CPU matches (incl. a shootout) never leave a player inside a post or in the goal box outside the mouth", () => {
    for (const [venue, seed, shootout] of [["munich", 1, false], ["favela", 2, false], ["kyoto", 5, true]] as const) {
      const sim = createSim();
      sim.setAutopilot(true);
      sim.startMatch({ ...CPU, venue, seed: seedOf(seed), ...(shootout ? { shootoutOnTie: true } : {}) });
      const s = sim.state;
      const walled = venue === "favela";
      const bad: string[] = [];
      for (let i = 0; i < 200 * 60 && s.phase !== "ended" && bad.length < 5; i++) {
        sim.step(DT, IDLE);
        for (const p of s.players) bad.push(...playerViolations(p, walled));
      }
      expect(bad, venue).toEqual([]);
    }
  });

  it("every player state (run, slide, stun, celebrate, dive) is held out of the frame and the nets", () => {
    const cases: [string, (p: MatchState["players"][number]) => void][] = [
      ["stunned, drifting into the side netting", (p) => { p.x = PITCH_HX - 0.2; p.z = GOAL_HALF_W + 0.5; p.vx = 8; p.vz = -6; p.stunT = 1; }],
      ["celebrating, drifting through the back net", (p) => { p.x = PITCH_HX - 0.5; p.z = 0; p.vx = 14; p.vz = 0; p.celebrateT = 2; }],
      ["sliding into a post", (p) => { p.x = PITCH_HX - 1.5; p.z = POST_Z; p.slideT = 0.55; p.slideDir = [1, 0]; p.slideWon = true; }],
      ["sliding along the goal line beside the goal", (p) => { p.x = PITCH_HX + 0.4; p.z = GOAL_HALF_W + 2; p.slideT = 0.55; p.slideDir = [0, -1]; p.slideWon = true; }],
      ["inside the goal, drifting out through the side netting", (p) => { p.x = PITCH_HX + 1; p.z = 2; p.vx = 0; p.vz = 10; p.stunT = 1; }]
    ];
    for (const venue of ["munich", "favela"] as const) {
      for (const [label, place] of cases) {
        const sim = createSim();
        sim.startMatch({ ...CPU, venue, userTeam: 0 });
        const s = sim.state;
        s.phase = "goal"; s.phaseT = 0;
        const p = s.players.find((x) => !x.isKeeper)!;
        for (const o of s.players) if (o !== p) { o.x = -10; o.z = (o.team ? 1 : -1) * 10 + s.players.indexOf(o); }
        place(p);
        for (let i = 0; i < 45; i++) {
          sim.step(DT, IDLE);
          expect(playerViolations(p, venue === "favela"), `${venue}: ${label}`).toEqual([]);
        }
      }
    }
  });

  it("a keeper may stand in the mouth; a player beside the goal is held on the goal line", () => {
    const keeper = { x: PITCH_HX + 0.5, z: 1.2 };
    constrainPlayerPosition(keeper, false);
    expect(keeper).toEqual({ x: PITCH_HX + 0.5, z: 1.2 });
    const wide = { x: PITCH_HX + 0.5, z: GOAL_HALF_W + 1 };
    constrainPlayerPosition(wide, false);
    expect(wide.x).toBe(PITCH_HX);
    const caged = { x: PITCH_HX + 0.5, z: PITCH_HZ + 0.4 };
    constrainPlayerPosition(caged, true);
    expect(caged.z).toBeCloseTo(CAGE_INNER_Z - PLAYER_R, 6);
    expect(caged.x).toBeCloseTo(CAGE_INNER_X - PLAYER_R, 6);
  });
});

describe("(d) decor stays off the playable pitch + goal volume", () => {
  type Box = { x0: number; x1: number; z0: number; z1: number };
  const PITCH: Box = { x0: -PITCH_HX - 0.6, x1: PITCH_HX + 0.6, z0: -PITCH_HZ - 0.4, z1: PITCH_HZ + 0.4 };
  const GOALS: Box[] = [-1, 1].map((sx) => ({
    x0: Math.min(sx * PITCH_HX, sx * (PITCH_HX + GOAL_DEPTH)), x1: Math.max(sx * PITCH_HX, sx * (PITCH_HX + GOAL_DEPTH)),
    z0: -GOAL_HALF_W, z1: GOAL_HALF_W
  }));
  const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
  const footprint = (pos: number[], scale: number | number[] | undefined, rotY = 0, half = 0.5): Box => {
    const s = Array.isArray(scale) ? scale : [scale ?? 1, scale ?? 1, scale ?? 1];
    const hx = (s[0]! * half), hz = (s[2]! * half);
    const c = Math.abs(Math.cos(rotY)), sn = Math.abs(Math.sin(rotY));
    const ex = hx * c + hz * sn, ez = hx * sn + hz * c;
    return { x0: pos[0]! - ex, x1: pos[0]! + ex, z0: pos[2]! - ez, z1: pos[2]! + ez };
  };
  // ground markings, the goals and cage themselves (colliders), players / ball / referee (dynamic), effects and post
  const SKIP = /^(aura-look|fc-ground|fc-apron|fc-pitch|fc-stripes|fc-lines|line-|pen-spot|fc-goal-mesh|net-|cage-|fc-flood-pools|fc-corner-|[ha]-(gk|df\d|mf|fw)-|fc-ball-|fc-aim|fc-goal-ring|fc-lab|fc-turf|fc-goal-sparks|fc-confetti|fc-referee|fc-dome)/;

  it("the end hoardings stand behind the back net, and no hoarding crosses the pitch or a goal", () => {
    expect(HOARDING_END_X).toBeGreaterThan(PITCH_HX + GOAL_DEPTH + 0.3);
    for (const t of hoardingTransforms()) {
      const fp = footprint(t.position, t.scale, t.rotation[1]);
      expect(overlaps(fp, PITCH)).toBe(false);
      for (const g of GOALS) expect(overlaps(fp, g)).toBe(false);
    }
  });

  it("no static decor footprint in any venue intersects the playable volume (corner flags only at the corners)", () => {
    for (const v of VENUES) {
      const j = JSON.parse(JSON.stringify(buildFcScene(v)));
      const bad: string[] = [];
      for (const n of j.nodes as any[]) {
        const name = String(n.name ?? "");
        if (/^fc-corner-(poles|flags)$/.test(name)) {
          for (const t of n.instances ?? []) {
            expect(Math.abs(Math.abs(t.position[0]) - PITCH_HX)).toBeLessThan(0.5);
            expect(Math.abs(Math.abs(t.position[2]) - PITCH_HZ)).toBeLessThan(0.5);
          }
          continue;
        }
        if (SKIP.test(name)) continue;
        const sc = n.scale;
        if ((Array.isArray(sc) ? Math.max(...sc) : sc ?? 1) < 0.01) continue;   // hidden on this venue
        const boxes: Box[] = [];
        if (Array.isArray(n.instances)) {
          for (const t of n.instances) {
            const ts = t.scale ?? 1;
            if ((Array.isArray(ts) ? Math.max(...ts) : ts) < 0.01) continue;
            boxes.push(footprint(t.position, ts, t.rotation?.[1] ?? 0));
          }
        } else if (Array.isArray(n.position)) {
          const size = Array.isArray(n.size) ? n.size : [0.6, 0.6, 0.6];
          boxes.push(footprint(n.position, [size[0] * (Array.isArray(sc) ? sc[0] : sc ?? 1), 1, size[2] * (Array.isArray(sc) ? sc[2] : sc ?? 1)], n.rotation?.[1] ?? 0));
        }
        for (const fp of boxes) {
          if (fp.x1 < -1000 || n.position?.[1] < -10) continue;
          if (overlaps(fp, PITCH) || GOALS.some((g) => overlaps(fp, g))) bad.push(`${v}:${name} ${JSON.stringify(fp)}`);
        }
      }
      expect(bad).toEqual([]);
    }
  });
});

describe("(e) every collider is the size of what is drawn", () => {
  it("the goal frame mesh puts its posts and bar exactly on the sim axes", () => {
    const j = JSON.parse(JSON.stringify(buildFifaGoalFrameNode(1, "#d8ff3e")));
    const white = (j.children as any[])[0];
    expect(white.material.color).toBe("#f6f8fc");
    const pos = Object.values(white.geometry.positions) as number[];
    let minX = Infinity, maxZ = 0, maxY = 0;
    for (let i = 0; i < pos.length; i += 3) {
      minX = Math.min(minX, pos[i]! + j.position[0]);
      maxY = Math.max(maxY, pos[i + 1]!);
      maxZ = Math.max(maxZ, Math.abs(pos[i + 2]!));
    }
    expect(minX).toBeCloseTo(POST_X - POST_R, 2);   // post front face on the goal line
    expect(maxZ).toBeCloseTo(POST_Z + POST_R, 2);   // post outer face on the mouth edge
    expect(maxY).toBeCloseTo(BAR_Y + POST_R, 2);    // bar top at GOAL_H
    expect(BAR_Y + POST_R).toBeCloseTo(GOAL_H, 6);
  });

  it("the drawn ball radius is BALL_VIS_R (procedural and Idol ball) and the woodwork band is post + ball", () => {
    const j = JSON.parse(JSON.stringify(buildMatchBallNode("probe", [0, BALL_VIS_R, 0])));
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const walk = (n: any) => {
      const p = n.geometry?.positions ? (Object.values(n.geometry.positions) as number[]) : undefined;
      if (p) for (let i = 0; i < p.length; i++) { lo[i % 3] = Math.min(lo[i % 3]!, p[i]!); hi[i % 3] = Math.max(hi[i % 3]!, p[i]!); }
      for (const c of n.children ?? []) walk(c);
    };
    walk(j);
    const r = Math.max(...hi.map((h, k) => (h - lo[k]!) / 2));
    expect(r).toBeGreaterThan(BALL_VIS_R * 0.9);
    expect(r).toBeLessThan(BALL_VIS_R * 1.1);
    const idol = Math.max(...routeAssets.fcIdolBall.bounds) / 2;
    expect(Math.abs(idol - BALL_VIS_R)).toBeLessThan(0.015);
    expect(FRAME_HIT_R).toBeCloseTo(POST_R + BALL_VIS_R, 9);
    expect(FRAME_HIT_R).toBeGreaterThan(0.26);
    expect(FRAME_HIT_R).toBeLessThan(0.29);
  });

  it("the Favela cage colliders sit on the drawn inner faces and stop at the drawn wall top", () => {
    const j = JSON.parse(JSON.stringify(buildFcScene("favela")));
    const all: any[] = [];
    const walk = (n: any) => { all.push(n); for (const c of n.children ?? []) walk(c); };
    (j.nodes as any[]).forEach(walk);
    const by = (name: string) => all.find((n) => n.name === name);
    for (const tag of ["n", "s"]) {
      const w = by(`cage-${tag}`);
      expect(Math.abs(w.position[2]) - w.size[2] / 2).toBeCloseTo(CAGE_INNER_Z, 6);
    }
    for (const tag of ["w-n", "w-s", "e-n", "e-s"]) {
      const w = by(`cage-${tag}`);
      expect(Math.abs(w.position[0]) - w.size[0] / 2).toBeCloseTo(CAGE_INNER_X, 6);
      const rail = by(`cage-rail-${tag}`);
      expect(rail.position[1] + rail.size[1] / 2).toBeCloseTo(CAGE_TOP, 6);
    }
  });

  it("a low ball meets the side wall with its drawn surface on the inner face; a high ball clears it and goes out", () => {
    const sim = liveSim("favela");
    const s = sim.state, b = s.ball;
    b.x = 0; b.y = BALL_R; b.z = PITCH_HZ - 3; b.vx = 0; b.vy = 0; b.vz = 14; b.mode = "loose"; b.lastShot = "none"; b.freeT = 1; b.rolling = true;
    const ev: SimEvent[] = [];
    let maxZ = 0;
    for (let i = 0; i < 40 && s.phase === "live"; i++) { ev.push(...sim.step(DT, IDLE)); maxZ = Math.max(maxZ, Math.abs(b.z)); }
    expect(ev.some((e) => e.type === "wall")).toBe(true);
    expect(maxZ + BALL_VIS_R).toBeLessThanOrEqual(CAGE_INNER_Z + 1e-6);
    expect(s.phase).toBe("live");

    const sim2 = liveSim("favela");
    const s2 = sim2.state, b2 = s2.ball;
    b2.x = 0; b2.y = CAGE_TOP + 1.2; b2.z = PITCH_HZ - 1; b2.vx = 0; b2.vy = 3; b2.vz = 10; b2.mode = "flight"; b2.lastShot = "none"; b2.freeT = 1; b2.rolling = false;
    const ev2: SimEvent[] = [];
    for (let i = 0; i < 40 && s2.phase === "live"; i++) ev2.push(...sim2.step(DT, IDLE));
    expect(ev2.some((e) => e.type === "wall")).toBe(false);
    expect(s2.phase).toBe("restart");
  });
});
