import { describe, expect, it } from "vitest";
import { pose, type PoseActor, type PoseMatchState } from "../../../examples/aura-slam/view/pose";
import { ATHLETE_VARIANTS, athleteHumanoid, athleteNodeScale, pickAthleteVariant, solveAthletePose } from "../../../examples/aura-slam/view/idolAthleteRig";
import { idolModels } from "../../../examples/aura-slam/view/assets";
import { IDOL_BINDS } from "../../../examples/aura-slam/view/idolBind.generated";
import { createIdolHumanoid } from "../../../examples/aura-slam/view/idolHumanoid";
import { umpireScale, umpireSeatedTargets, UMPIRE_SEAT_TOP } from "../../../examples/aura-slam/view/idolUmpire";
import { resolveAppearance } from "../../../examples/aura-slam/view/appearance";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const STROKES = ["forehand", "backhand", "forehand-volley", "backhand-volley", "smash", "serve"] as const;
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const num = (r: () => number, lo: number, hi: number): number => lo + (hi - lo) * r();

function randomCase(r: () => number): { actor: PoseActor; state: PoseMatchState } {
  const swing = r() < 0.45 ? num(r, 0, 0.42) : 0;
  const actor = {
    side: pick(r, ["player", "ai"] as const), moveBlend: pick(r, [0, 0.1, 0.4, 1, num(r, 0, 1)]), stride: num(r, -20, 40),
    vx: pick(r, [0, num(r, -1.3, 1.3)]), vy: pick(r, [0, num(r, -1.3, 1.3)]), splitStep: r() < 0.3 ? num(r, 0, 0.3) : 0,
    strokeContactAge: r() < 0.6 ? num(r, 0.05, 0.3) : 0, swingAge: num(r, 0, 0.5), strokeConnected: r() < 0.5, swing,
    stroke: pick(r, STROKES), slideRemaining: pick(r, [undefined, 0, num(r, 0, 0.34)]), slidePoseStatic: r() < 0.3,
    serveMotion: r() < 0.3 ? num(r, 0, 0.45) : 0, serveContactPoint: pick(r, [null, [num(r, -0.5, 0.6), num(r, 1.2, 2.6), num(r, -0.8, 0.4)] as const])
  } as unknown as PoseActor;
  const time = num(r, 0, 60);
  const state = { phase: pick(r, ["serve", "serveToss", "rally", "point"] as const), time, server: "player", serveAttempt: null } as unknown as PoseMatchState;
  return { actor, state };
}

const variants = [...ATHLETE_VARIANTS.player, ...ATHLETE_VARIANTS.rival];

describe("Idol athletes driven from the procedural pose (examples/aura-slam/view/idolAthleteRig.ts)", () => {
  it("every variant has an admitted GLB and a bind table the humanoid mapper understands", () => {
    for (const v of variants) {
      expect(idolModels[v.key], v.key).toBeDefined();
      expect(IDOL_BINDS[v.key], v.key).toBeDefined();
      const h = athleteHumanoid(v.key);
      // a believable adult: legs ~45-50% and arms (shoulder to palm) ~30-36% of the standing height
      const height = idolModels[v.key].bounds[1];
      expect(h.legLength / height).toBeGreaterThan(0.4);
      expect(h.legLength / height).toBeLessThan(0.55);
      expect(h.armLength / height).toBeGreaterThan(0.27);
      expect(h.armLength / height).toBeLessThan(0.4);
    }
  });

  it("the match kits pick their GLB: alcatraz -> sky/navy, zinner -> clay/ivory, the sim's default rival -> clay/navy", () => {
    expect(pickAthleteVariant(ATHLETE_VARIANTS.player, resolveAppearance({ skin: "medium", shirt: "sky", pants: "navy", shoes: "ivory" })).key).toBe("slamAthleteMatchPlayer");
    expect(pickAthleteVariant(ATHLETE_VARIANTS.rival, resolveAppearance({ skin: "light", shirt: "clay", pants: "ivory", shoes: "ivory" })).key).toBe("slamAthleteMatchRival");
    expect(pickAthleteVariant(ATHLETE_VARIANTS.rival, resolveAppearance(null, "ai")).key).toBe("slamAthleteRival");
  });

  it("over 3,000 random poses the GLB palm reaches the pose's racket hand (the racket is seated on the palm)", () => {
    const r = rng(20261118);
    for (const v of variants) {
      const h = athleteHumanoid(v.key);
      const k = athleteNodeScale(v.key);
      let palmMiss = 0;
      const dists: number[] = [];
      const n = 1000;
      for (let i = 0; i < n; i++) {
        const { actor, state } = randomCase(r);
        const p = pose(actor, state);
        const s = solveAthletePose(h, k, p);
        for (const b of Object.values(s.bones)) {
          expect(Number.isFinite(b.rotation.x + b.rotation.y + b.rotation.z + b.rotation.w)).toBe(true);
          expect(Math.hypot(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w)).toBeCloseTo(1, 5);
        }
        // the racket is seated on the GLB palm (solved.palmR), so it can never leave the hand; this measures how far the palm
        // had to move from the pose hand (only when the hand is out of the GLB arm's reach)
        const d = Math.hypot(s.palmR[0] - p.right[0], s.palmR[1] - p.right[1], s.palmR[2] - p.right[2]);
        if (d > 0.04) palmMiss++;
        dists.push(d);
      }
      // The GLB shoulders sit ~9 cm above the pose's (the Idol torso is longer), so low wide hands and the fuzz's serve contact
      // points (up to 2.6 pose units) can be out of the GLB arm's reach: the arm straightens toward the target and the racket
      // follows the palm, a few centimetres from where the procedural cylinder arm (which stretches) put it.
      dists.sort((a, b) => a - b);
      expect(palmMiss / n, `${v.key} palm`).toBeLessThan(0.25);
      expect(dists[Math.floor(n * 0.95)]!, `${v.key} p95 palm offset (pose units)`).toBeLessThan(0.15);
    }
  });

  it("the umpire sits on the Idol chair seat with feet below the knees and turns his head without moving the body", () => {
    const bind = IDOL_BINDS.slamUmpireOfficial!;
    const h = createIdolHumanoid(bind);
    const k = umpireScale();
    const a = h.solve(umpireSeatedTargets(h, k, 0));
    const b = h.solve(umpireSeatedTargets(h, k, 0.6));
    const m = h.map;
    const hipY = (a.positions.get(m.upperLegL)![1] + a.positions.get(m.upperLegR)![1]) / 2;
    expect(hipY * k).toBeCloseTo(UMPIRE_SEAT_TOP + 0.09, 2);
    // thighs roughly horizontal and forward, shins down
    const knee = a.positions.get(m.lowerLegL)!;
    expect(Math.abs(knee[1] - a.positions.get(m.upperLegL)![1]) * k).toBeLessThan(0.12);
    expect(knee[2]).toBeGreaterThan(a.positions.get(m.upperLegL)![2] + 0.2);
    expect(a.positions.get(m.footL)![1]).toBeLessThan(knee[1] - 0.25);
    expect(a.bones[m.hips]).toEqual(b.bones[m.hips]);
    expect(a.bones[m.head]).not.toEqual(b.bones[m.head]);
  });
});
