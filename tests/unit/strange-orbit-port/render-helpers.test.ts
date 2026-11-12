import { describe, expect, it } from "vitest";
import { applyMat3, basisMatrix, basisToEulerZYX, eulerZYXToMatrix, matrixToEulerZYX, multiplyMat3, axisRotation } from "../../../examples/strange-orbit-port/orient";
import { PALETTE_STOPS, hexLinear, paintOriginalAt, pigmentsAt } from "../../../examples/strange-orbit-port/palette";
import { Vec3 } from "../../../examples/strange-orbit-port/vec3";
import { routeFrame } from "../../../examples/strange-orbit-port/track";
import { computeRiderPartWorldOffset, riderRig } from "../../../examples/strange-orbit-port/world";
import {
  buildBikeWheelNode,
  buildHoverBikeChassisNode,
  buildSpacesuitRiderNode,
  buildThrusterPodNode
} from "../../../examples/strange-orbit-port/art/proceduralModels";

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
      const [x, y, z] = ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const satisfies readonly Triple[]).map((v) => rotate(v));
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

describe("motorcycle rigid assembly & wheel spin kinematics", () => {
  it("keeps every motorcycle sub-part rigidly locked together across ramps, jumps, and mid-air rolls", () => {
    const rig = riderRig(0, "bike", "gouache");
    const scale = 1.15;

    // Reference pairwise distances at rest on flat track (extraPitch = 0, extraRoll = 0)
    const f0 = routeFrame(105, "main");
    const base0 = basisMatrix(f0.tangent, f0.up, f0.side);
    const pos0 = rig.parts.map((part) => {
      const [ox, oy, oz] = computeRiderPartWorldOffset(base0, part.offset, scale);
      // At extraPitch = 0, extraRoll = 0, matches un-pitched track basis exactly!
      const want = f0.tangent.clone()
        .multiplyScalar(part.offset[0] * scale)
        .addScaledVector(f0.up, part.offset[1] * scale)
        .addScaledVector(f0.side, part.offset[2] * scale);
      expectNumbersClose([ox, oy, oz], [want.x, want.y, want.z], 11);
      return [f0.p.x + ox, f0.p.y + oy, f0.p.z + oz] as const;
    });

    const pairwiseDist = (pts: readonly (readonly [number, number, number])[], i: number, j: number): number =>
      Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1], pts[i]![2] - pts[j]![2]);

    for (const s of [0, 105, 420, 1050, 1380]) {
      const f = routeFrame(s, "main");
      for (const pitch of [-0.28, -0.14, 0, 0.22, 0.34]) {
        for (const roll of [-0.42, -0.22, 0, 0.22, 0.45]) {
          let base = basisMatrix(f.tangent, f.up, f.side);
          if (pitch) base = multiplyMat3(base, axisRotation("z", pitch));
          if (roll) base = multiplyMat3(base, axisRotation("x", roll));
          const pts = rig.parts.map((part) => {
            const [ox, oy, oz] = computeRiderPartWorldOffset(base, part.offset, scale);
            return [f.p.x + ox, f.p.y + oy, f.p.z + oz] as const;
          });
          for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
              expect(pairwiseDist(pts, i, j)).toBeCloseTo(pairwiseDist(pos0, i, j), 10);
            }
          }
        }
      }
    }
  });

  it("spins front and rear wheels forward around a rock-steady lateral axle without wobble", () => {
    const rig = riderRig(0, "bike", "gouache");
    const wheelF = rig.parts.find((p) => p.kind === "wheelF")!;
    for (const s of [0, 260, 780, 1240]) {
      const f = routeFrame(s, "main");
      const base = multiplyMat3(
        multiplyMat3(basisMatrix(f.tangent, f.up, f.side), axisRotation("z", 0.24)),
        axisRotation("x", -0.19)
      );
      const expectedAxle = applyMat3(base, [0, 0, 1]);
      for (let k = 0; k < 16; k++) {
        const spin = (k / 16) * Math.PI * 2;
        const local = multiplyMat3(wheelF.local, axisRotation("y", -spin));
        const worldMat = eulerZYXToMatrix(matrixToEulerZYX(multiplyMat3(base, local)));
        const actualAxle = applyMat3(worldMat, [0, 1, 0]);
        expectNumbersClose(actualAxle, expectedAxle, 10);
      }
      // Small positive spin moves the top of the tire (wheel local -Z -> rig +Y) forward along pitched +X!
      const smallSpinLocal = multiplyMat3(wheelF.local, axisRotation("y", -0.25));
      const tireTopRig = applyMat3(smallSpinLocal, [0, 0, -1]);
      expect(tireTopRig[0]).toBeGreaterThan(0.24);
      expect(tireTopRig[1]).toBeGreaterThan(0.95);
      expect(Math.abs(tireTopRig[2])).toBeLessThan(1e-12);
    }

    // Exported Lunar GP procedural builders construct valid nodes cleanly
    expect(buildHoverBikeChassisNode({
      id: "test-bike",
      vehicle: "bike",
      primaryColor: "#1d5fd6",
      accentColor: "#d86a43",
      suitColor: "#181d27",
      isHero: true,
      castShadow: true,
      look: "gouache"
    })).toBeDefined();
    expect(buildBikeWheelNode({ id: "test-wheel", vehicle: "bike", isHero: true })).toBeDefined();
    expect(buildThrusterPodNode({ id: "test-nozzle", isHero: true })).toBeDefined();
    expect(buildSpacesuitRiderNode({
      id: "test-torso",
      part: "torso",
      vehicle: "bike",
      liveryColor: "#1d5fd6",
      accentColor: "#d86a43",
      suitColor: "#181d27",
      isHero: true
    })).toBeDefined();
  });
});
