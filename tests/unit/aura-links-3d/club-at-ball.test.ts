import { describe, expect, it, afterAll } from "vitest";
import { game } from "@aura3d/engine";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { IDOL_BINDS } from "../../../apps/showcase-aura-links-3d/src/game/idolBinds";
import { idolProfile } from "../../../apps/showcase-aura-links-3d/src/game/idolHumanoid";
import { SKELETON_ATHLETE, STANCE_SHOT, evaluateSwing, makeRoot, solveSwing, useSkeleton } from "../../../apps/showcase-aura-links-3d/src/game/swingMath";
import type { CourseId } from "../../../apps/showcase-aura-links-3d/src/game/types";

/**
 * The golfer, the solve and the club are anchored on the ball's resting position (main.ts golferAt: round.ballPos, the
 * position onBallRest stores and the ball node draws): the club head must meet that point at address and impact on any lie.
 */
describe("club head at the resting ball on every lie", () => {
  afterAll(() => useSkeleton(SKELETON_ATHLETE));
  const kit = game.racketSports("aura-links-golfer");
  it("fairway, rough and sloping lies on every course: club head within 5 cm (horizontal) of the ball at address and impact", () => {
    useSkeleton(idolProfile(Object.values(IDOL_BINDS)[0]!));
    for (const id of Object.keys(COURSES) as CourseId[]) {
      const course = COURSES[id];
      for (const hole of course.holes.slice(0, 3)) {
        const t = buildHoleTerrain(course, hole);
        const lies = [[t.tee[0], t.tee[2]], ...hole.layout.path.map((p) => [p[0] + 6, p[1] + 2])];
        for (const [bx, bz] of lies) {
          const at: [number, number, number] = [bx!, t.height(bx!, bz!), bz!];
          const yaw = Math.atan2(t.cup[0] - bx!, t.cup[2] - bz!);
          const W = (v: readonly number[]) => kit.localToWorld(at, yaw, [1, 1, 1], v as any);
          const stance = W(STANCE_SHOT);
          const root = makeRoot(t.height(stance[0], stance[2]) - at[1]);
          for (const [phase, u] of [["address", 0], ["downswing", 1]] as const) {
            const head = W(solveSwing(evaluateSwing(phase, u), root).clubHead);
            expect(Math.hypot(head[0] - at[0], head[2] - at[2]), `${id} h${hole.number} ${phase}`).toBeLessThan(0.05);
          }
        }
      }
    }
  });
});
