import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton } from "../../../apps/showcase-port-shared/idol/humanoid";
import { BIKE_HUB, WHEEL_BLUR_MATERIAL, WHEEL_BLUR_SIZE, bikeRiderFrame } from "../../../examples/strange-orbit-port/art/idolModels";
import { LEAN_FULL, RIDER_HEIGHT, riderPose } from "../../../examples/strange-orbit-port/art/idolRider";
import { riderRig } from "../../../examples/strange-orbit-port/world";
import { applyMat3 } from "../../../examples/strange-orbit-port/orient";

const DIR = "apps/showcase-strange-orbit-port/assets/idol";
const angle = (a: { x: number; y: number; z: number; w: number }, b: { x: number; y: number; z: number; w: number }) =>
  2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w)));

describe("Craterline GP rider pose reads from the chase camera (GPU QA F2)", () => {
  const driver = createHumanoidDriver(readIdolSkeleton(parseGlbJson(readFileSync(`${DIR}/cgRiderCream.glb`))));
  const frame = bikeRiderFrame("cgBikeAlabasterNR");
  const at = (lean: number, boosting: boolean) => riderPose({ lean, steer: 0, boosting, speed: 30, time: 1 }, driver.map.hipHeight, RIDER_HEIGHT, frame);
  const roles = driver.map.roles;
  const chest = roles.chest ?? driver.map.spineChain[driver.map.spineChain.length - 1]!;

  it("hangs off clearly at full steer: big torso roll, head shifted into the turn, head turned", () => {
    const p0 = driver.pose(at(0, false)), pL = driver.pose(at(LEAN_FULL, false)), pR = driver.pose(at(-LEAN_FULL, false));
    expect(angle(pL.bones[chest]!.rotation, p0.bones[chest]!.rotation)).toBeGreaterThan(0.15);
    expect(angle(pL.bones[roles.head!]!.rotation, p0.bones[roles.head!]!.rotation)).toBeGreaterThan(0.2);
    const h0 = driver.modelPositions(at(0, false))[roles.head!]!;
    const hL = driver.modelPositions(at(LEAN_FULL, false))[roles.head!]!;
    const hR = driver.modelPositions(at(-LEAN_FULL, false))[roles.head!]!;
    // the head moves well sideways (model is 1 m tall: > 8 cm), opposite ways for the two turn directions
    expect(Math.abs(hL[0] - h0[0])).toBeGreaterThan(0.08);
    expect(Math.sign(hL[0] - h0[0])).toBe(-Math.sign(hR[0] - h0[0]));
    expect(angle(pR.bones[chest]!.rotation, pL.bones[chest]!.rotation)).toBeGreaterThan(0.3);
  });

  it("tucks on boost: spine and head bones turn and the head drops", () => {
    const a = driver.pose(at(0, false)), b = driver.pose(at(0, true));
    const spine = roles.spine ?? driver.map.spineChain[0]!;
    expect(angle(a.bones[spine]!.rotation, b.bones[spine]!.rotation)).toBeGreaterThan(0.08);
    expect(angle(a.bones[roles.head!]!.rotation, b.bones[roles.head!]!.rotation)).toBeGreaterThan(0.08);
    const ya = driver.modelPositions(at(0, false))[roles.head!]![1], yb = driver.modelPositions(at(0, true))[roles.head!]![1];
    expect(ya - yb).toBeGreaterThan(0.04);
  });
});

describe("Craterline GP wheel blur disc stands on the axle (GPU QA F2: tan disc lay flat under the bike)", () => {
  it("turns the disc's cylinder axis onto the lateral axle, keeps it inside the tyre and see-through", () => {
    const rig = riderRig(0, "bike", "gouache");
    for (const kind of ["blurF", "blurR"]) {
      const blur = rig.parts.find((p) => p.kind === kind)!;
      // cylinder axis (+Y) -> rig lateral (+Z or -Z); never vertical
      const axis = applyMat3(blur.local, [0, 1, 0]);
      expect(Math.abs(axis[2])).toBeCloseTo(1, 9);
      expect(Math.abs(axis[1])).toBeLessThan(1e-9);
      const wheel = rig.parts.find((p) => p.kind === (kind === "blurF" ? "wheelF" : "wheelR"))!;
      expect(blur.offset).toEqual(wheel.offset);
    }
    expect(WHEEL_BLUR_SIZE[0] / 2).toBeLessThan(BIKE_HUB.radius);
    expect(WHEEL_BLUR_SIZE[1]).toBeLessThan(0.05);
    expect(WHEEL_BLUR_MATERIAL.opacity ?? 1).toBeLessThan(0.5);
  });
});
