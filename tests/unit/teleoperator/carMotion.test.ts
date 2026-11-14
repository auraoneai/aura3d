import { describe, expect, it } from "vitest";
import {
  PITCH_SPRING,
  SIGNAL_COLORS,
  SIGNAL_FADE_S,
  carBodyEulerZYX,
  carBodyMatrix,
  conformalRearLampTransforms,
  createPitchSpring,
  roofSensorCrownPose,
  signalFadeColor
} from "../../../apps/showcase-teleoperator/src/carMotion";
import { PLAYABLE_FLEET, PLAYABLE_IDS, fittedSize } from "../../../apps/showcase-teleoperator/src/rules";

describe("grid dispatch GD-16 pitch spring and signal fade", () => {
  it("the body overshoots a braking dip, then settles on the sim pitch", () => {
    const s = createPitchSpring();
    let peak = 0;
    for (let i = 0; i < 30; i++) peak = Math.max(peak, s.update(0.03, 1 / 60, true));
    expect(peak).toBeGreaterThan(0.03);
    expect(peak).toBeLessThanOrEqual(PITCH_SPRING.max);
    for (let i = 0; i < 120; i++) s.update(0.03, 1 / 60, true);
    expect(s.value).toBeCloseTo(0.03, 3);
  });

  it("reduced motion shows the sim pitch with no spring", () => {
    const s = createPitchSpring();
    expect(s.update(0.02, 1 / 60, false)).toBe(0.02);
    expect(s.update(-0.01, 1 / 60, false)).toBe(-0.01);
  });

  it("the spring is frame-rate independent", () => {
    const a = createPitchSpring();
    const b = createPitchSpring();
    for (let i = 0; i < 60; i++) a.update(0.03, 1 / 60, true);
    for (let i = 0; i < 30; i++) b.update(0.03, 1 / 30, true);
    expect(Math.abs(a.value - b.value)).toBeLessThan(1e-3);
  });

  it("signals fade over 120 ms", () => {
    expect(SIGNAL_FADE_S).toBe(0.12);
    expect(signalFadeColor(SIGNAL_COLORS[0], SIGNAL_COLORS[1], 0)).toBe(SIGNAL_COLORS[0]);
    expect(signalFadeColor(SIGNAL_COLORS[0], SIGNAL_COLORS[1], 0.12)).toBe(SIGNAL_COLORS[1]);
    const mid = signalFadeColor("#000000", "#ffffff", 0.06);
    expect(mid).toBe("#808080");
  });

  it("mounts rear LED lightbars flush on every hull body and keeps cruiser lamps below roof-mast height", () => {
    for (const id of PLAYABLE_IDS) {
      const spec = PLAYABLE_FLEET[id];
      const sz = fittedSize(spec.bounds, spec.maxDim);
      const lamps = conformalRearLampTransforms({ x: 0, y: 0, z: -20, pitch: 0.02, yaw: 0.12, roll: -0.02 }, sz, id);
      expect(lamps).toHaveLength(2);
      expect(lamps[0]!.position![0]).toBeLessThan(lamps[1]!.position![0]);
      expect(lamps[0]!.position![1]).toBeGreaterThan(0.4);
      expect(lamps[0]!.position![1]).toBeLessThan(1.1);
    }
    const cruiserSz = fittedSize(PLAYABLE_FLEET.cruiser.bounds, PLAYABLE_FLEET.cruiser.maxDim);
    const spinA = roofSensorCrownPose({ x: 1, y: 0, z: -10, pitch: 0, yaw: 0, roll: 0 }, cruiserSz, "cruiser", 0.02, true)!;
    const spinB = roofSensorCrownPose({ x: 1, y: 0, z: -10, pitch: 0, yaw: 0, roll: 0 }, cruiserSz, "cruiser", 0.05, true)!;
    expect(spinA.laserRot[1]).not.toBeCloseTo(spinB.laserRot[1], 3);
  });

  it("keeps ZYX engine Euler body pose and 10 Hz spinning LiDAR crown nutation-free under combined pitch + yaw + roll banking", () => {
    const engineMatFromZYX = ([rx, ry, rz]: readonly [number, number, number]) => {
      const cx = Math.cos(rx), sx = Math.sin(rx);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const cz = Math.cos(rz), sz = Math.sin(rz);
      return [
        cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
        sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
        -sy, cy * sx, cy * cx
      ] as const;
    };
    const cruiserSz = fittedSize(PLAYABLE_FLEET.cruiser.bounds, PLAYABLE_FLEET.cruiser.maxDim);
    const pose = { x: 2.5, y: 0, z: -12, pitch: 0.045, yaw: 0.62, roll: -0.085 };
    const bodyMat = carBodyMatrix(pose.pitch, pose.yaw, pose.roll);
    const zyx = carBodyEulerZYX(pose.pitch, pose.yaw, pose.roll);
    const recon = engineMatFromZYX(zyx);
    for (let i = 0; i < 9; i++) {
      expect(recon[i]!).toBeCloseTo(bodyMat[i]!, 5);
    }

    const roofUp: [number, number, number] = [bodyMat[1], bodyMat[4], bodyMat[7]];
    for (let step = 0; step < 8; step++) {
      const crown = roofSensorCrownPose(pose, cruiserSz, "cruiser", step * 0.0125, true)!;
      const laserMat = engineMatFromZYX(crown.laserRot);
      // Local +Y of the spinning laser rotor must remain collinear with the banked car's roof normal at all spin angles.
      expect(laserMat[1]).toBeCloseTo(roofUp[0], 5);
      expect(laserMat[4]).toBeCloseTo(roofUp[1], 5);
      expect(laserMat[7]).toBeCloseTo(roofUp[2], 5);
    }
  });
});
