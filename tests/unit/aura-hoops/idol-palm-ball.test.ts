import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHandBounce } from "../../../packages/game/src/motion/handBounce";
import { computeHoopsAthleteJointPose } from "../../../apps/showcase-aura-hoops-3d/src/art/proceduralModels";
import { BALL_R } from "../../../apps/showcase-aura-hoops-3d/src/dribble";
import { hoopsHumanoidPose, idolModelToWorld, idolWorldToModel } from "../../../apps/showcase-aura-hoops-3d/src/idolBodies";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton } from "../../../apps/showcase-port-shared/idol/humanoid";

/**
 * The held / dribbled ball rides the palm that is DRAWN: with Idol bodies that is the Idol hand (driver.palmPoints),
 * not the procedural rig's palm (Idol arms are a different length). Real GLBs, real pose code, the game's hand-bounce.
 */
describe("Aura Hoops Idol bodies: ball sits in the Idol palm", () => {
  for (const [file, big] of [["hoopsIdolOrange", false], ["hoopsIdolVioletBig", true]] as const) {
    it(`${file}: dribble, carry and check keep the ball within 8 cm of the drawn palm; idle arms hang`, () => {
      const bytes = readFileSync(`apps/showcase-aura-hoops-3d/assets/idol/${file}.glb`);
      const driver = createHumanoidDriver(readIdolSkeleton(parseGlbJson(bytes)));
      const bounds = (driver.modelPositions({ rotations: {} }));
      const tposeHeight = Math.max(...Object.values(bounds).map((p) => p[1]));
      expect(tposeHeight).toBeGreaterThan(1.5); // admitted in metres (a 1 m box would mean an unscaled GLB)
      const bounce = createHandBounce({ ballRadius: BALL_R });
      const at: [number, number, number] = [1.2, 0, 4.5];
      const yaw = 0.7;
      for (const mode of ["dribble", "carry", "check", "idle"] as const) {
        for (const t of [0.1, 0.35, 0.6, 0.85]) {
          const pose = computeHoopsAthleteJointPose({
            id: big ? "p1" : "p0", big, clip: mode === "carry" ? "Run" : "Ready", time: t * 2, speed: mode === "carry" ? 4 : 0,
            x: at[0], y: at[1], z: at[2], yaw,
            stanceNow: mode !== "carry", dribbleNow: mode === "dribble" || mode === "check", checkHold: mode === "check",
            carryNow: mode === "carry", dribbleCycleT: t
          });
          const holds = mode !== "idle";
          const base = hoopsHumanoidPose(pose, big);
          const input = holds ? { ...base, handTargets: { right: idolWorldToModel(pose.palmRWorld, at, yaw, 1) } } : base;
          const palms = driver.palmPoints(input);
          const s = 1; // node scale is ~1 for these bodies (1.92 / 1.99 m rigs on 1.92 / 1.99 m GLBs)
          const palm = idolModelToWorld(palms.right, at, yaw, s);
          if (mode === "idle") {
            const p = driver.modelPositions(input), r = driver.map.roles as Record<string, string>;
            expect(p[r.rightUpperArm!]![1] - p[r.rightHand!]![1]).toBeGreaterThan(0.25);
            expect(p[r.leftUpperArm!]![1] - p[r.leftHand!]![1]).toBeGreaterThan(0.25);
            continue;
          }
          const f = bounce.place({ palm, holder: { x: at[0], z: at[2], vx: 0, vz: 0 } });
          const gap = Math.hypot(f.ball[0] - palm[0], f.ball[1] - palm[1], f.ball[2] - palm[2]) - BALL_R;
          expect(gap, `${mode} t=${t}`).toBeLessThan(0.08);
          // the drawn Idol palm meets the procedural palm the ball line was designed around (arm IK); when that palm is
          // beyond the Idol arm's reach the arm points straight at it and the ball rides the drawn palm instead
          const miss = Math.hypot(palm[0] - pose.palmRWorld[0], palm[1] - pose.palmRWorld[1], palm[2] - pose.palmRWorld[2]);
          const r = driver.map.roles as Record<string, string>;
          const rest = driver.modelPositions(base);
          const reach = Math.hypot(...[0, 1, 2].map((i) => rest[r.rightLowerArm!]![i]! - rest[r.rightUpperArm!]![i]!))
            + Math.hypot(...[0, 1, 2].map((i) => driver.palmPoints(base).right[i]! - rest[r.rightLowerArm!]![i]!));
          const shoulder = idolModelToWorld(driver.modelPositions(input)[r.rightUpperArm!]!, at, yaw, s);
          const excess = Math.max(0, Math.hypot(...[0, 1, 2].map((i) => pose.palmRWorld[i]! - shoulder[i]!)) - reach);
          expect(miss, `${mode} t=${t} palm miss (out of reach by ${excess.toFixed(3)})`).toBeLessThan(0.03 + excess);
        }
      }
    });
  }
});
