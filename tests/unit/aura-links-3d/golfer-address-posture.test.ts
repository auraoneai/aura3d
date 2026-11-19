import { afterAll, describe, expect, it } from "vitest";
import { SKELETON_ATHLETE, evaluateSwing, makeRoot, solveSwing, useSkeleton } from "../../../apps/showcase-aura-links-3d/src/game/swingMath";
import { IDOL_BINDS } from "../../../apps/showcase-aura-links-3d/src/game/idolBinds";
import { idolForwardKinematics, idolProfile, mapIdolRoles, retargetIdol } from "../../../apps/showcase-aura-links-3d/src/game/idolHumanoid";
import { golferMotionDeltas, type GolferMotionPhase } from "../../../apps/showcase-aura-links-3d/src/game/golferMotion";

/** angle (deg) of the segment a->b from straight up, on the Idol body's forward kinematics */
function segmentAngles(bind: (typeof IDOL_BINDS)[string], pose: ReturnType<typeof retargetIdol>) {
  const r = mapIdolRoles(bind);
  const fk = idolForwardKinematics(bind, pose);
  const P = (n: string) => fk.get(n)!.pos;
  const up = (a: string, b: string) => {
    const u = P(a), w = P(b);
    const v = [w[0]! - u[0]!, w[1]! - u[1]!, w[2]! - u[2]!];
    return (Math.acos(v[1]! / Math.hypot(v[0]!, v[1]!, v[2]!)) * 180) / Math.PI;
  };
  const neck = r.neck ?? r.head;
  return { spine: up(r.hips, neck), upperBack: up(r.chest, neck), head: r.neck ? up(r.neck, r.head) : 0 };
}

describe("Links Idol golfer address posture (owner: no slouch)", () => {
  afterAll(() => useSkeleton(SKELETON_ATHLETE));
  for (const [key, bind] of Object.entries(IDOL_BINDS)) {
    it(`${key}: ~30 deg hip hinge, straight upper back, head not hanging (address, idle, re-aim walk)`, () => {
      useSkeleton(idolProfile(bind));
      const root = makeRoot(0);
      const solved = solveSwing(evaluateSwing("address", 0), root);
      for (const phase of ["address", "idle", "walk"] as GolferMotionPhase[]) {
        for (const clock of [0, 0.4, 0.9, 1.7, 2.6]) {
          const a = segmentAngles(bind, retargetIdol(bind, golferMotionDeltas(bind, key, solved, root, phase, 0, clock)));
          expect(a.spine, `${phase}@${clock} spine`).toBeGreaterThanOrEqual(22);
          expect(a.spine, `${phase}@${clock} spine`).toBeLessThanOrEqual(40);
          expect(a.upperBack, `${phase}@${clock} upper back`).toBeLessThanOrEqual(48);
          expect(a.head, `${phase}@${clock} head`).toBeLessThanOrEqual(68);
        }
      }
    });
  }

  it("the takeaway starts from the address posture (no pop between address and backswing t=0)", () => {
    const bind = Object.values(IDOL_BINDS)[0]!;
    const key = Object.keys(IDOL_BINDS)[0]!;
    useSkeleton(idolProfile(bind));
    const root = makeRoot(0);
    const addr = segmentAngles(bind, retargetIdol(bind, golferMotionDeltas(bind, key, solveSwing(evaluateSwing("address", 0), root), root, "address", 0, 0)));
    const take = segmentAngles(bind, retargetIdol(bind, golferMotionDeltas(bind, key, solveSwing(evaluateSwing("backswing", 0), root), root, "backswing", 0, 0)));
    expect(Math.abs(addr.spine - take.spine)).toBeLessThan(6);
    expect(Math.abs(addr.upperBack - take.upperBack)).toBeLessThan(8);
  });
});
