import { describe, expect, it } from "vitest";
import { facingError, faceTowards, visualHeading, wrapAngle, yawToFace, type ForwardAxis } from "../../../packages/game/src/motion/facing";

const LOCAL: Record<ForwardAxis, [number, number]> = { "+z": [0, 1], "-z": [0, -1], "+x": [1, 0], "-x": [-1, 0] };

// Engine convention: rotating a node by t about +Y maps local (x, z) to (x cos t + z sin t, -x sin t + z cos t).
function worldForward(yaw: number, axis: ForwardAxis): [number, number] {
  const [x, z] = LOCAL[axis];
  return [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
}

describe("faceTowards / yawToFace", () => {
  const axes: ForwardAxis[] = ["+z", "-z", "+x", "-x"];

  it("points the model's own forward axis at the target for every axis and direction", () => {
    for (const axis of axes) {
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const dx = Math.sin(a) * 7, dz = Math.cos(a) * 7;
        const [fx, fz] = worldForward(yawToFace(dx, dz, axis), axis);
        expect(fx).toBeCloseTo(dx / 7, 9);
        expect(fz).toBeCloseTo(dz / 7, 9);
      }
    }
  });

  it("matches the old Bunker Zero convention (yaw 0 faces -Z, rotation -facing) for a -z model", () => {
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const dx = Math.sin(a), dz = Math.cos(a);
      const facing = Math.atan2(dx, -dz);
      expect(wrapAngle(yawToFace(dx, dz, "-z") - -facing)).toBeCloseTo(0, 9);
    }
  });

  it("a +z model that is rotated with the -z convention is exactly 180 degrees off", () => {
    const dx = 3, dz = -4;
    const wrongYaw = -Math.atan2(dx, -dz);
    expect(facingError(wrongYaw, dx, dz, "+z")).toBeCloseTo(Math.PI, 9);
    expect(facingError(wrongYaw, dx, dz, "-z")).toBeCloseTo(0, 9);
  });

  it("visualHeading and facingError agree with the rotation", () => {
    for (const axis of axes) {
      const yaw = 1.234;
      const [fx, fz] = worldForward(yaw, axis);
      expect(wrapAngle(visualHeading(yaw, axis) - Math.atan2(fx, fz))).toBeCloseTo(0, 9);
      expect(facingError(yaw, fx, fz, axis)).toBeCloseTo(0, 9);
    }
  });

  it("limits the turn rate, takes the short way round and converges", () => {
    const from = { x: 0, z: 0 }, target = { x: 0, z: 10 };
    let yaw = Math.PI * 0.95;                 // wanted yaw is 0 for a +z model: shortest is through PI -> -PI side? 0.95PI -> 0 is the short way down
    const steps: number[] = [];
    for (let i = 0; i < 60; i++) { const next = faceTowards(yaw, from, target, { turnRate: 4, dt: 1 / 60 }); steps.push(Math.abs(wrapAngle(next - yaw))); yaw = next; }
    expect(Math.max(...steps)).toBeLessThanOrEqual(4 / 60 + 1e-12);
    expect(Math.abs(wrapAngle(yaw))).toBeLessThan(Math.PI * 0.95);
    for (let i = 0; i < 120; i++) yaw = faceTowards(yaw, from, target, { turnRate: 4, dt: 1 / 60 });
    expect(Math.abs(wrapAngle(yaw))).toBeLessThan(1e-9);
  });

  it("snaps without a turn rate and rejects a missing dt", () => {
    expect(faceTowards(2, { x: 0, z: 0 }, { x: 5, z: 0 }, { forwardAxis: "+z" })).toBeCloseTo(Math.PI / 2, 9);
    expect(() => faceTowards(0, { x: 0, z: 0 }, { x: 1, z: 0 }, { turnRate: 3 })).toThrow();
  });

  it("returns yaw 0 for a zero direction", () => {
    expect(yawToFace(0, 0, "-z")).toBe(0);
  });
});
