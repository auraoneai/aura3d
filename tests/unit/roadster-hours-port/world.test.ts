import { describe, expect, it } from "vitest";
import { LEVELS, levelLayout, roadProfile } from "../../../examples/roadster-hours-port/course";
import { LOOKS, ORIGINAL_LOOKS } from "../../../examples/roadster-hours-port/look";
import {
  composeChassisEuler,
  composeWheelEuler,
  computeWheelWorldPose
} from "../../../examples/roadster-hours-port/roadsterRig";
import { buildWorld, roadPoint } from "../../../examples/roadster-hours-port/world";

/** Exact Aura3D `node.setRotation([rx, ry, rz])` rotation matrix (`R = Rz(rz) * Ry(ry) * Rx(rx)`). */
function applyEngineEulerZYX(euler: readonly [number, number, number], v: readonly [number, number, number]): [number, number, number] {
  const [rx, ry, rz] = euler;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // Rx(rx) * v
  const x1 = v[0];
  const y1 = cx * v[1] - sx * v[2];
  const z1 = sx * v[1] + cx * v[2];
  // Ry(ry) * v1
  const x2 = cy * x1 + sy * z1;
  const y2 = y1;
  const z2 = -sy * x1 + cy * z1;
  // Rz(rz) * v2
  return [cz * x2 - sz * y2, sz * x2 + cz * y2, z2];
}

describe("roadster-hours-port world", () => {
  it("places points on the road: z runs along -s, lateral offsets are symmetric about the centre line", () => {
    for (const level of LEVELS) {
      const c = roadPoint(level, 500, 0, 0);
      const l = roadPoint(level, 500, -4, 0);
      const r = roadPoint(level, 500, 4, 0);
      expect(c[2]).toBeCloseTo(-500, 6);
      expect(c[1]).toBeCloseTo(roadProfile(level, 500).y, 9);
      expect((l[0] + r[0]) / 2).toBeCloseTo(c[0], 6);
      expect(roadPoint(level, 500, 0, 3)[1] - c[1]).toBeCloseTo(3, 9);
    }
  });

  it("builds every route; vehicles are procedural/baked cars in per-material batched meshes plus box rigs", () => {
    LEVELS.forEach((level, i) => {
      const world = buildWorld(i);
      expect(world.level.id).toBe(level.id);
      const lineup = levelLayout(level).vehicles.length;
      expect(world.vehicleCount).toBe(lineup + level.traffic.length);
      expect(world.vehicleCount).toBeGreaterThan(20);
      expect(world.vehicleSlots).toBeGreaterThan(world.vehicleCount);
      expect(world.vehicleMeshes).toBeGreaterThanOrEqual(3);
      expect(world.vehicleGeometries).toBeGreaterThan(2);
    });
  });

  it("keeps wheel spin axis 100% rock-steady in world space across yaw (0, 0.7, 1.57, pi/2, 2.4) and roll (0..2*PI)", () => {
    const yaws = [0, 0.7, 1.57, Math.PI / 2, 2.4];
    const steers = [-0.32, 0, 0.32];
    const cambers = [-0.035, 0, 0.035];
    for (const yaw of yaws) {
      for (const steer of steers) {
        for (const camber of cambers) {
          const baseEuler = composeWheelEuler(yaw, 0, steer, camber);
          const baseAxle = applyEngineEulerZYX(baseEuler, [1, 0, 0]);
          for (let k = 1; k <= 32; k++) {
            const roll = (k / 32) * Math.PI * 2;
            const euler = composeWheelEuler(yaw, roll, steer, camber);
            const axle = applyEngineEulerZYX(euler, [1, 0, 0]);
            expect(axle[0]).toBeCloseTo(baseAxle[0], 11);
            expect(axle[1]).toBeCloseTo(baseAxle[1], 11);
            expect(axle[2]).toBeCloseTo(baseAxle[2], 11);
          }
          // Also verify computeWheelWorldPose with pitched + banked chassis
          const chassisPose = [0.09, yaw, -0.07] as const;
          const pose0 = computeWheelWorldPose([10, 2, -50], chassisPose, [-0.82, -0.18, -1.3], steer, 0, camber);
          const axle0 = applyEngineEulerZYX(pose0.rotation, [1, 0, 0]);
          const knuckleAxle = applyEngineEulerZYX(pose0.knuckleRotation, [1, 0, 0]);
          expect(knuckleAxle[0]).toBeCloseTo(axle0[0], 11);
          expect(knuckleAxle[1]).toBeCloseTo(axle0[1], 11);
          expect(knuckleAxle[2]).toBeCloseTo(axle0[2], 11);
          for (let k = 1; k <= 24; k++) {
            const spin = (k / 24) * Math.PI * 2;
            const poseK = computeWheelWorldPose([10, 2, -50], chassisPose, [-0.82, -0.18, -1.3], steer, spin, camber);
            const axleK = applyEngineEulerZYX(poseK.rotation, [1, 0, 0]);
            expect(axleK[0]).toBeCloseTo(axle0[0], 11);
            expect(axleK[1]).toBeCloseTo(axle0[1], 11);
            expect(axleK[2]).toBeCloseTo(axle0[2], 11);
          }
        }
      }
      // Chassis ZYX helper preserves local right axis horizontally when bank=0, pitch!=0
      const chEuler = composeChassisEuler(0.18, yaw, 0);
      const rightAxis = applyEngineEulerZYX(chEuler, [1, 0, 0]);
      expect(rightAxis[1]).toBeCloseTo(0, 11);
    }
  });

  it("keeps distant linear fog (near >= 380, far >= 2600), subtle sun-shafts, and zero sun lensFlare wash", () => {
    for (const look of [...Object.values(LOOKS), ...Object.values(ORIGINAL_LOOKS)]) {
      expect(look.fogNear).toBeGreaterThanOrEqual(380);
      expect(look.fogFar).toBeGreaterThanOrEqual(2600);
    }
    const collectNodes = (v: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] => {
      if (Array.isArray(v)) { v.forEach((item) => collectNodes(item, out)); return out; }
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (typeof o.kind === "string") out.push(o);
        for (const key of Object.keys(o)) if (key !== "geometry" && key !== "material") collectNodes(o[key], out);
      }
      return out;
    };
    for (let i = 0; i < LEVELS.length; i++) {
      const all = collectNodes(buildWorld(i, "gu47").scene.toJSON());
      expect(all.some((n) => n.name === "sun flare" || n.light === "lens-flare" || n.effect === "lens-flare")).toBe(false);
      const haze = all.find((n) => n.name === "haze")!;
      expect(Number(haze.near)).toBeGreaterThanOrEqual(360);
      expect(Number(haze.far)).toBeGreaterThanOrEqual(2800);
      expect(haze.maxOpacity).toBe(0.34);
      expect(haze.affectsBackground).toBe(false);
      const shafts = all.find((n) => n.name === "sun-shafts")!;
      expect(shafts.intensity).toBe(0.04);
      expect(shafts.godRayDensity).toBe(0.25);
    }
  });
});
