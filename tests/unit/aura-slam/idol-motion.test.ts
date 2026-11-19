import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pose } from "../../../examples/aura-slam/view/pose";
import { athleteHumanoid, athleteNodeScale, solveAthletePose } from "../../../examples/aura-slam/view/idolAthleteRig";
import { STROKE_CLIPS, athleteDriver, athleteMotionFrame, clipContactTime, createAthleteMotionState, warpStrokeTime, type MotionActor } from "../../../examples/aura-slam/view/idolMotion";
import { MOTION_CLIPS } from "../../../examples/aura-slam/view/motion.generated";

const key = "slamAthleteMatchPlayer";
const rally = { phase: "rally", time: 3, server: "player", serveAttempt: null } as never;
const actor = (o: Record<string, unknown> = {}) => ({
  side: "player", x: 0, y: 0.86, moveBlend: 0, stride: 0, vx: 0, vy: 0, splitStep: 0, swingAge: 0, strokeContactAge: 0.17, strokeConnected: false,
  swing: 0, stroke: "forehand", serveMotion: 0, stats: { pointsWon: 0 }, ...o
}) as never as MotionActor;

function frame(st: ReturnType<typeof createAthleteMotionState>, a: MotionActor, state = rally, dt = 1 / 60) {
  const h = athleteHumanoid(key);
  const k = athleteNodeScale(key);
  const p = pose(a as never, state);
  const s = solveAthletePose(h, k, p);
  const driver = athleteDriver(key)!;
  const f = athleteMotionFrame(st, driver, { actor: a, pose: p, dt, gripModel: s.palmRModel, k, serve: state as never });
  return { f, s, driver, bones: driver.pose(f.input).bones, palm: driver.palmPoints(f.input).right };
}

describe("Aura Slam Idol athletes on text-to-motion clips", () => {
  it("ships the 14 fal clips the game plays and the shared driver maps every athlete GLB", () => {
    for (const c of ["Ready", "Idle", "SplitStep", "Run", "ShuffleRight", "ShuffleLeft", "BackPedal", "Forehand", "Backhand", "Serve", "Volley", "BackhandVolley", "Overhead", "Celebrate"]) {
      expect(MOTION_CLIPS[c as keyof typeof MOTION_CLIPS], c).toBeDefined();
    }
    for (const k of ["slamAthleteMatchPlayer", "slamAthleteMatchRival", "slamAthleteRival"]) expect(athleteDriver(k), k).not.toBeNull();
  });

  it("plays the right clip per state", () => {
    const clipOf = (a: MotionActor, st = createAthleteMotionState(), state = rally) => frame(st, a, state).f.clip;
    expect(clipOf(actor())).toBe("Ready");
    const still = createAthleteMotionState();
    for (let i = 0; i < 200; i++) frame(still, actor());
    expect(still.clip).toBe("Idle");
    expect(clipOf(actor({ splitStep: 0.15 }))).toBe("SplitStep");
    expect(clipOf(actor({ moveBlend: 1, vy: -0.8 }))).toBe("Run"); // the near player runs at the net
    expect(clipOf(actor({ moveBlend: 1, vy: 0.8 }))).toBe("BackPedal");
    expect(clipOf(actor({ moveBlend: 1, vx: 0.8 }))).toBe("ShuffleRight");
    expect(clipOf(actor({ moveBlend: 1, vx: -0.8 }))).toBe("ShuffleLeft");
    for (const [stroke, clip] of [["forehand", "Forehand"], ["backhand", "Backhand"], ["forehand-volley", "Volley"], ["backhand-volley", "BackhandVolley"], ["smash", "Overhead"]] as const) {
      expect(clipOf(actor({ swing: 0.2, swingAge: 0.05, stroke })), stroke).toBe(clip);
    }
    expect(clipOf(actor({ serveMotion: 0.3 }))).toBe("Serve");
    const won = createAthleteMotionState();
    frame(won, actor({ stats: { pointsWon: 1 } }));
    expect(frame(won, actor({ stats: { pointsWon: 2 } })).f.clip).toBe("Celebrate");
  });

  it("bones change over time (stance loop and distance-locked run)", () => {
    const st = createAthleteMotionState();
    const d = athleteDriver(key)!;
    const leg = (b: Record<string, { rotation: { x: number; y: number; z: number; w: number } }>) => b[d.map.roles.leftUpperLeg!]!.rotation;
    const a0 = leg(frame(st, actor()).bones);
    for (let i = 0; i < 40; i++) frame(st, actor());
    const a1 = leg(frame(st, actor()).bones);
    expect(Math.abs(a0.x - a1.x) + Math.abs(a0.y - a1.y) + Math.abs(a0.z - a1.z)).toBeGreaterThan(1e-3);
    const run = createAthleteMotionState();
    const r0 = leg(frame(run, actor({ moveBlend: 1, vy: -0.8, y: 0.8 })).bones);
    let r1 = r0;
    for (let i = 1; i <= 12; i++) r1 = leg(frame(run, actor({ moveBlend: 1, vy: -0.8, y: 0.8 - i * 0.012 })).bones);
    expect(Math.abs(r0.x - r1.x) + Math.abs(r0.y - r1.y) + Math.abs(r0.z - r1.z)).toBeGreaterThan(0.05);
  });

  it("each stroke clip's contact frame lands exactly on the sim's contact time, with the racket palm on the solve's grip", () => {
    const d = athleteDriver(key)!;
    for (const clip of ["Forehand", "Backhand", "Volley", "BackhandVolley", "Overhead"] as const) {
      const c = clipContactTime(d, clip);
      expect(c, clip).toBeGreaterThan(0);
      expect(c, clip).toBeLessThan(MOTION_CLIPS[clip].duration);
      // the warp: sim contact age -> clip contact frame, monotonic either side
      expect(warpStrokeTime(c, MOTION_CLIPS[clip].duration, 0.17, 0.17, 0.33)).toBeCloseTo(c, 9);
      expect(warpStrokeTime(c, MOTION_CLIPS[clip].duration, 0.1, 0.17, 0.33)).toBeLessThan(c);
      expect(warpStrokeTime(c, MOTION_CLIPS[clip].duration, 0.25, 0.17, 0.33)).toBeGreaterThan(c);
    }
    // through the frame driver: a forehand at the sim's contact instant plays the clip's contact frame and pins the palm
    const st = createAthleteMotionState();
    for (let i = 0; i < 12; i++) frame(st, actor({ swing: 0.33 - i / 60, swingAge: i / 60 }));
    const hit = frame(st, actor({ swing: 0.16, swingAge: 0.17 }));
    expect(hit.f.clip).toBe("Forehand");
    expect(hit.f.clipTime).toBeCloseTo(clipContactTime(d, "Forehand"), 9);
    expect(hit.f.stroke).toBe(true);
    const miss = Math.hypot(...hit.palm.map((v, i) => v - hit.s.palmRModel[i]!));
    expect(miss).toBeLessThan(0.03);
    // the serve: windup reaches the contact frame exactly at the serve's contactAt
    const serveState = { phase: "serveToss", time: 5.4, server: "player", serveAttempt: { server: "player", swingAt: 5, contactAt: 5.4 } } as never;
    const sv = frame(createAthleteMotionState(), actor(), serveState);
    expect(sv.f.clip).toBe("Serve");
    expect(sv.f.clipTime).toBeCloseTo(clipContactTime(d, "Serve"), 9);
    expect(Object.values(STROKE_CLIPS)).toContain("Serve");
  });

  it("no Meshy-sourced motion remains in the Aura Slam code", () => {
    const files: string[] = [];
    const walk = (dir: string) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|mjs|js|json)$/.test(n)) files.push(p); } };
    walk("examples/aura-slam");
    walk("apps/showcase-top-tennis/src");
    for (const f of files) expect(/\bmeshy\b/i.test(readFileSync(f, "utf8")), f).toBe(false);
  });
});
