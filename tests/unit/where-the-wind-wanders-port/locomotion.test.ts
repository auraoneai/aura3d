import { describe, expect, it } from "vitest";
import { CLIP_SECONDS, HERO_GAITS, STRIDE_SPEED } from "../../../examples/where-the-wind-wanders-port/locomotion";
import { measureBellkeeperRestBounds, sampleBellkeeperRigPose } from "../../../examples/where-the-wind-wanders-port/art/proceduralModels";
import { proceduralHeroStride } from "./glb-stride";

const HERO_HEIGHT = 2.9;
const hero = proceduralHeroStride();
const scale = HERO_HEIGHT / hero.meshHeight;

describe("hero gait table comes from the procedural Bellkeeper rig", () => {
  it("planted-foot speed matches forward kinematics of the procedural Bellkeeper rig within 2%", () => {
    expect(Math.abs((hero.clips.Walk!.stanceFootSpeed * scale) / STRIDE_SPEED.Walk - 1)).toBeLessThan(0.02);
    expect(Math.abs((hero.clips.Run!.stanceFootSpeed * scale) / STRIDE_SPEED.Run - 1)).toBeLessThan(0.02);
  });
  it("grounds boot soles at minY = 0 with total height 2.9 m and bounded non-cumulative joint angles", () => {
    const bounds = measureBellkeeperRestBounds();
    expect(bounds.minY).toBeCloseTo(0, 5);
    expect(bounds.maxY).toBeCloseTo(HERO_HEIGHT, 3);
    const early = sampleBellkeeperRigPose({ gait: "Walk", phaseSeconds: 0.25, windTime: 0.25 });
    const late = sampleBellkeeperRigPose({ gait: "Walk", phaseSeconds: 0.25 + CLIP_SECONDS.Walk * 1000, windTime: 4800 });
    for (const pose of [early, late]) {
      for (const rot of [
        pose.torsoRot,
        pose.headRot,
        pose.cloakTailRot,
        pose.leftArmRot,
        pose.rightArmRot,
        pose.staffChimeRot,
        pose.staffRibbonRot,
        pose.leftLegRot,
        pose.leftShinRot,
        pose.leftFootRot,
        pose.rightLegRot,
        pose.rightShinRot,
        pose.rightFootRot
      ]) {
        for (const angle of rot) {
          expect(Math.abs(angle)).toBeLessThan(Math.PI);
        }
      }
    }
  });
  it("clip durations match the gait cycle table", () => {
    for (const name of ["Walk", "Run", "Idle"] as const) expect(hero.clips[name]!.duration).toBeCloseTo(CLIP_SECONDS[name], 2);
  });
  it("feeds the library gait table: idle, walk, run in speed order", () => {
    expect(HERO_GAITS.map((g) => g.name)).toEqual(["Idle", "Walk", "Run"]);
    expect(HERO_GAITS.map((g) => g.speed)).toEqual([0, STRIDE_SPEED.Walk, STRIDE_SPEED.Run]);
    expect(HERO_GAITS.map((g) => g.cycle)).toEqual([CLIP_SECONDS.Idle, CLIP_SECONDS.Walk, CLIP_SECONDS.Run]);
  });
});
