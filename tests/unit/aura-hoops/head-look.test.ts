import { describe, expect, it } from "vitest";
import {
  HEAD_PITCH_LIMIT,
  HEAD_TURN_RATE,
  HEAD_TURN_RATE_REDUCED,
  HEAD_YAW_LIMIT,
  headLookAngles,
  headLookQuat,
  qRotate,
  stepHeadLook,
  worldToActor,
  type Quat
} from "../../../apps/showcase-aura-hoops-3d/src/headLook";

const ID: Quat = { x: 0, y: 0, z: 0, w: 1 };
const qYaw = (a: number): Quat => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });

describe("H47-AN1 head look-at", () => {
  it("aims the face at the target: forward of the resulting rotation points at the ball", () => {
    const head: [number, number, number] = [0, 0.7, 0];
    const target: [number, number, number] = [2, 0.2, 3];
    const angles = headLookAngles(head, target, ID);
    const [x, y, z, w] = headLookQuat(angles);
    const fwd = qRotate({ x, y, z, w }, [0, 0, 1]);
    const d = [target[0] - head[0], target[1] - head[1], target[2] - head[2]];
    const len = Math.hypot(d[0]!, d[1]!, d[2]!);
    const dot = (fwd[0] * d[0]! + fwd[1] * d[1]! + fwd[2] * d[2]!) / len;
    expect(dot).toBeGreaterThan(0.999);
    expect(angles.pitch).toBeGreaterThan(0); // the ball is below the head: look down
  });

  it("works in the parent bone's frame (a chest already turned toward the ball needs no head yaw)", () => {
    const parent = qYaw(Math.PI / 4);
    const angles = headLookAngles([0, 0, 0], [1, 0, 1], parent);
    expect(Math.abs(angles.yaw)).toBeLessThan(1e-9);
  });

  it("clamps yaw and pitch to the neck limits for a ball behind or overhead", () => {
    expect(headLookAngles([0, 0, 0], [0.1, 0, -3], ID).yaw).toBe(HEAD_YAW_LIMIT);
    expect(headLookAngles([0, 0, 0], [0, 5, 0.1], ID).pitch).toBe(-HEAD_PITCH_LIMIT);
  });

  it("maps a world point into the actor frame the route's palm code uses", () => {
    const yaw = 0.7;
    const local: [number, number, number] = [0.3, 0.4, 0.5];
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const world: [number, number, number] = [2 + c * local[0] + s * local[2], 0.96 + 0.1 + local[1], -1 - s * local[0] + c * local[2]];
    const back = worldToActor(world, 2, 0.1, -1, yaw);
    back.forEach((v, i) => expect(v).toBeCloseTo(local[i]!, 9));
  });

  it("turns at most the turn rate per step, and the reduced-motion path turns slower", () => {
    const goal = { yaw: 1, pitch: 0.4 };
    const full = stepHeadLook({ yaw: 0, pitch: 0 }, goal, 0.05, false);
    const calm = stepHeadLook({ yaw: 0, pitch: 0 }, goal, 0.05, true);
    expect(full.yaw).toBeCloseTo(HEAD_TURN_RATE * 0.05, 9);
    expect(calm.yaw).toBeCloseTo(HEAD_TURN_RATE_REDUCED * 0.05, 9);
    expect(calm.yaw).toBeLessThan(full.yaw);
    expect(stepHeadLook({ yaw: 0.98, pitch: 0.4 }, goal, 0.05, false)).toEqual(goal);
  });

  it("is deterministic and draws no randomness", () => {
    const a = headLookAngles([0.1, 0.6, 0], [3, 0.5, 4], qYaw(0.2));
    const b = headLookAngles([0.1, 0.6, 0], [3, 0.5, 4], qYaw(0.2));
    expect(a).toEqual(b);
  });
});
