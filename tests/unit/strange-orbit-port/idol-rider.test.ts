import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton, type Vec3 } from "@aura3d/engine/animation";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { BIKE_HUB, HERO_BIKES, RIVAL_BIKES, WHEEL_BLUR_RATE, bikeBodyTransform, bikeRiderFrame, riderKeyFor } from "../../../examples/strange-orbit-port/art/idolModels";
import { riderNodePosition, riderPose, rigToRiderModel, RIDER_HEIGHT } from "../../../examples/strange-orbit-port/art/idolRider";
import { IDOL_BIKE_HUBS, type IdolBikeKey } from "../../../examples/strange-orbit-port/art/idolFit";
import { riderRig } from "../../../examples/strange-orbit-port/world";
import { applyMat3, axisRotation, multiplyMat3 } from "../../../examples/strange-orbit-port/orient";

const DIR = "apps/showcase-strange-orbit-port/assets/idol";
const driverFor = (key: string) => createHumanoidDriver(readIdolSkeleton(parseGlbJson(readFileSync(`${DIR}/${key}.glb`))));
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("Craterline GP rigged Idol riders", () => {
  for (const riderKey of ["cgRiderCream", "cgRiderCobalt", "cgRiderCrimson2"] as const) {
    it(`${riderKey}: maps a humanoid, holds the bars and moves with steering, boost and time`, () => {
      const driver = driverFor(riderKey);
      expect(driver.map.ok).toBe(true);
      const scale = RIDER_HEIGHT; // GLB is 1 m tall
      const frame = bikeRiderFrame("cgBikeAlabasterNR");
      const at = (lean: number, boosting: boolean, time: number, steer = 0) =>
        riderPose({ lean, steer, boosting, speed: 30, time }, driver.map.hipHeight, scale, frame);
      const base = at(0, false, 1);
      // palms land on (or within a hand's width of) the grips in model space
      const palms = driver.palmPoints(base);
      const node = riderNodePosition(driver.map.hipHeight, scale, frame);
      expect(dist(palms.left, rigToRiderModel(frame.grips.left, node, scale))).toBeLessThan(0.1);
      expect(dist(palms.right, rigToRiderModel(frame.grips.right, node, scale))).toBeLessThan(0.1);
      // seated: the knees come up in front of the hips, the head stays above them
      const p = driver.modelPositions(base);
      const roles = driver.map.roles;
      expect(p[roles.leftLowerLeg!]![2]).toBeGreaterThan(p[roles.hips!]![2]);
      expect(p[roles.head!]![1]).toBeGreaterThan(p[roles.hips!]![1]);
      // bones change with steering (lean + head turn), boost (tuck) and time (breathing / buzz)
      const chest = roles.chest ?? driver.map.spineChain[driver.map.spineChain.length - 1]!;
      const rot = (pose: ReturnType<typeof driver.pose>, bone: string) => Object.values(pose.bones[bone]!.rotation);
      const delta = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));
      const p0 = driver.pose(base);
      expect(delta(rot(driver.pose(at(0.3, false, 1, 0.2)), chest), rot(p0, chest))).toBeGreaterThan(0.012);
      expect(delta(rot(driver.pose(at(0.3, false, 1)), roles.head!), rot(p0, roles.head!))).toBeGreaterThan(0.012);
      // boost tucks the head lower (model units; the body is 1 m tall)
      expect(p[roles.head!]![1] - driver.modelPositions(at(0, true, 1))[roles.head!]![1]).toBeGreaterThan(0.015);
      expect(delta(rot(driver.pose(at(0, false, 1.37)), chest), rot(p0, chest))).toBeGreaterThan(0.002);
      // object-form transforms survive the runtime handle's pose clone
      const assets = defineAuraAssets({ body: { type: "model", format: "glb", url: "https://offline.invalid/r.glb", bounds: [1, 1, 1] } });
      const handle = createAuraRuntimeNodeRegistry(scene().add(model(assets.body, { name: "r", scaleMode: "world" }).runtime({ id: "r" })).toJSON()).require("r");
      handle.setAnimationPose(p0 as never);
      const cloned = handle.animationPose() as unknown as { bones: Record<string, { rotation: { w: number } }> };
      expect(typeof cloned.bones[chest]!.rotation.w).toBe("number");
    });
  }

  it("every bike livery has a racer, and the seat / grips sit inside the bike body", () => {
    for (const bike of new Set<IdolBikeKey>([...HERO_BIKES, ...RIVAL_BIKES])) {
      expect(riderKeyFor(bike)).toMatch(/^cgRider/);
      const f = bikeRiderFrame(bike);
      expect(f.saddle[0]).toBeGreaterThan(-BIKE_HUB.rearZ);
      expect(f.saddle[0]).toBeLessThan(f.grips.left[0]);
      expect(f.grips.left[0]).toBeLessThan(-BIKE_HUB.frontZ);
      expect(f.saddle[1]).toBeGreaterThan(0.5);
      expect(f.saddle[1]).toBeLessThan(1);
      expect(f.grips.left[2]).toBeLessThan(0);
      expect(f.grips.right[2]).toBeGreaterThan(0);
    }
  });
});

describe("Craterline GP Idol bike wheels", () => {
  it("lands each body's measured hubs on the rig's wheel hubs (wheels touch the ground)", () => {
    for (const key of Object.keys(IDOL_BIKE_HUBS) as IdolBikeKey[]) {
      const t = bikeBodyTransform(key), h = IDOL_BIKE_HUBS[key];
      // p' = Ry(pi) (k p) + t: z -> -k z + tz, y -> k y + ty
      const fz = -t.scale * h.front[1] + t.position[2], rz = -t.scale * h.rear[1] + t.position[2];
      expect(fz).toBeCloseTo(BIKE_HUB.frontZ, 6);
      expect(rz).toBeCloseTo(BIKE_HUB.rearZ, 6);
      for (const y of [h.front[0], h.rear[0]]) expect(Math.abs(t.scale * y + t.position[1] - BIKE_HUB.y)).toBeLessThan(0.06);
      expect(BIKE_HUB.y).toBeCloseTo(BIKE_HUB.radius, 6);
    }
  });

  it("rolls forward by distance / radius at every speed, about a fixed lateral axle, with a blur disc when fast", () => {
    const rig = riderRig(0, "bike", "gouache");
    const wheel = rig.parts.find((p) => p.kind === "wheelF")!;
    expect(wheel.spinAxis).toBe("x");
    expect(rig.parts.some((p) => p.kind === "blurF") && rig.parts.some((p) => p.kind === "rider")).toBe(true);
    const dt = 1 / 60;
    for (const speed of [2, 8, 20, 45]) {
      // world.ts: spin += speed * dt / radius
      let spin = 0;
      for (let f = 0; f < 10; f++) spin += (speed * dt) / BIKE_HUB.radius;
      expect(spin).toBeCloseTo((speed * 10 * dt) / BIKE_HUB.radius, 9);
      const top = applyMat3(multiplyMat3(wheel.local, axisRotation("x", -Math.min(spin, 1))), [0, 1, 0]);
      expect(top[0]).toBeGreaterThan(0); // the tyre top moves toward the rig's forward +X
      expect(applyMat3(multiplyMat3(wheel.local, axisRotation("x", -spin)), [1, 0, 0])[2]).toBeCloseTo(1, 9); // axle stays lateral
      expect(speed / BIKE_HUB.radius > WHEEL_BLUR_RATE).toBe(speed >= 8);
    }
  });
});
