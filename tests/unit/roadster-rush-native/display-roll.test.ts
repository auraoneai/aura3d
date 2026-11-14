import { describe, expect, it } from "vitest";
import {
  DISPLAY_LEAN_MAX,
  HERO_PLUME_LOCAL_MATS,
  bodyMatrixFromYXZ,
  displayRoll,
  eulerZYXFromMat3,
  eulerZYXFromYXZ,
  mulMat3,
  rotateOffsetByMat3
} from "../../../apps/showcase-roadster-rush/src/native/presentation";
import { FreewayWorld, Player, RoadsterGame, Traffic } from "../../../apps/showcase-roadster-rush/src/native";

function mat3FromEngineZYX(rx: number, ry: number, rz: number): readonly number[] {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    cz * cy, -sz * cx + cz * sy * sx, sz * sx + cz * sy * cx,
    sz * cy, cz * cx + sz * sy * sx, -cz * sx + sz * sy * cx,
    -sy, cy * sx, cy * cx
  ];
}

describe("Apex Overdrive hero lean (GU47 AO-AN1)", () => {
  it("caps the lane-change lean at 6 degrees and keeps barrel rolls whole", () => {
    expect(DISPLAY_LEAN_MAX).toBeCloseTo((6 * Math.PI) / 180, 9);
    expect(displayRoll(0.38, false)).toBeCloseTo(DISPLAY_LEAN_MAX, 9);
    expect(displayRoll(-0.38, false)).toBeCloseTo(-DISPLAY_LEAN_MAX, 9);
    expect(displayRoll(0.05, false)).toBe(0.05);
    expect(displayRoll(Math.PI, true)).toBe(Math.PI);
    expect(displayRoll(Number.NaN, false)).toBe(0);
  });

  it("keeps the lean's sign tied to lateral velocity on a real run (>= 95% of moving samples)", () => {
    const game = new RoadsterGame({ player: new Player(), traffic: new Traffic(), world: new FreewayWorld(), params: new URLSearchParams("seed=42"), storage: null });
    game.boot();
    game.start();
    game.manual = true;
    let moving = 0;
    let agree = 0;
    for (let i = 0; i < 1800 && game.mode === "playing"; i++) {
      if (i % 90 === 0) game.triggerAction(i % 180 === 0 ? "left" : "right");
      game.simStep(1 / 60);
      const p = game.player as unknown as { _laneVel: number; rolling: boolean; pivot: { rotation: { z: number } } };
      if (p.rolling || Math.abs(p._laneVel) < 1) continue;
      moving++;
      const roll = displayRoll(p.pivot.rotation.z, p.rolling);
      if (Math.sign(roll) === -Math.sign(p._laneVel)) agree++;
    }
    expect(moving).toBeGreaterThan(20);
    expect(agree / moving).toBeGreaterThanOrEqual(0.95);
  });

  it("maps simultaneous pitch + yaw + barrel-roll cleanly into engine ZYX without sub-part shear or plume detachment", () => {
    for (const pitch of [-0.32, 0, 0.28]) {
      for (const yaw of [-Math.PI * 0.85, -Math.PI * 0.5, -0.24, 0, 0.35, Math.PI * 0.5, Math.PI]) {
        for (const roll of [0, 0.1, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
          const body = bodyMatrixFromYXZ(pitch, yaw, roll);
          const [rx, ry, rz] = eulerZYXFromYXZ(pitch, yaw, roll);
          const engineMat = mat3FromEngineZYX(rx, ry, rz);
          for (let k = 0; k < 9; k += 1) {
            expect(engineMat[k]!).toBeCloseTo(body[k]!, 5);
          }

          // Rear plume cone (+Y local) must point strictly along body +Z (rear exhaust) even at 90-deg barrel roll
          const [prx, pry, prz] = eulerZYXFromMat3(mulMat3(body, HERO_PLUME_LOCAL_MATS.rear), yaw);
          const plumeMat = mat3FromEngineZYX(prx, pry, prz);
          const plumePlusY: [number, number, number] = [plumeMat[1]!, plumeMat[4]!, plumeMat[7]!];
          const bodyPlusZ = rotateOffsetByMat3([0, 0, 0], body, [0, 0, 1]);
          expect(plumePlusY[0]).toBeCloseTo(bodyPlusZ[0], 5);
          expect(plumePlusY[1]).toBeCloseTo(bodyPlusZ[1], 5);
          expect(plumePlusY[2]).toBeCloseTo(bodyPlusZ[2], 5);
        }
      }
    }
  });
});
