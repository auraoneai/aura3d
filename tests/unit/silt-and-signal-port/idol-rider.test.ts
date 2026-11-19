/**
 * Idol wow pass (FIX-CHECKLIST.md rules 1 and 3): the rigged Idol courier is posed every frame from the rider motion
 * values; its bones change over time and with steering, the arms are out for balance (wrists below shoulders, away from
 * the hips), and both boots stay planted on the deck through the crouch.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton } from "../../../apps/showcase-port-shared/idol/humanoid";
import { legExtension, riderHumanoidPose, riderMotionPose, type RiderMotion } from "../../../examples/silt-and-signal-port/art/idolRider";

const driver = createHumanoidDriver(readIdolSkeleton(parseGlbJson(readFileSync("examples/silt-and-signal-port/assets/idol/duneRiderRig.glb"))));
const base: RiderMotion = { crouch: 0.1, leanFwd: 0.12, carve: 0, air01: 0, celebrate: 0, breathe: 0, armWave: 0, time: 0, motion: 1 };
const rot = (m: RiderMotion, role: "chest" | "hips" | "leftUpperArm") => {
  const name = driver.map.roles[role]!;
  const q = driver.pose(riderHumanoidPose(m)).bones[name]!.rotation;
  return [q.x, q.y, q.z, q.w];
};
const delta = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));

describe("Duneglide rigged Idol courier", () => {
  it("maps a full humanoid and emits object-form bone poses", () => {
    expect(driver.map.ok, `missing ${driver.map.missing.join(",")}`).toBe(true);
    const pose = driver.pose(riderHumanoidPose(base));
    expect(pose.mode).toBe("replace");
    for (const bone of Object.values(pose.bones)) expect(typeof bone.rotation.w).toBe("number");
  });

  it("moves over time (idle balance sway) and with steering (carve) and boost (crouch)", () => {
    expect(delta(rot(base, "hips"), rot({ ...base, time: 0.9 }, "hips"))).toBeGreaterThan(0.005);
    // the torso turn is spread over Idol's spine chain, so measure where the head ends up: it leans into the carve
    const head = driver.map.roles.head!;
    const headAt = (m: RiderMotion) => driver.modelPositions(riderHumanoidPose(m))[head]!;
    const straight = headAt(base), carving = headAt({ ...base, carve: 0.5 });
    expect(Math.hypot(carving[0] - straight[0], carving[2] - straight[2])).toBeGreaterThan(0.05 * driver.map.hipHeight);
    expect(delta(rot(base, "chest"), rot({ ...base, carve: 0.5 }, "chest"))).toBeGreaterThan(0.01);
    expect(delta(rot(base, "leftUpperArm"), rot({ ...base, carve: -0.5 }, "leftUpperArm"))).toBeGreaterThan(0.05);
    // boost: the hips drop and the head moves forward over the lead boot
    const boosting = headAt({ ...base, crouch: 0.8, leanFwd: 0.4 });
    expect(straight[1] - boosting[1]).toBeGreaterThan(0.08 * driver.map.hipHeight);
    expect(Math.abs(boosting[2] - straight[2])).toBeGreaterThan(0.03 * driver.map.hipHeight);
  });

  it("keeps both boots planted on the deck through the crouch and the carve", () => {
    const rest = driver.modelPositions({ rotations: {} });
    const lf = driver.map.roles.leftFoot!, rf = driver.map.roles.rightFoot!;
    const ankle = Math.min(rest[lf]![1], rest[rf]![1]);
    const tol = 0.07 * driver.map.hipHeight;
    for (const crouch of [0, 0.4, 0.9]) {
      for (const carve of [-0.6, 0, 0.6]) {
        const p = driver.modelPositions(riderHumanoidPose({ ...base, crouch, carve }));
        expect(Math.abs(p[lf]![1] - ankle), `lead crouch ${crouch} carve ${carve}`).toBeLessThan(tol);
        expect(Math.abs(p[rf]![1] - ankle), `rear crouch ${crouch} carve ${carve}`).toBeLessThan(tol);
        // a sail-board stance: lead boot ahead of the rear boot
        expect(p[lf]![2] - p[rf]![2], `stance crouch ${crouch}`).toBeGreaterThan(0.15 * driver.map.hipHeight);
      }
    }
    expect(legExtension(0.9)).toBeLessThan(legExtension(0));
  });

  it("relaxes the arms at hover speed (hands low, near the hips, elbows bent) and spreads them for balance at speed", () => {
    const r = driver.map.roles;
    const spread = (speed01: number) => {
      const p = driver.modelPositions(riderMotionPose({ ...base, speed01 }));
      return Math.abs(p[r.leftHand!]![0] - p[r.rightHand!]![0]);
    };
    const slow = driver.modelPositions(riderMotionPose({ ...base, speed01: 0 }));
    for (const [shoulder, hand] of [[r.leftUpperArm!, r.leftHand!], [r.rightUpperArm!, r.rightHand!]] as const) {
      // hands well below the shoulders at hover speed (not the arms-wide T-pose)
      expect(slow[shoulder]![1] - slow[hand]![1]).toBeGreaterThan(0.35 * driver.map.hipHeight);
    }
    expect(spread(1)).toBeGreaterThan(spread(0) + 0.1 * driver.map.hipHeight);
  });

  it("layers the fal motion clips on the upper body: moves over time, leans opposite ways into left and right carves", () => {
    const head = driver.map.roles.head!, chest = driver.map.roles.chest!;
    const at = (m: RiderMotion) => driver.modelPositions(riderMotionPose(m));
    const q = (m: RiderMotion) => { const r = driver.pose(riderMotionPose(m)).bones[chest]!.rotation; return [r.x, r.y, r.z, r.w]; };
    expect(delta(q(base), q({ ...base, time: 1.3 }))).toBeGreaterThan(0.01);
    const left = at({ ...base, carve: -0.6 })[head]!, right = at({ ...base, carve: 0.6 })[head]!;
    expect(Math.abs(left[0] - right[0])).toBeGreaterThan(0.05 * driver.map.hipHeight);
    expect(at({ ...base, crouch: 0.9 })[head]![1]).toBeLessThan(at(base)[head]![1]);
  });

  it("keeps both boots planted under the motion clips (foot-plant overlay)", () => {
    const rest = driver.modelPositions({ rotations: {} });
    const lf = driver.map.roles.leftFoot!, rf = driver.map.roles.rightFoot!;
    const ankle = Math.min(rest[lf]![1], rest[rf]![1]);
    for (const time of [0, 0.7, 1.9, 3.1]) {
      for (const carve of [-0.6, 0, 0.6]) {
        const p = driver.modelPositions(riderMotionPose({ ...base, time, carve, crouch: 0.5 }));
        expect(Math.abs(p[lf]![1] - ankle), `t ${time} carve ${carve}`).toBeLessThan(0.07 * driver.map.hipHeight);
        expect(Math.abs(p[rf]![1] - ankle), `t ${time} carve ${carve}`).toBeLessThan(0.07 * driver.map.hipHeight);
      }
    }
  });
});
