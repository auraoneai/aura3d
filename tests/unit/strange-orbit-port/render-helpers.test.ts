import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { basisMatrix, basisToEulerZYX, eulerZYXToMatrix, matrixToEulerZYX, multiplyMat3, axisRotation } from "../../../examples/strange-orbit-port/orient";
import { PALETTE_STOPS, hexLinear, paintOriginalAt, pigmentsAt } from "../../../examples/strange-orbit-port/palette";
import { Vec3 } from "../../../examples/strange-orbit-port/vec3";
import { routeFrame } from "../../../examples/strange-orbit-port/track";

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0xffffffff; };
}

describe("orientation helpers", () => {
  const rand = rng(7);
  const randomBasis = (): [Vec3, Vec3, Vec3] => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), rand() * 6.2);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
    const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
    m.extractBasis(x, y, z);
    return [new Vec3(x.x, x.y, x.z), new Vec3(y.x, y.y, y.z), new Vec3(z.x, z.y, z.z)];
  };

  it("matches three's ZYX Euler extraction", () => {
    for (let i = 0; i < 300; i++) {
      const [x, y, z] = randomBasis();
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(x.x, x.y, x.z), new THREE.Vector3(y.x, y.y, y.z), new THREE.Vector3(z.x, z.y, z.z));
      const e = new THREE.Euler().setFromRotationMatrix(m, "ZYX");
      const mine = basisToEulerZYX(x, y, z);
      expect(mine[0]).toBeCloseTo(e.x, 9);
      expect(mine[1]).toBeCloseTo(e.y, 9);
      expect(mine[2]).toBeCloseTo(e.z, 9);
    }
  });

  it("the engine's Rz·Ry·Rx composition reproduces the basis", () => {
    for (let i = 0; i < 300; i++) {
      const [x, y, z] = randomBasis();
      const expected = basisMatrix(x, y, z);
      const rebuilt = eulerZYXToMatrix(basisToEulerZYX(x, y, z));
      for (let k = 0; k < 9; k++) expect(rebuilt[k]!).toBeCloseTo(expected[k]!, 9);
    }
  });

  it("handles gimbal lock and real track frames", () => {
    const x = new Vec3(0, 0, -1), y = new Vec3(0, 1, 0), z = new Vec3(1, 0, 0);
    const e = basisToEulerZYX(x, y, z);
    const rebuilt = eulerZYXToMatrix(e);
    const expected = basisMatrix(x, y, z);
    for (let k = 0; k < 9; k++) expect(rebuilt[k]!).toBeCloseTo(expected[k]!, 9);
    for (const s of [0, 250, 700, 1200]) {
      const f = routeFrame(s, "main");
      const back = eulerZYXToMatrix(basisToEulerZYX(f.tangent, f.up, f.side));
      const want = basisMatrix(f.tangent, f.up, f.side);
      for (let k = 0; k < 9; k++) expect(back[k]!).toBeCloseTo(want[k]!, 9);
    }
  });

  it("matrix products compose in order", () => {
    const m = multiplyMat3(axisRotation("z", 0.3), axisRotation("x", 0.2));
    const [x, , z] = matrixToEulerZYX(m);
    expect(x).toBeCloseTo(0.2, 12);
    expect(z).toBeCloseTo(0.3, 12);
  });
});

describe("pigment palette", () => {
  it("hex → linear matches three's colour management", () => {
    for (const hex of ["#d98464", "#294e52", "#f3ddaf", "#8471b3"]) {
      const c = new THREE.Color(hex);
      const mine = hexLinear(hex);
      expect(mine[0]).toBeCloseTo(c.r, 9);
      expect(mine[1]).toBeCloseTo(c.g, 9);
      expect(mine[2]).toBeCloseTo(c.b, 9);
    }
  });

  it("blends neighbouring palettes with a smoothstep, wraps, and tracks the warm weight", () => {
    expect(PALETTE_STOPS[0]![0]).toBe(0);
    const warm = pigmentsAt(100);
    const violet = pigmentsAt(400);
    expect(warm[0][0]).toBeGreaterThan(violet[0][0]);
    const mid = pigmentsAt((275 + 320) / 2);
    const a = new THREE.Color("#d98464"), b = new THREE.Color("#8471b3");
    expect(mid[0][0]).toBeCloseTo(a.r + (b.r - a.r) * 0.5, 9);
    expect(pigmentsAt(1450 + 100)).toEqual(pigmentsAt(100));
    expect(paintOriginalAt(100)).toBe(1);
    expect(paintOriginalAt(400)).toBe(0);
    expect(paintOriginalAt(297.5)).toBeCloseTo(0.5, 9);
  });
});
