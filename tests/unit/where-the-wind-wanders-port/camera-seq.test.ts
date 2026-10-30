import { describe, expect, it } from "vitest";
import { BELL } from "../../../examples/where-the-wind-wanders-port/sim";
import { terrainHeight } from "../../../examples/where-the-wind-wanders-port/terrain";
import { FINALE_SECONDS, INTRO_FROM, INTRO_SECONDS, createCameraSequencer, finaleOrbit, finalePose, followPoseAtStart, introPose } from "../../../examples/where-the-wind-wanders-port/camera-seq";

const angleTo = (from: readonly number[], to: readonly number[], p: readonly number[]): number => {
  const a = [to[0]! - from[0]!, to[1]! - from[1]!, to[2]! - from[2]!], b = [p[0]! - from[0]!, p[1]! - from[1]!, p[2]! - from[2]!];
  const d = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  return (Math.acos(d / (Math.hypot(...a) * Math.hypot(...b))) * 180) / Math.PI;
};

describe("where-the-wind-wanders-port camera sequences (WW47-C1)", () => {
  const follow = followPoseAtStart(43);

  it("the intro starts high with the belltower in frame and lands exactly on the follow pose", () => {
    const tower = [BELL.x, terrainHeight(BELL.x, BELL.z) + 2.3, BELL.z];
    expect(angleTo(INTRO_FROM.position, INTRO_FROM.target, tower)).toBeLessThan(INTRO_FROM.fov / 2);
    const end = introPose(INTRO_SECONDS, follow);
    end.position.forEach((v, i) => expect(v).toBeCloseTo(follow.position[i]!, 9));
  });

  it("the intro camera stays above the ground all the way down", () => {
    for (let t = 0; t <= INTRO_SECONDS; t += 0.1) {
      const p = introPose(t, follow).position;
      expect(p[1] - terrainHeight(p[0], p[2])).toBeGreaterThan(2.5);
    }
  });

  it("the finale orbits clear of the tower, rises, and leaves and rejoins the follow pose without a cut", () => {
    const by = terrainHeight(BELL.x, BELL.z);
    for (let t = 0; t <= FINALE_SECONDS; t += 0.1) {
      const p = finaleOrbit(t, 43).position;
      expect(Math.hypot(p[0] - BELL.x, p[2] - BELL.z)).toBeGreaterThan(8);
      expect(p[1] - by).toBeGreaterThan(5);
    }
    expect(finaleOrbit(FINALE_SECONDS, 43).position[1]).toBeGreaterThan(finaleOrbit(0, 43).position[1]);
    finalePose(0, follow).position.forEach((v, i) => expect(v).toBeCloseTo(follow.position[i]!, 9));
    finalePose(FINALE_SECONDS, follow).position.forEach((v, i) => expect(v).toBeCloseTo(follow.position[i]!, 9));
  });

  it("skip hands back to the follow camera on the next frame; reduced motion never starts a sequence", () => {
    const seq = createCameraSequencer({ reducedMotion: () => false });
    seq.start("intro");
    expect(seq.update(1 / 60, follow)).not.toBeNull();
    seq.skip();
    expect(seq.update(1 / 60, follow)).toBeNull();
    const reduced = createCameraSequencer({ reducedMotion: () => true });
    reduced.start("finale");
    expect(reduced.active).toBeNull();
    expect(reduced.update(1 / 60, follow)).toBeNull();
  });
});
