import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTOPILOT_CATCH_READ,
  AUTOPILOT_TOGGLE_CODE,
  AUTOPLAY_RESULTS_SECONDS,
  AUTOPLAY_STALL_SECONDS,
  autopilotReleaseQuality,
  autoplayRequested,
  chooseAutopilotPlay,
  createAutoplayWatch,
  pickOpenReceiver,
  stepAutoplayWatch,
  type AutoplaySnapshot
} from "../../../apps/showcase-aura-hoops-3d/src/autoplay";
import { HOOPS_PLAYER_BOUNDS, courtObstacles, courtsideBallColliders, stanchionBallColliders } from "../../../apps/showcase-aura-hoops-3d/src/courtObstacles";
import { BALL_R } from "../../../apps/showcase-aura-hoops-3d/src/dribble";
import {
  MIN_SEPARATION, clearTarget, deadBallPossession, dunkRejectChance, isCleared, isDeadBall, passInterceptor, passLaunch, separate, type TeamId
} from "../../../apps/showcase-aura-hoops-3d/src/rules";
import { advanceShotBall, aimError, createHoopWorld, crossedRimDownward, solveLaunch } from "../../../apps/showcase-aura-hoops-3d/src/shotPhysics";

const ROOT = path.resolve(__dirname, "../../..");
const MAIN = readFileSync(path.join(ROOT, "apps/showcase-aura-hoops-3d/src/main.ts"), "utf8");
const HTML = readFileSync(path.join(ROOT, "apps/showcase-aura-hoops-3d/index.html"), "utf8");

describe("Aura Hoops autoplay wiring", () => {
  it("?autoplay=1, ?autopilot=1 and ?demo=1 all turn it on; nothing else does", () => {
    const q = (s: string) => new URLSearchParams(s);
    expect(autoplayRequested(q("autoplay=1"))).toBe(true);
    expect(autoplayRequested(q("autopilot=1"))).toBe(true);
    expect(autoplayRequested(q("demo=1"))).toBe(true);
    expect(autoplayRequested(q(""))).toBe(false);
    expect(autoplayRequested(q("autoplay=0&court=venice"))).toBe(false);
  });

  it("main.ts reads the flag, skips the menu, never pauses on it, loops on the watch and binds P", () => {
    expect(MAIN).toMatch(/autopilot: autoplayRequested\(initialParams\)/);
    expect(MAIN).toMatch(/const menuParam = !game_\.autopilot && /);
    expect(MAIN).toMatch(/document\.hidden && !game_\.autopilot && /);
    expect(MAIN).toMatch(/if \(game_\.autopilot\) \{\s*\n\s*const act = stepAutoplayWatch\(autoplayWatch/);
    expect(MAIN).toMatch(/if \(game_\.phase === "gameover"\) rematch\(\);/);
    expect(MAIN).toMatch(/autopilot: \[AUTOPILOT_TOGGLE_CODE\]/);
    expect(MAIN).toMatch(/recv\.team === "home" && game_\.autopilot\) recv\.aiT = Math\.min\(recv\.aiT, AUTOPILOT_CATCH_READ\)/);
    expect(MAIN).toMatch(/pressed\("autopilot", AUTOPILOT_TOGGLE_CODE\)\) setAutopilot\(!game_\.autopilot\)/);
    expect(AUTOPILOT_TOGGLE_CODE).toBe("KeyP");
    expect(HTML).toMatch(/AUTOPLAY: <b>P<\/b>/);
    expect(MAIN).toMatch(/AUTOPLAY: <b>P<\/b>/);
  });

  it("the autopilot only kicks it out through an open lane, and releases mostly in the green", () => {
    expect(chooseAutopilotPlay({ roll: 0.1, dRim: 5, lab: false, canPass: true })).toBe("pass");
    expect(chooseAutopilotPlay({ roll: 0.1, dRim: 5, lab: false, canPass: false })).toBe("shoot");
    expect(chooseAutopilotPlay({ roll: 0.1, dRim: 8, lab: false, canPass: false })).toBe("drive");
    expect(chooseAutopilotPlay({ roll: 0.7, dRim: 8, lab: false, canPass: false })).toBe("stand");
    expect(chooseAutopilotPlay({ roll: 0.7, dRim: 8, lab: false, canPass: false, lastPlay: "stand" })).toBe("drive");
    expect(chooseAutopilotPlay({ roll: 0.9, dRim: 5, lab: false, canPass: true })).toBe("drive");
    expect(chooseAutopilotPlay({ roll: 0.1, dRim: 5, lab: true, canPass: true })).toBe("drive");
    const mates = [{ x: 0, z: 2 }, { x: -4.8, z: 7.2 }];
    expect(pickOpenReceiver({ x: 0, z: 8.6 }, mates, [{ x: 0.1, z: 5 }], 0)).toBe(mates[1]);
    expect(pickOpenReceiver({ x: 0, z: 8.6 }, [mates[0]!], [{ x: 0.1, z: 5 }], 0)).toBeUndefined();
    expect(autopilotReleaseQuality(0)).toBeGreaterThan(0.5);
    expect(autopilotReleaseQuality(0.999)).toBeLessThan(0.99);
  });

  it("the take-back target is past the arc from every spot on the floor (a low-wing CPU board used to stand still)", () => {
    for (let x = -9; x <= 9; x += 0.5) for (let z = -2; z <= 13; z += 0.5) {
      const [cx, cz] = clearTarget(x, z, RIM, ARC_R);
      expect(isCleared(cx, cz, RIM, ARC_R), `${x},${z}`).toBe(true);
      expect(Math.abs(cx)).toBeLessThanOrEqual(HOOPS_PLAYER_BOUNDS.x1);
    }
  });

  it("the watch shows results for ~3 s then restarts, and re-checks a stalled play before 5 s", () => {
    const w = createAutoplayWatch();
    const snap = (o: Partial<AutoplaySnapshot>): AutoplaySnapshot => ({ phase: "live", scoreHome: 0, scoreAway: 0, ballState: "held", holder: 0, ballX: 0, ballZ: 8, ...o });
    let t = 0, act = null as ReturnType<typeof stepAutoplayWatch>;
    while (act === null && t < 10) { act = stepAutoplayWatch(w, snap({ phase: "gameover" }), 1 / 60); t += 1 / 60; }
    expect(act).toBe("restart");
    expect(t).toBeGreaterThanOrEqual(AUTOPLAY_RESULTS_SECONDS - 1e-6);
    expect(t).toBeLessThan(AUTOPLAY_RESULTS_SECONDS + 0.05);
    t = 0; act = null;
    while (act === null && t < 10) { act = stepAutoplayWatch(w, snap({}), 1 / 60); t += 1 / 60; }
    expect(act).toBe("unstick");
    expect(t).toBeLessThan(5);
    expect(t).toBeGreaterThanOrEqual(AUTOPLAY_STALL_SECONDS - 0.05);
    // a sitting menu phase restarts at once
    expect(stepAutoplayWatch(w, snap({ phase: "menu" }), 1 / 60)).toBe("restart");
  });
});

/* ------------------------------------------------------------------ *
 *  Headless 3v3 half court on the game's pure modules                 *
 * ------------------------------------------------------------------ *
 * main.ts's frame loop is bound to the engine scene, so this drives the same decisions (autoplay.ts), the same ball
 * (shotPhysics.ts with the stanchion / furniture colliders), the same rules (rules.ts: pass lanes, dead balls, take-back,
 * dunk contests, separation with furniture) and the same loop watch, with simple movement in place of the rigs.
 */
const RIM: [number, number, number] = [0, 3.05, 0];
const HOOP = { rim: RIM, boardFaceZ: -0.35 + 0.06, boardHalfW: 0.9, boardY0: 2.82, boardY1: 3.9 };
const GRAVITY = -10.4, ARC_R = 6.75, DUNK_RANGE = 2.4, SPEED = 4.6, DT = 1 / 60, TARGET = 11;
const SPOTS: readonly [number, number][] = [[0, 8.6], [-4.8, 7.2], [4.8, 7.2]];

interface P { team: TeamId; i: number; x: number; z: number; vx: number; vz: number; tx: number; tz: number; aiT: number; plan: string; shootT: number; pokeCd: number }
interface Report { points: { home: number; away: number }; makes: number; dunks: number; passes: number; picks: number; games: number; restartsAfter: number[]; maxStuck: number; unsticks: number; finals: string[]; stalls: string[] }

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function runAutoplay(seconds: number, seed: number): Report {
  const rng = lcg(seed);
  const world = createHoopWorld(HOOP, undefined, [...stanchionBallColliders(), ...courtsideBallColliders()]);
  const obstacles = courtObstacles("rucker");
  const ps: P[] = [];
  for (const team of ["home", "away"] as const) for (let i = 0; i < 3; i++) ps.push({ team, i, x: 0, z: 0, vx: 0, vz: 0, tx: 0, tz: 0, aiT: 0, plan: "", shootT: -1, pokeCd: 0 });
  const g = { phase: "check", possession: "home" as TeamId, scoreHome: 0, scoreAway: 0, checkT: 0, scoreT: 0, serving: "home" as TeamId, mustClear: false };
  const ball = { state: "parked", x: 0, y: 1, z: 8.6, vx: 0, vy: 0, vz: 0, holder: 0, passTarget: -1, lastTouch: "home" as TeamId, flightT: 0, looseT: 0, scored: false, value: 1, shooter: -1 };
  const rep: Report = { points: { home: 0, away: 0 }, makes: 0, dunks: 0, passes: 0, picks: 0, games: 0, restartsAfter: [], maxStuck: 0, unsticks: 0, finals: [], stalls: [] };
  const watch = createAutoplayWatch();
  const team = (t: TeamId) => ps.filter((p) => p.team === t);
  const other = (t: TeamId): TeamId => (t === "home" ? "away" : "home");
  const d2 = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

  function enterCheck(t: TeamId): void {
    g.phase = "check"; g.possession = t; g.checkT = 0; g.mustClear = false;
    team(t).forEach((p, i) => Object.assign(p, { x: SPOTS[i]![0], z: SPOTS[i]![1], vx: 0, vz: 0, tx: SPOTS[i]![0], tz: SPOTS[i]![1], shootT: -1, aiT: 0, plan: "" }));
    team(other(t)).forEach((p, i) => Object.assign(p, { x: SPOTS[i]![0] * 0.55, z: SPOTS[i]![1] - 2.6, vx: 0, vz: 0, shootT: -1 }));
    Object.assign(ball, { state: "parked", holder: ps.indexOf(team(t)[0]!), lastTouch: t, scored: false, flightT: 0, looseT: 0 });
  }
  function award(t: TeamId, pts: number): void {
    if (t === "home") g.scoreHome += pts; else g.scoreAway += pts;
    rep.points[t] += pts;
    if ((t === "home" ? g.scoreHome : g.scoreAway) >= TARGET) { g.phase = "gameover"; rep.finals.push(`${g.scoreHome}-${g.scoreAway}`); }
    else { g.phase = "score"; g.scoreT = 1.15; g.serving = t; }
  }
  function grab(p: P): void {
    ball.state = "held"; ball.holder = ps.indexOf(p); ball.lastTouch = p.team; ball.looseT = 0;
    if (p.team !== g.possession) { g.possession = p.team; g.mustClear = true; }
    p.shootT = -1; p.aiT = 0;
  }
  function loose(vx: number, vz: number, by: TeamId): void {
    Object.assign(ball, { state: "loose", vx, vy: 2, vz, looseT: 0, flightT: 0, lastTouch: by, holder: -1 });
  }
  function move(p: P, tx: number, tz: number, speed: number): void {
    const d = d2(p.x, p.z, tx, tz);
    if (d < 0.45) { p.vx *= 0.8; p.vz *= 0.8; return; }
    p.vx += ((tx - p.x) / d * speed - p.vx) * Math.min(1, DT * 8);
    p.vz += ((tz - p.z) / d * speed - p.vz) * Math.min(1, DT * 8);
  }

  enterCheck("home");
  let stuckT = 0, lastKey = "", markX = 0, markZ = 0, gameoverAt = -1;
  const steps = Math.round(seconds / DT);
  for (let step = 0; step < steps; step++) {
    const now = step * DT;
    if (g.phase === "check") {
      g.checkT += DT;
      if (g.checkT > 0.85) { g.phase = "live"; ball.state = "held"; }
    } else if (g.phase === "score") {
      g.scoreT -= DT;
      if (g.scoreT <= 0) enterCheck(g.serving);
    } else if (g.phase === "live" || g.phase === "shot") {
      const holder = ball.state === "held" ? ps[ball.holder] : undefined;
      const offense = team(g.possession), defense = team(other(g.possession));
      for (const p of ps) {
        if (p.pokeCd > 0) p.pokeCd -= DT;
        if (p === holder) {
          const dRim = d2(p.x, p.z, RIM[0], RIM[2]);
          if (p.shootT >= 0) {
            p.vx *= 0.8; p.vz *= 0.8;
            p.shootT += DT;
            if (p.shootT >= 0.72 * 0.705) {
              const q = autopilotReleaseQuality(rng());
              const def = defense.reduce((a, b) => (d2(a.x, a.z, p.x, p.z) < d2(b.x, b.z, p.x, p.z) ? a : b));
              const dd = d2(def.x, def.z, p.x, p.z);
              const err = aimError(q, dRim, dd < 1.6 ? -0.28 : dd < 2.6 ? -0.1 : 0, 0.06, rng);
              const v = solveLaunch([p.x, 2, p.z], [RIM[0] + err.dx, RIM[1], RIM[2] + err.dz], GRAVITY);
              Object.assign(ball, { state: "flight", x: p.x, y: 2, z: p.z, vx: v[0], vy: v[1], vz: v[2], holder: -1, flightT: 0, scored: false, value: dRim > ARC_R ? 2 : 1, shooter: ps.indexOf(p), lastTouch: p.team });
              p.shootT = -1; g.phase = "shot";
            }
            continue;
          }
          if (g.mustClear) {
            const [cx, cz] = clearTarget(p.x, p.z, RIM, ARC_R);
            move(p, cx, cz, SPEED * 0.92);
            if (isCleared(p.x, p.z, RIM, ARC_R)) g.mustClear = false;
            continue;
          }
          if (dRim < DUNK_RANGE) {
            const def = defense.reduce((a, b) => (d2(a.x, a.z, p.x, p.z) < d2(b.x, b.z, p.x, p.z) ? a : b));
            const pr = dunkRejectChance({ defenderDistance: d2(def.x, def.z, p.x, p.z), defenderAirborne: false, defenderStumbling: false, dunk: 7, defense: 7, contestScale: 1 });
            if (rng() < pr) { loose(0, 2.4, def.team); Object.assign(ball, { x: p.x, y: 2.4, z: p.z }); }
            else { rep.dunks++; ball.state = "parked"; award(p.team, 1); }
            break;
          }
          p.aiT -= DT;
          if (p.aiT <= 0) {
            p.aiT = 1.3 + rng() * 1.6;
            const roll = rng();
            const mates = offense.filter((m) => m !== p);
            const play = chooseAutopilotPlay({ roll, dRim, lab: false, lastPlay: p.plan, canPass: mates.some((m) => pickOpenReceiver(p, [m], defense, 0) !== undefined) });
            if (play === "pass") {
              const recv = pickOpenReceiver(p, mates, defense, rng());
              if (recv) {
                const v = passLaunch([p.x, 1.5, p.z], [recv.x, 1.6, recv.z]);
                Object.assign(ball, { state: "pass", x: p.x, y: 1.5, z: p.z, vx: v[0], vy: v[1], vz: v[2], holder: -1, passTarget: ps.indexOf(recv), flightT: 0, lastTouch: p.team });
                continue;
              }
            }
            if (play === "shoot") { p.shootT = 0; continue; }
            if (play === "stand") { p.plan = "stand"; p.tx = p.x; p.tz = p.z; p.aiT = 2.2 + rng(); }
            else { p.plan = "drive"; p.tx = RIM[0] + (rng() - 0.5) * 2; p.tz = RIM[2] + 1 + rng() * 1.1; }
          }
          move(p, p.tx, p.tz, p.plan === "stand" ? 0.4 : SPEED * 0.88);
        } else if (ball.state === "loose") {
          if (d2(p.x, p.z, ball.x, ball.z) < 7) move(p, ball.x, ball.z, SPEED * 0.9);
        } else if (p.team === g.possession) {
          move(p, SPOTS[p.i]![0], SPOTS[p.i]![1], SPEED * 0.82);
        } else {
          const mark = offense[p.i]!;
          if (mark === holder) {
            const ux = RIM[0] - mark.x, uz = RIM[2] - mark.z, l = Math.hypot(ux, uz) || 1;
            move(p, mark.x + (ux / l) * 1.15, mark.z + (uz / l) * 1.15, SPEED * 0.86);
            if (holder && holder.shootT < 0 && p.pokeCd <= 0 && d2(p.x, p.z, holder.x, holder.z) < 1.3 && rng() < DT * 1.6) {
              p.pokeCd = 1.8;
              if (rng() < 0.34) { Object.assign(ball, { x: holder.x, y: 1, z: holder.z }); loose((p.x - holder.x) * 1.4, (p.z - holder.z) * 1.4, p.team); }
            }
          } else move(p, mark.x * 0.88, mark.z * 0.88 - 0.65, SPEED * 0.82);
        }
      }
      for (const p of ps) { p.x += p.vx * DT; p.z += p.vz * DT; }
      separate(ps, MIN_SEPARATION, obstacles, HOOPS_PLAYER_BOUNDS);
      for (const p of ps) {
        p.x = Math.max(HOOPS_PLAYER_BOUNDS.x0, Math.min(HOOPS_PLAYER_BOUNDS.x1, p.x));
        p.z = Math.max(HOOPS_PLAYER_BOUNDS.z0, Math.min(HOOPS_PLAYER_BOUNDS.z1, p.z));
      }
      // ball
      if (ball.state === "held") { const h = ps[ball.holder]!; ball.x = h.x; ball.z = h.z; ball.y = 1; }
      else if (ball.state === "flight" || ball.state === "pass" || ball.state === "loose") {
        const prev: [number, number, number] = [ball.x, ball.y, ball.z];
        ball.flightT += DT;
        advanceShotBall(world, ball, BALL_R, DT, GRAVITY);
        if (ball.state === "pass") {
          const r = ps[ball.passTarget]!;
          if (d2(ball.x, ball.z, r.x, r.z) < 0.9 && ball.y < 2.2) { ball.state = "held"; ball.holder = ball.passTarget; r.aiT = Math.min(r.aiT, AUTOPILOT_CATCH_READ); rep.passes++; }
          else {
            const lane = ps.filter((m) => m.team !== ball.lastTouch);
            const hit = passInterceptor(ball, lane);
            if (hit >= 0) { rep.picks++; loose((ball.x - lane[hit]!.x) * 1.4, (ball.z - lane[hit]!.z) * 1.4, lane[hit]!.team); }
          }
        }
        if (!ball.scored && ball.state === "flight" && crossedRimDownward(prev, [ball.x, ball.y, ball.z], RIM)) {
          ball.scored = true; rep.makes++;
          award(ps[ball.shooter]!.team, ball.value);
        }
        if (ball.y < BALL_R) {
          ball.y = BALL_R;
          if (Math.abs(ball.vy) > 0.8) { ball.vy = Math.abs(ball.vy) * 0.58; ball.vx *= 0.78; ball.vz *= 0.78; } else { ball.vy = 0; ball.vx *= 0.9; ball.vz *= 0.9; }
          if (ball.state !== "loose") { ball.state = "loose"; ball.looseT = 0; if (!ball.scored) g.phase = "live"; }
        }
        if (ball.state === "loose" && (g.phase === "live")) {
          ball.looseT += DT;
          const near = ps.filter((p) => d2(p.x, p.z, ball.x, ball.z) < 1.3 && ball.y < 2.3).sort((a, b) => d2(a.x, a.z, ball.x, ball.z) - d2(b.x, b.z, ball.x, ball.z))[0];
          if (near) grab(near);
        }
        if (!ball.scored && (g.phase === "live" || g.phase === "shot") && isDeadBall({ state: ball.state as "loose", flightT: ball.flightT, looseT: ball.looseT, x: ball.x, z: ball.z })) enterCheck(deadBallPossession(ball.lastTouch));
      }
    }

    // independent stuck meter: nothing changed and the ball has not travelled 0.6 m
    const key = `${g.phase}|${g.scoreHome}|${g.scoreAway}|${ball.state}|${ball.holder}`;
    if (g.phase === "gameover" || key !== lastKey || d2(ball.x, ball.z, markX, markZ) >= 0.6) { lastKey = key; markX = ball.x; markZ = ball.z; stuckT = 0; }
    else { stuckT += DT; rep.maxStuck = Math.max(rep.maxStuck, stuckT); }
    if (g.phase === "gameover" && gameoverAt < 0) gameoverAt = now;

    const act = stepAutoplayWatch(watch, { phase: g.phase, scoreHome: g.scoreHome, scoreAway: g.scoreAway, ballState: ball.state, holder: ball.holder, ballX: ball.x, ballZ: ball.z }, DT);
    if (act === "restart") {
      rep.games++;
      rep.restartsAfter.push(now - gameoverAt);
      gameoverAt = -1;
      g.scoreHome = 0; g.scoreAway = 0;
      enterCheck("home");
    } else if (act === "unstick") {
      rep.unsticks++;
      const h = ps[ball.holder];
      rep.stalls.push(`${g.phase} ${ball.state} holder=${ball.holder} ${h ? `${h.team} plan=${h.plan} shootT=${h.shootT.toFixed(2)} at ${h.x.toFixed(1)},${h.z.toFixed(1)} t ${h.tx.toFixed(1)},${h.tz.toFixed(1)} clear=${g.mustClear}` : ""} ball ${ball.x.toFixed(1)},${ball.y.toFixed(1)},${ball.z.toFixed(1)}`);
      enterCheck(deadBallPossession(ball.lastTouch));
    }
  }
  return rep;
}

describe("Aura Hoops autoplay plays and loops (headless)", () => {
  const SECONDS = 600;
  const rep = runAutoplay(SECONDS, 0xa3d5);

  it("both sides score, the computer side included, with jumpers, dunks and completed passes", () => {
    expect(rep.points.home).toBeGreaterThan(0);
    expect(rep.points.away).toBeGreaterThan(0);
    expect(rep.makes).toBeGreaterThan(5);
    expect(rep.dunks).toBeGreaterThan(0);
    expect(rep.passes).toBeGreaterThan(5);
  });

  it("finished games show results ~3 s and restart by themselves, again and again", () => {
    expect(rep.games).toBeGreaterThanOrEqual(2);
    for (const t of rep.restartsAfter) {
      expect(t).toBeGreaterThanOrEqual(AUTOPLAY_RESULTS_SECONDS - 0.05);
      expect(t).toBeLessThan(AUTOPLAY_RESULTS_SECONDS + 0.1);
    }
    for (const f of rep.finals) expect(Math.max(...f.split("-").map(Number))).toBeGreaterThanOrEqual(TARGET);
  });

  it("play is never stuck for 5 s, and the stall guard is a rare safety net, not the engine of play", () => {
    expect(rep.maxStuck).toBeLessThan(5);
    expect(rep.unsticks, rep.stalls.slice(0, 8).join("\n")).toBeLessThanOrEqual(1);
  });

  it("is deterministic for a seed", () => {
    expect(runAutoplay(60, 7)).toEqual(runAutoplay(60, 7));
  });
});
