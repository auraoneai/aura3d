import { describe, expect, it } from "vitest";
import { basisMatrix, basisToEulerZYX, eulerZYXToMatrix, matrixToEulerZYX, multiplyMat3, axisRotation } from "../../../examples/strange-orbit-port/orient";
import { PALETTE_STOPS, hexLinear, paintOriginalAt, pigmentsAt } from "../../../examples/strange-orbit-port/palette";
import { Vec3 } from "../../../examples/strange-orbit-port/vec3";
import { routeFrame } from "../../../examples/strange-orbit-port/track";

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0xffffffff; };
}

type Triple = readonly [number, number, number];

// Apply the elementary rotations directly to a vector, in X, Y, Z order.
// This gives the expected basis without using the matrix functions under test.
function rotatedVector([vx, vy, vz]: Triple, [x, y, z]: Triple): Vec3 {
  const afterX: Triple = [vx, Math.cos(x) * vy - Math.sin(x) * vz, Math.sin(x) * vy + Math.cos(x) * vz];
  const afterY: Triple = [Math.cos(y) * afterX[0] + Math.sin(y) * afterX[2], afterX[1], -Math.sin(y) * afterX[0] + Math.cos(y) * afterX[2]];
  return new Vec3(Math.cos(z) * afterY[0] - Math.sin(z) * afterY[1], Math.sin(z) * afterY[0] + Math.cos(z) * afterY[1], afterY[2]);
}

function basisForAngles(angles: Triple): [Vec3, Vec3, Vec3] {
  return [rotatedVector([1, 0, 0], angles), rotatedVector([0, 1, 0], angles), rotatedVector([0, 0, 1], angles)];
}

function expectNumbersClose(actual: ArrayLike<number>, expected: ArrayLike<number>, precision = 11): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) expect(actual[i]).toBeCloseTo(expected[i]!, precision);
}

describe("orientation helpers", () => {
  it("extracts independently chosen ZYX Euler angles from rotated basis vectors", () => {
    const rand = rng(7);
    for (let i = 0; i < 300; i++) {
      // Keep pitch inside the unique, non-singular Euler range.
      const angles: Triple = [(rand() * 2 - 1) * Math.PI, (rand() * 2 - 1) * 1.4, (rand() * 2 - 1) * Math.PI];
      const basis = basisForAngles(angles);
      expectNumbersClose(basisToEulerZYX(...basis), angles);
      const [bx, by, bz] = basis;
      expectNumbersClose(eulerZYXToMatrix(angles), [bx.x, by.x, bz.x, bx.y, by.y, bz.y, bx.z, by.z, bz.z]);
    }
  });

  it("reproduces arbitrary axis-angle bases", () => {
    const rand = rng(19);
    for (let i = 0; i < 300; i++) {
      const raw: Triple = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
      const len = Math.hypot(...raw);
      const [ax, ay, az] = raw.map((n) => n / len) as [number, number, number];
      const angle = rand() * 2 * Math.PI, c = Math.cos(angle), s = Math.sin(angle);
      // Rodrigues' formula rotates each coordinate axis around the sampled axis.
      const rotate = ([x, y, z]: Triple): Vec3 => {
        const dot = ax * x + ay * y + az * z;
        return new Vec3(
          x * c + (ay * z - az * y) * s + ax * dot * (1 - c),
          y * c + (az * x - ax * z) * s + ay * dot * (1 - c),
          z * c + (ax * y - ay * x) * s + az * dot * (1 - c)
        );
      };
      const [x, y, z] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v) => rotate(v as Triple));
      const expected = [x!.x, y!.x, z!.x, x!.y, y!.y, z!.y, x!.z, y!.z, z!.z];
      expectNumbersClose(eulerZYXToMatrix(basisToEulerZYX(x!, y!, z!)), expected, 9);
    }
  });

  it("handles both gimbal-lock directions and real track frames", () => {
    for (const pitch of [Math.PI / 2, -Math.PI / 2]) {
      const basis = basisForAngles([0.4, pitch, 0.7]);
      const euler = basisToEulerZYX(...basis);
      expectNumbersClose(euler, [0, pitch, pitch > 0 ? 0.3 : 1.1]);
      const [x, y, z] = basis;
      expectNumbersClose(eulerZYXToMatrix(euler), [x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z]);
    }
    for (const s of [0, 250, 700, 1200]) {
      const f = routeFrame(s, "main");
      const back = eulerZYXToMatrix(basisToEulerZYX(f.tangent, f.up, f.side));
      const want = basisMatrix(f.tangent, f.up, f.side);
      expectNumbersClose(back, want, 9);
    }
  });

  it("matrix products compose in order", () => {
    const m = multiplyMat3(axisRotation("z", 0.3), axisRotation("x", 0.2));
    const [x, y, z] = matrixToEulerZYX(m);
    expectNumbersClose([x, y, z], [0.2, 0, 0.3]);
    const quarterTurn = multiplyMat3(axisRotation("z", Math.PI / 2), axisRotation("x", Math.PI / 2));
    expectNumbersClose(quarterTurn, [0, 0, 1, 1, 0, 0, 0, 1, 0]);
  });
});

// IEC sRGB transfer values, including 8-bit samples on each side of the linear toe.
const WARM = [
  [0.6938717612919899, 0.23074004852434915, 0.12743768043564743],
  [0.02217388479338738, 0.07618538148130785, 0.08437621154414882],
  [0.8962693533742664, 0.7230551289219693, 0.4286904966139066]
] as const;
const VIOLET = [
  [0.23074004852434915, 0.1651321945016676, 0.45078578283822346],
  [0.021219010376003555, 0.03189603307301153, 0.10461648409110419],
  [0.5775804404296506, 0.6307571363461468, 0.8631572134541023]
] as const;

describe("pigment palette", () => {
  it("converts sRGB hex channels to linear light", () => {
    const cases = [
      ["#d98464", WARM[0]], ["#294e52", WARM[1]], ["#f3ddaf", WARM[2]], ["#8471b3", VIOLET[0]],
      ["#000a0b", [0, 0.003035269835488375, 0.003346535763899161]], ["#ffffff", [1, 1, 1]]
    ] as const;
    for (const [hex, expected] of cases) expectNumbersClose(hexLinear(hex), expected, 12);
  });

  it("blends neighbouring palettes with a smoothstep, wraps, and tracks the warm weight", () => {
    expect(PALETTE_STOPS[0]![0]).toBe(0);
    for (const [distance, blend] of [[275, 0], [286.25, 0.15625], [297.5, 0.5], [320, 1]] as const) {
      const pigments = pigmentsAt(distance);
      for (let i = 0; i < 3; i++) {
        expectNumbersClose(pigments[i]!, WARM[i]!.map((channel, k) => channel * (1 - blend) + VIOLET[i]![k]! * blend), 12);
      }
      expect(paintOriginalAt(distance)).toBeCloseTo(1 - blend, 12);
    }
    expect(pigmentsAt(1450 + 100)).toEqual(pigmentsAt(100));
    expect(pigmentsAt(-100)).toEqual(pigmentsAt(1350));
    expect(paintOriginalAt(100)).toBe(1);
    expect(paintOriginalAt(400)).toBe(0);
  });
});
