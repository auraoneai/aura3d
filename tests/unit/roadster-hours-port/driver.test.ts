import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton, type Vec3 } from "@aura3d/engine/animation";
import {
  DRIVER_HEIGHT,
  STEERING_WHEEL_RADIUS,
  bodyGlbToChassis,
  chassisToDriverModel,
  driverNodePosition,
  driverPose,
  driverSeatFrame,
  gripPoints,
  steeringWheelAngle,
  driverWorldTransform
} from "../../../examples/roadster-hours-port/art/driver";
import { createRun, defaultCareer, stepRun, SIM_STEP } from "../../../examples/roadster-hours-port/sim";
import { DEFAULT_PARAMS, autopilot } from "../../../examples/roadster-hours-port/autopilot";
import { composeChassisEuler, ROADSTER_HALF_L, ROADSTER_HALF_W } from "../../../examples/roadster-hours-port/roadsterRig";
import { roadProfile } from "../../../examples/roadster-hours-port/course";
import { roadPoint } from "../../../examples/roadster-hours-port/world";
import { IDOL_HERO_BODY_Y, IDOL_HERO_CLEARANCE } from "../../../examples/roadster-hours-port/art/idol";
import { ROADSTER_HALF_H } from "../../../examples/roadster-hours-port/roadsterRig";
import { LEVELS } from "../../../examples/roadster-hours-port/course";
import { IDOL_GROUND_SKIRT, buildWorld } from "../../../examples/roadster-hours-port/world";

const GLB = "apps/showcase-roadster-hours-port/assets/idol/swDriver.glb";
const driver = createHumanoidDriver(readIdolSkeleton(parseGlbJson(readFileSync(GLB))));
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const scale = DRIVER_HEIGHT; // the rigged GLB is 1 m tall (normalized.sceneScale 1.75)
const seat = driverSeatFrame();
const hip = driver.map.hipHeight;
const node = driverNodePosition(hip, scale, seat);
const pose = (steerYaw: number, time = 1, speed = 40) => driverPose({ steerYaw, speed, load: -steerYaw * 2, time }, hip, scale, seat);

describe("Saltwind Highway rigged Idol driver", () => {
  it("maps a humanoid and keeps both palms on the steering wheel rim at every steer angle", () => {
    expect(driver.map.ok).toBe(true);
    for (const steer of [-0.42, -0.2, 0, 0.2, 0.42]) {
      const grips = gripPoints(seat, steeringWheelAngle(steer));
      const palms = driver.palmPoints(pose(steer));
      expect(dist(palms.left, chassisToDriverModel(grips.left, node, scale))).toBeLessThan(0.1);
      expect(dist(palms.right, chassisToDriverModel(grips.right, node, scale))).toBeLessThan(0.1);
      // grips sit on the rim
      expect(dist(grips.left, seat.wheelCentre)).toBeCloseTo(STEERING_WHEEL_RADIUS, 6);
    }
  });

  it("turns the head, hands and torso with the steering input and keeps moving on a straight", () => {
    const roles = driver.map.roles;
    const head = roles.head!;
    const hand = roles.leftLowerArm!;
    const rot = (p: ReturnType<typeof driver.pose>, bone: string) => Object.values(p.bones[bone]!.rotation);
    const straight = driver.pose(pose(0));
    const left = driver.pose(pose(0.4));
    const right = driver.pose(pose(-0.4));
    const delta = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));
    expect(delta(rot(straight, head), rot(left, head))).toBeGreaterThan(0.05);
    expect(delta(rot(left, head), rot(right, head))).toBeGreaterThan(0.1);
    expect(delta(rot(straight, hand), rot(left, hand))).toBeGreaterThan(0.02);
    // the hands follow the turning wheel
    const pl = driver.palmPoints(pose(0.4)).left, p0 = driver.palmPoints(pose(0)).left;
    expect(dist(pl, p0)).toBeGreaterThan(0.08);
    // breathing / buzz: two clock times give different chest bones on a straight
    const chest = roles.chest ?? driver.map.spineChain[driver.map.spineChain.length - 1]!;
    expect(delta(rot(driver.pose(pose(0, 0.4)), chest), rot(driver.pose(pose(0, 2.0)), chest))).toBeGreaterThan(1e-3);
    // object-form transforms (tuples do not survive the runtime handle's pose clone)
    expect(straight.bones[head]!.rotation).toHaveProperty("w");
  });

  it("sits in the left seat of the cockpit: hips on the cushion, head above the belt line, knees forward", () => {
    // left seat: the car's left is chassis -X; hip just above the 0.44 m cushion (road frame = chassis + ROADSTER_HALF_H)
    expect(seat.hip[0]).toBeLessThan(-0.25);
    expect(seat.hip[1] + ROADSTER_HALF_H).toBeGreaterThan(0.45);
    expect(seat.hip[1] + ROADSTER_HALF_H).toBeLessThan(0.65);
    const p = driver.modelPositions(pose(0));
    const roles = driver.map.roles;
    const headChassisY = node[1] + p[roles.head!]![1] * scale;
    expect(headChassisY + ROADSTER_HALF_H).toBeGreaterThan(1.02); // head joint over the ~1.0 m belt line (helmet top ~0.2 m higher)
    // knees forward of the hips (model +Z = facing = chassis -Z)
    expect(p[roles.leftLowerLeg!]![2]).toBeGreaterThan(p[roles.hips!]![2] + 0.2);
    // the wheel is in front of the driver
    expect(seat.wheelCentre[2]).toBeLessThan(seat.hip[2] - 0.3);
  });

  it("keeps the legs inside the car: knees, ankles and toes above the floor pan (no feet hanging under the car on a jump)", () => {
    // GPU QA (Nov 18): the shins-down pose put the ankles at 0.08 m and the toes at 0.00 m above the road, through the floor
    // pan (its underside is 0.25-0.31 m in the footwell on swRoadsterBodyB) and visible under the car on every jump
    const roles = driver.map.roles;
    for (const steer of [-0.42, 0, 0.42]) {
      const p = driver.modelPositions(pose(steer));
      const bones = [roles.leftLowerLeg!, roles.rightLowerLeg!, roles.leftFoot!, roles.rightFoot!];
      for (const foot of [roles.leftFoot!, roles.rightFoot!]) { const toes = Object.keys(p).find((b) => b === `bone_${Number(foot.split("_")[1]) + 1}`); if (toes) bones.push(toes); }
      for (const b of bones) {
        const roadY = node[1] + p[b]![1] * scale + ROADSTER_HALF_H;
        const chassisZ = node[2] - p[b]![2] * scale;
        expect(roadY, `${b} at steer ${steer}`).toBeGreaterThan(0.33);
        // and forward of the seat, behind the front axle (inside the cockpit's footwell)
        expect(chassisZ).toBeLessThan(seat.hip[2]);
        expect(chassisZ).toBeGreaterThan(-1.0);
      }
    }
  });

  it("the runtime hands the node bone rotations from the humanoid driver, not the role-keyed pose input", () => {
    // GPU QA (Nov 18): world.ts passed driverPose(...) straight to setAnimationPose (keyed by role, the engine keys by GLB
    // node name), so the driver stayed in its rest pose with the legs through the floor and the hands off the wheel
    const src = readFileSync("examples/roadster-hours-port/world.ts", "utf8");
    expect(src).toMatch(/setAnimationPose\?\.\(driverRig\.pose\((?:driverAnim\.update\([^,]+,\s*)?driverPose\(/);
    const solved = driver.pose(pose(0.2));
    expect(Object.keys(solved.bones).every((b) => /^bone_\d+$/.test(b))).toBe(true);
    expect(Object.keys(solved.bones)).toEqual(expect.arrayContaining([driver.map.roles.leftLowerLeg!, driver.map.roles.rightLowerArm!]));
  });

  it("keeps the Idol body where the procedural car sat: lowest point on the road clearance, belt line ~1 m", () => {
    expect(bodyGlbToChassis([0, 0, 0])[1] + ROADSTER_HALF_H).toBeCloseTo(IDOL_HERO_CLEARANCE, 6);
    expect(IDOL_HERO_BODY_Y + ROADSTER_HALF_H).toBeCloseTo(IDOL_HERO_CLEARANCE, 6);
    expect(bodyGlbToChassis([0, 1.0, 0])[1] + ROADSTER_HALF_H).toBeCloseTo(1.02, 2);
  });
});

describe("Saltwind Highway driver world transform (top-level node, never parented to the moving car group)", () => {
  it("keeps the driver inside the car's footprint at seat height over several frames of driving, turning and banking", () => {
    const career = defaultCareer();
    const run = createRun(0, career);
    const level = LEVELS[0]!;
    let frames = 0;
    for (let i = 0; i < 120 * 12 && frames < 40; i++) {
      stepRun(run, run.phase === "running" ? autopilot(run, DEFAULT_PARAMS) : {}, SIM_STEP, career);
      if (run.phase !== "running" || i % 30 !== 0) continue;
      frames++;
      const prof = roadProfile(level, run.s);
      const psi = -(prof.heading + run.theta) + run.spin;
      const pitch = run.flip, roll = run.roll + prof.bank;
      const carP = roadPoint(level, run.s, run.l, run.h + ROADSTER_HALF_H + 0.01);
      const dw = driverWorldTransform(carP, { yaw: psi, pitch, roll }, hip, scale);
      expect(dw.scale).toBeCloseTo(DRIVER_HEIGHT, 6);
      // back into the chassis frame: R^T (p - carP) must be the seat offset (inside the footprint, at seat height)
      const e = composeChassisEuler(pitch, psi, roll);
      const d: [number, number, number] = [dw.position[0] - carP[0], dw.position[1] - carP[1], dw.position[2] - carP[2]];
      const cx = Math.cos(e[0]), sx = Math.sin(e[0]), cy = Math.cos(e[1]), sy = Math.sin(e[1]), cz = Math.cos(e[2]), sz = Math.sin(e[2]);
      // R = Rz Ry Rx; R^T d = Rx^T Ry^T Rz^T d
      const a = [cz * d[0] + sz * d[1], -sz * d[0] + cz * d[1], d[2]];
      const b = [cy * a[0] - sy * a[2], a[1], sy * a[0] + cy * a[2]];
      const local = [b[0], cx * b[1] + sx * b[2], -sx * b[1] + cx * b[2]];
      const want = driverNodePosition(hip, scale, seat);
      for (let k = 0; k < 3; k++) expect(local[k]!).toBeCloseTo(want[k]!, 4);
      expect(Math.abs(local[0]!)).toBeLessThan(ROADSTER_HALF_W);
      expect(Math.abs(local[2]!)).toBeLessThan(ROADSTER_HALF_L);
      // the seated hip (node + rest hip height) sits at seat height above the road under the car
      expect(local[1]! + hip * scale + ROADSTER_HALF_H).toBeGreaterThan(0.45);
      expect(local[1]! + hip * scale + ROADSTER_HALF_H).toBeLessThan(0.65);
    }
    expect(frames).toBeGreaterThan(10);
  });
});

describe("Saltwind Highway Idol set pieces sit on the terrain", () => {
  it("grounds the lighthouse, diners, viaducts and every villa/townhouse on the lowest point under its footprint", () => {
    let checked = 0;
    LEVELS.forEach((_level, i) => {
      const world = buildWorld(i, "gu47", { richScenery: true, idol: true });
      for (const g of world.idolGrounding) {
        // no floating corner, and only the skirt below the lowest corner
        expect(g.baseY, g.name).toBeLessThanOrEqual(g.groundMin + 1e-6);
        expect(g.groundMin - g.baseY, g.name).toBeLessThanOrEqual(IDOL_GROUND_SKIRT + 1e-6);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(5);
  });
});
