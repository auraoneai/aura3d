import { describe, expect, it } from "vitest";
import { stepFreeBall, DRAG_K } from "../../../apps/showcase-aura-fc-3d/src/game/ballPhysics";
import { eulerZYXMatrix, integrateQuat, quatMatrix, quatToEulerZYX, type Quat } from "../../../apps/showcase-aura-fc-3d/src/game/ballOrient";
import { BALL_R } from "../../../apps/showcase-aura-fc-3d/src/game/dims";
import type { BallState } from "../../../apps/showcase-aura-fc-3d/src/game/types";

const DT = 1 / 120;
function ball(over: Partial<BallState> = {}): BallState {
  return { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, rotX: 0, rotY: 0, rotZ: 0, quat: [0, 0, 0, 1], spin: 0, rolling: false, mode: "flight", ...over } as BallState;
}
/** kick at `speed` m/s, `deg` above the grass, toward +x */
function launch(speed: number, deg: number, spin = 0): BallState {
  const a = (deg * Math.PI) / 180;
  return ball({ vx: speed * Math.cos(a), vy: speed * Math.sin(a), spin });
}

describe("FC ball: rolling and flight", () => {
  it("a 20 m/s ground pass rolls out in 40-70 m and comes to rest", () => {
    const b = launch(20, 2);
    let t = 0;
    while ((b.vx !== 0 || b.vz !== 0) && t < 30) { stepFreeBall(b, DT); t += DT; }
    console.log("BALL_GROUND_ROLL", JSON.stringify({ restAtM: +b.x.toFixed(1), seconds: +t.toFixed(1) }));
    expect(b.x).toBeGreaterThan(40);
    expect(b.x).toBeLessThan(70);
    expect(b.vx).toBe(0);
  });

  it("a low pass (<=3 degrees) rolls: no hop higher than a ball radius", () => {
    const b = launch(12, 3);
    let apex = 0;
    for (let i = 0; i < 400; i++) { stepFreeBall(b, DT); apex = Math.max(apex, b.y - BALL_R); }
    expect(apex).toBeLessThan(BALL_R);
    expect(b.rolling).toBe(true);
  });

  it("air drag is quadratic: a 25 m/s drive loses more than twice what a 12 m/s one does over the same second", () => {
    const lose = (v: number) => { const b = launch(v, 0); b.y = 5; b.vy = 0; b.vx = v; for (let i = 0; i < 120; i++) { b.vy = 0; b.y = 5; stepFreeBall(b, DT); } return v - b.vx; };
    expect(lose(25)).toBeGreaterThan(lose(12) * 3);
    expect(DRAG_K).toBeGreaterThan(0.005);
    expect(DRAG_K).toBeLessThan(0.02);
  });

  it("a lofted ball: apex and range follow the launch angle and the 45-degree throw goes furthest", () => {
    const run = (deg: number) => {
      const b = launch(18, deg);
      let apex = 0, range = 0;
      for (let i = 0; i < 2400; i++) {
        stepFreeBall(b, DT); apex = Math.max(apex, b.y);
        if (b.y <= BALL_R + 1e-9 && i > 3) { range = b.x; break; }
      }
      return { apex, range };
    };
    const a20 = run(20), a30 = run(30), a45 = run(45), a60 = run(60);
    console.log("BALL_LOFT", JSON.stringify({ a20, a30, a45, a60 }));
    expect(a45.range).toBeGreaterThan(a20.range);
    expect(a45.range).toBeGreaterThan(a60.range);
    expect(a60.apex).toBeGreaterThan(a30.apex);
    expect(a45.range).toBeGreaterThan(18);
    expect(a45.range).toBeLessThan(33); // drag keeps it under the vacuum range (33 m)
  });

  it("each bounce keeps 0.5-0.6 of the vertical speed and the ball settles with no ping-pong", () => {
    const b = ball({ y: 3, vy: 0, vx: 2 });
    const impacts: number[] = [];
    for (let i = 0; i < 1200; i++) { const im = stepFreeBall(b, 1 / 240); if (im > 0) impacts.push(im); }
    console.log("BALL_BOUNCES", JSON.stringify(impacts.map((v) => +v.toFixed(2))));
    expect(impacts.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < impacts.length; i++) expect(impacts[i]! / impacts[i - 1]!).toBeGreaterThan(0.45);
    for (let i = 1; i < impacts.length; i++) expect(impacts[i]! / impacts[i - 1]!).toBeLessThan(0.62);
    expect(b.y).toBeCloseTo(BALL_R, 5);
    expect(b.rolling).toBe(true);
    expect(impacts.length).toBeLessThan(5);
  });

  it("sidespin curls the flight toward the spin side, and the opposite spin curls it the other way", () => {
    const end = (spin: number) => { const b = launch(22, 8, spin); for (let i = 0; i < 360; i++) stepFreeBall(b, DT); return b.z; };
    const left = end(5), right = end(-5), none = end(0);
    console.log("BALL_CURL", JSON.stringify({ left: +left.toFixed(2), none: +none.toFixed(2), right: +right.toFixed(2) }));
    expect(none).toBeCloseTo(0, 6);
    expect(left * right).toBeLessThan(0);
    expect(Math.abs(left)).toBeGreaterThan(0.4);
    expect(Math.abs(left)).toBeLessThan(4);
    expect(left).toBeCloseTo(-right, 1);
  });
});

describe("FC ball: orientation rolls without slipping", () => {
  it("a rolling ball turns v/r about the axis perpendicular to travel, whatever its heading", () => {
    for (const heading of [0, 0.6, 1.9, -2.4]) {
      const b = ball({ rolling: true, mode: "loose", vx: 6 * Math.cos(heading), vz: 6 * Math.sin(heading) });
      const q0: Quat = [...b.quat] as Quat;
      stepFreeBall(b, 1 / 60);
      // angle between q0 and q1 ≈ |ω|·dt with |ω| = v/r
      const dot = Math.abs(q0[0] * b.quat[0] + q0[1] * b.quat[1] + q0[2] * b.quat[2] + q0[3] * b.quat[3]);
      const angle = 2 * Math.acos(Math.min(1, dot));
      expect(angle).toBeCloseTo((6 / BALL_R) * (1 / 60), 2);
    }
  });

  it("the exported ZYX Euler angles rebuild exactly the quaternion's rotation (the engine's Rz·Ry·Rx)", () => {
    let q: Quat = [0, 0, 0, 1];
    const w: Array<[number, number, number]> = [[3, 0.4, -2], [-1, 2, 5], [0.2, -4, 1]];
    for (const [wx, wy, wz] of w) {
      for (let i = 0; i < 90; i++) q = integrateQuat(q, wx, wy, wz, 1 / 60);
      const e = quatToEulerZYX(q);
      const a = eulerZYXMatrix(e[0], e[1], e[2]), m = quatMatrix(q);
      for (let i = 0; i < 9; i++) expect(a[i]!).toBeCloseTo(m[i]!, 5);
    }
  });
});
