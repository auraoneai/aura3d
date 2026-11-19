import { describe, expect, it } from "vitest";
import { IDOL_FIGHTER_KEYS, MAX_STRIKE_LUNGE, WEAPON_REACH, idolFighterPose, simHitFraction, strikeLunge, strikeReach } from "../../../apps/showcase-iron-crown/src/game/idolFighters";
import { IC_IDOL_RIGS } from "../../../apps/showcase-iron-crown/src/game/idol-rigs";
import type { FighterId } from "../../../apps/showcase-iron-crown/src/game/fighters";

/**
 * Real-GPU QA: punches stopped short of the opponent and the swoosh did the work. At the sim's hit frame the striking
 * fist / foot / weapon tip must reach the opponent's body surface (`reachTo`) whenever that is within the strike's range
 * plus the allowed lunge; the lunge is zero outside attacks and back to zero at the end of the move.
 */
const HOLD = { light: 0.38, heavy: 0.56, special: 0.78, throw: 0.58 } as const;

describe("Iron Crown strikes reach the opponent on the hit frame", () => {
  for (const [fighter, sides] of Object.entries(IDOL_FIGHTER_KEYS) as [FighterId, Record<string, string>][]) {
    const key = sides.p1!;
    const skel = IC_IDOL_RIGS[key]!;
    const r = skel.roles;
    it(`${key}: fist / foot / weapon at the opponent's body on light, heavy and special`, () => {
      for (const kind of ["light", "heavy", "special"] as const) {
        const h = simHitFraction(fighter, kind, HOLD[kind])!;
        const own = strikeReach(skel, fighter, kind);
        for (const reachTo of [0.55, 0.85, 1.15, 1.45]) {
          const s = { clip: kind, time: 1, clipProgress: h, clipTime: h * HOLD[kind], hold: HOLD[kind], moveDir: 1, reachTo } as never;
          const solved = idolFighterPose(skel, fighter, s).solved;
          const z = (i: number) => solved.worldT[i]![2];
          const reach = Math.max(Math.max(z(r.handL), z(r.handR)) + (WEAPON_REACH[fighter] ?? 0), z(r.footL), z(r.footR));
          const target = Math.min(reachTo, own + MAX_STRIKE_LUNGE);
          expect(reach, `${kind} @ ${reachTo} m (own reach ${own.toFixed(2)})`).toBeGreaterThan(target - 0.08);
        }
      }
    });
  }

  it("no lunge outside attacks, none when already in range, and none left at the end of the move", () => {
    const skel = IC_IDOL_RIGS.icKenjiP1!;
    const base = { time: 1, clipTime: 0.2, hold: 0.38, moveDir: 1, reachTo: 1.4 };
    expect(strikeLunge(skel, "kenji", { ...base, clip: "idle", clipProgress: 0.5 } as never)).toBe(0);
    expect(strikeLunge(skel, "kenji", { ...base, clip: "light", clipProgress: 1 } as never)).toBeCloseTo(0, 6);
    expect(strikeLunge(skel, "kenji", { ...base, clip: "light", clipProgress: 0.3, reachTo: 0.1 } as never)).toBe(0);
    expect(strikeLunge(skel, "kenji", { ...base, clip: "light", clipProgress: simHitFraction("kenji", "light", 0.38)! } as never)).toBeGreaterThan(0.1);
  });
});
