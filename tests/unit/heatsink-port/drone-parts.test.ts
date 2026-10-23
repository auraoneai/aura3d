import { describe, expect, it } from "vitest";
import { axisRotation, droneEuler, matrixToEulerZYX, multiplyMat3, type Mat3 } from "../../../examples/heatsink-port/orient";

/** the engine composes a node's rotation as Rz * Ry * Rx (see orient.ts); this is what `setRotation(e)` produces */
const fromEuler = (e: readonly [number, number, number]): Mat3 => multiplyMat3(multiplyMat3(axisRotation("z", e[2]), axisRotation("y", e[1])), axisRotation("x", e[0]));
const close = (a: Mat3, b: Mat3, tol = 1e-9): void => { for (let i = 0; i < 9; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(tol); };

describe("drone part orientation (R x local rotation -> engine Euler angles)", () => {
  const frame = { tx: 0.6, tz: 0.8, rx: -0.8, rz: 0.6 };
  const attitudes: [number, number, number][] = [[0, 0, 0], [0.2, 0.1, -0.3], [-0.5, 0.35, 0.6], [1.0, -0.4, 0.2]];
  const locals: { name: string; m: Mat3 | null }[] = [
    { name: "none", m: null },
    { name: "arm yaw +45deg", m: axisRotation("y", Math.PI / 4) },
    { name: "arm yaw -45deg", m: axisRotation("y", -Math.PI / 4) },
    { name: "thruster roll 90deg about z", m: axisRotation("z", Math.PI / 2) },
    { name: "yaw then roll", m: multiplyMat3(axisRotation("y", 0.4), axisRotation("z", Math.PI / 2)) }
  ];
  for (const [theta, pitch, lean] of attitudes) {
    for (const { name, m } of locals) {
      it(`round-trips for theta=${theta} pitch=${pitch} lean=${lean}, local ${name}`, () => {
        const base = fromEuler(droneEuler(frame, theta, pitch, lean));
        const want = m ? multiplyMat3(base, m) : base;
        close(fromEuler(matrixToEulerZYX(want)), want);
      });
    }
  }

  it("a roll of 90 degrees about local z turns a Y-axis cylinder onto the forward (x) axis", () => {
    const R = fromEuler([0, 0, 0]);
    const M = multiplyMat3(R, axisRotation("z", Math.PI / 2));
    // image of the local Y axis is column 1 of M
    expect(Math.abs(M[1]!)).toBeCloseTo(1, 9);
    expect(Math.abs(M[4]!)).toBeLessThan(1e-9);
  });
});
