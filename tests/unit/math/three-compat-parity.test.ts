import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as immutable from "../../../packages/math/src/index";
import * as three from "../../../packages/math/src/three/index";
import { mathMethodCases, ser } from "../../fixtures/migrate-three/cases.math.mjs";

// PRD beat-three.js part 2, WP-2: `@aura3d/math/three` is a mutable, three-compatible math layer. Every public
// method and accessor of Vector2/3/4, Matrix3/4, Quaternion, Euler, Color, Box3, Sphere, Plane, Ray, Frustum and
// Triangle has a case in tests/fixtures/migrate-three/cases.math.mjs. The goldens were produced by running that
// same source against real three@0.185.1 (generate.mjs); this test runs it against the compat classes and
// requires the same results (return-`this` identity, receiver state, returned values, out-parameters, errors).

const repo = resolve(__dirname, "../../..");
const goldens = JSON.parse(readFileSync(resolve(repo, "tests/fixtures/migrate-three/goldens.json"), "utf8")) as {
  readonly three: string;
  readonly mathMembers: Readonly<Record<string, { readonly instance: readonly string[]; readonly statics: readonly string[] }>>;
  readonly values: Readonly<Record<string, readonly number[]>>;
};

type Case = (lib: unknown) => readonly number[];
const cases = mathMethodCases as unknown as Record<string, Case>;
const lib = three as unknown as Record<string, unknown>;

// The compat layer repeats three's operations in three's order, so results are bit-identical in practice; the tolerance only
// absorbs platform differences in Math.sin/cos/pow. It is far tighter than the fidelity fixtures' 1e-5 so that a wrong
// sign or constant in a small-magnitude term (a projection matrix entry of 1e-3, say) cannot hide inside it.
const PARITY_TOLERANCE = 1e-11;
const closeTo = (a: number, b: number): boolean => Math.abs(a - b) <= PARITY_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));

const firstDivergence = (actual: readonly number[], golden: readonly number[]): string | undefined => {
  if (actual.length !== golden.length) return `length ${actual.length} vs three ${golden.length}`;
  for (let i = 0; i < golden.length; i += 1) {
    if (!closeTo(actual[i]!, golden[i]!)) return `value[${i}] ${actual[i]} vs three ${golden[i]}`;
  }
  return undefined;
};

const CLASSES = ["Vector2", "Vector3", "Vector4", "Matrix3", "Matrix4", "Quaternion", "Euler", "Color", "Box3", "Sphere", "Plane", "Ray", "Frustum", "Triangle"] as const;

let warn: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  // three (and the compat layer) log deprecations and bad-input warnings; the cases exercise those paths on purpose.
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterAll(() => warn.mockRestore());

describe("three-compat math: goldens come from the pinned three.js", () => {
  it("were generated from three 0.185.1", () => {
    expect(goldens.three).toBe("0.185.1");
  });

  it("package.json exposes the ./three subpath", () => {
    const manifest = JSON.parse(readFileSync(resolve(repo, "packages/math/package.json"), "utf8")) as { exports: Record<string, unknown> };
    expect(manifest.exports["./three"]).toEqual({ types: "./dist/three/index.d.ts", import: "./dist/three/index.js" });
    expect(manifest.exports["."]).toEqual({ types: "./dist/index.d.ts", import: "./dist/index.js" });
  });
});

describe("three-compat math: every member of every class has a case and the compat class has the member", () => {
  const caseFor = (cls: string, member: string, isStatic: boolean): string | undefined => {
    const candidates = isStatic ? [`${cls}#${member}`, `${cls}#${member}_static`] : [`${cls}#${member}`, `${cls}#accessors`];
    return candidates.find((key) => key in cases && key in goldens.values);
  };

  for (const cls of CLASSES) {
    it(`${cls}: instance members`, () => {
      const members = goldens.mathMembers[cls]!;
      const proto = (lib[cls] as { prototype: object }).prototype;
      const ownNames = new Set(Object.getOwnPropertyNames(proto));
      const missingCase = members.instance.filter((member) => !caseFor(cls, member, false));
      const missingMember = members.instance.filter((member) => !ownNames.has(member));
      expect({ missingCase, missingMember }).toEqual({ missingCase: [], missingMember: [] });
    });

    it(`${cls}: static members`, () => {
      const members = goldens.mathMembers[cls]!;
      const ctor = lib[cls] as object;
      const missingCase = members.statics.filter((member) => !caseFor(cls, member, true));
      const missingMember = members.statics.filter((member) => !(member in ctor));
      expect({ missingCase, missingMember }).toEqual({ missingCase: [], missingMember: [] });
    });
  }
});

describe("three-compat math: method-level parity with three@0.185.1", () => {
  const keys = Object.keys(goldens.values).filter((key) => /^[A-Za-z0-9]+#/.test(key) && key in cases);

  it("covers a large golden set", () => {
    expect(keys.length).toBeGreaterThan(450);
  });

  for (const cls of CLASSES) {
    describe(cls, () => {
      for (const key of keys.filter((k) => k.startsWith(`${cls}#`))) {
        it(key, () => {
          const actual = cases[key]!(lib);
          expect(firstDivergence(actual, goldens.values[key]!)).toBeUndefined();
        });
      }
    });
  }

  it("covers ColorManagement through the Color case set", () => {
    const key = "Color#ColorManagement";
    expect(firstDivergence(cases[key]!(lib), goldens.values[key]!)).toBeUndefined();
  });
});

describe("three-compat math: edge cases", () => {
  const { Vector3, Vector2, Vector4, Matrix4, Matrix3, Quaternion, Euler, Color, Box3, Sphere, Plane, Ray } = three;

  it("modifiers mutate the receiver and return it", () => {
    const v = new Vector3(1, 2, 3);
    const w = new Vector3(1, 1, 1);
    expect(v.add(w)).toBe(v);
    expect(v.toArray()).toEqual([2, 3, 4]);
    expect(v.multiplyScalar(2)).toBe(v);
    expect(v.toArray()).toEqual([4, 6, 8]);
    const unit = new Vector3(3, 0, 4).normalize();
    expect(unit.x).toBeCloseTo(0.6, 12);
    expect(unit.z).toBeCloseTo(0.8, 12);
  });

  it("aliasing: a.add(a), a.sub(a), a.cross(a), m.multiply(m)", () => {
    const a = new Vector3(1, 2, 3);
    expect(a.add(a).toArray()).toEqual([2, 4, 6]);
    expect(a.sub(a).toArray()).toEqual([0, 0, 0]);
    const c = new Vector3(1, 2, 3);
    expect(c.cross(c).toArray()).toEqual([0, 0, 0]);
    const m = new Matrix4().makeRotationY(0.5).setPosition(1, 2, 3);
    const squared = m.clone().multiplyMatrices(m, m);
    expect(m.multiply(m).equals(squared)).toBe(true);
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.5);
    const q2 = q.clone().multiplyQuaternions(q, q);
    expect(q.multiply(q).equals(q2)).toBe(true);
    const s = new Sphere(new Vector3(1, 2, 3), 2);
    expect(s.union(s).radius).toBe(2);
    const b = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
    expect(b.union(b).max.toArray()).toEqual([1, 1, 1]);
    expect(b.intersect(b).min.toArray()).toEqual([0, 0, 0]);
  });

  it("target out-parameters are filled and returned", () => {
    const box = new Box3(new Vector3(-1, -2, -3), new Vector3(3, 2, 1));
    const center = new Vector3(9, 9, 9);
    expect(box.getCenter(center)).toBe(center);
    expect(center.toArray()).toEqual([1, 0, -1]);
    const size = new Vector3();
    expect(box.getSize(size)).toBe(size);
    expect(size.toArray()).toEqual([4, 4, 4]);
    const sphere = new Sphere();
    expect(box.getBoundingSphere(sphere)).toBe(sphere);
    expect(sphere.radius).toBeCloseTo(Math.sqrt(48) / 2, 12);
    const hit = new Vector3();
    expect(new Ray(new Vector3(0, 5, 0), new Vector3(0, -1, 0)).intersectPlane(new Plane(new Vector3(0, 1, 0), 0), hit)).toBe(hit);
    expect(hit.toArray()).toEqual([0, 0, 0]);
    // three returns null (not undefined) on a miss and leaves the target alone
    const untouched = new Vector3(7, 7, 7);
    expect(new Ray(new Vector3(0, 5, 0), new Vector3(0, 1, 0)).intersectPlane(new Plane(new Vector3(0, 1, 0), 0), untouched)).toBeNull();
    expect(untouched.toArray()).toEqual([7, 7, 7]);
    const hsl = { h: 0, s: 0, l: 0 };
    expect(new Color(1, 0, 0).getHSL(hsl)).toBe(hsl);
    expect(hsl).toEqual({ h: 0, s: 1, l: 0.5 });
  });

  it("NaN propagates through arithmetic the way it does in three", () => {
    const v = new Vector3(Number.NaN, 1, 2).add(new Vector3(1, 1, 1));
    expect(Number.isNaN(v.x)).toBe(true);
    expect(v.y).toBe(2);
    expect(Number.isNaN(new Vector3(Number.NaN, 0, 0).length())).toBe(true);
    // normalize() of a zero vector divides by (length || 1): stays zero, no NaN
    expect(new Vector3(0, 0, 0).normalize().toArray()).toEqual([0, 0, 0]);
    expect(Number.isNaN(new Vector3(1, 1, 1).divideScalar(0).x)).toBe(false);
    expect(new Vector3(1, 1, 1).divideScalar(0).x).toBe(Infinity);
    const m = new Matrix4().set(Number.NaN, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    expect(Number.isNaN(m.determinant())).toBe(true);
    // a singular matrix inverts to all zeros (three r185), not NaN
    expect(new Matrix4().set(1, 2, 3, 4, 2, 4, 6, 8, 0, 0, 1, 0, 0, 0, 0, 1).invert().elements.every((e) => e === 0)).toBe(true);
    expect(new Matrix3().set(1, 2, 3, 2, 4, 6, 0, 0, 1).invert().elements.every((e) => e === 0)).toBe(true);
    expect(Number.isNaN(new Quaternion(Number.NaN, 0, 0, 1).length())).toBe(true);
    expect(new Quaternion(0, 0, 0, 0).normalize().toArray()).toEqual([0, 0, 0, 1]);
  });

  it("clone() makes an independent copy; copy() returns the receiver and copies by value", () => {
    const originals = [new Vector2(1, 2), new Vector3(1, 2, 3), new Vector4(1, 2, 3, 4), new Quaternion(0.1, 0.2, 0.3, 0.9), new Euler(1, 2, 3, "ZYX"), new Color(0.1, 0.2, 0.3)];
    for (const original of originals) {
      const clone = (original as { clone(): unknown }).clone();
      expect(clone).not.toBe(original);
      expect(clone).toBeInstanceOf(original.constructor);
      expect(ser(clone)).toEqual(ser(original));
      const target = new (original.constructor as new () => typeof original)();
      expect((target as unknown as { copy(o: unknown): unknown }).copy(original)).toBe(target);
      expect(ser(target)).toEqual(ser(original));
    }
    const m = new Matrix4().makeRotationX(0.3);
    expect(m.clone()).not.toBe(m);
    expect(m.clone().elements).not.toBe(m.elements);
    expect(m.clone().equals(m)).toBe(true);
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
    const boxCopy = new Box3().copy(box);
    box.min.x = -5;
    expect(boxCopy.min.x).toBe(0);
    const sphereClone = new Sphere(new Vector3(1, 2, 3), 2).clone();
    expect(sphereClone.center.toArray()).toEqual([1, 2, 3]);
  });

  it("quaternion and euler change callbacks fire on every mutation path", () => {
    const q = new Quaternion();
    const euler = new Euler();
    let calls = 0;
    q._onChange(() => { calls += 1; });
    euler._onChange(() => { calls += 1; });
    q.x = 0.5;
    q.setFromAxisAngle(new Vector3(0, 1, 0), 1);
    euler.x = 1;
    euler.order = "ZYX";
    euler.setFromQuaternion(q);
    expect(calls).toBe(5);
  });

  it("deprecated Matrix3.scale/rotate/translate keep r185 premultiply semantics", () => {
    const a = new Matrix3().translate(1, 2).scale(2, 3);
    const expected = new Matrix3().makeScale(2, 3).multiply(new Matrix3().makeTranslation(1, 2));
    expect(a.equals(expected)).toBe(true);
  });
});

describe("three-compat math: crossing into @aura3d/math", () => {
  const { Vector2, Vector3, Vector4, Matrix3, Matrix4, Quaternion, Euler, Color, Box3, Sphere, Plane, Ray, Frustum } = three;

  it("Vector2/3/4 round-trip through the immutable classes", () => {
    expect(new Vector2().fromImmutable(new immutable.Vector2(1, 2)).toImmutable()).toEqual(new immutable.Vector2(1, 2));
    expect(new Vector3().fromImmutable(new immutable.Vector3(1, 2, 3)).toImmutable()).toEqual(new immutable.Vector3(1, 2, 3));
    expect(new Vector4().fromImmutable(new immutable.Vector4(1, 2, 3, 4)).toImmutable()).toEqual(new immutable.Vector4(1, 2, 3, 4));
    const v = new Vector3();
    expect(v.fromImmutable(new immutable.Vector3(1, 2, 3))).toBe(v);
  });

  it("Matrix3/4 and Quaternion round-trip", () => {
    const mat = new Matrix4().makeRotationAxis(new Vector3(1, 1, 0).normalize(), 0.7).setPosition(1, 2, 3);
    expect(Array.from(new Matrix4().fromImmutable(mat.toImmutable()).elements)).toEqual(Array.from(mat.elements));
    expect(new Matrix4().makeScale(2, 2, 2).fromImmutable(new immutable.Matrix4()).equals(new Matrix4())).toBe(true);
    const mat3 = new Matrix3().set(2, 0.5, 0, -1, 3, 0.25, 0.1, 0, 1.5);
    expect(Array.from(new Matrix3().fromImmutable(mat3.toImmutable()).elements)).toEqual(Array.from(mat3.elements));
    const q = new Quaternion(0.1, 0.2, 0.3, 0.9);
    expect(new Quaternion().fromImmutable(q.toImmutable()).equals(q)).toBe(true);
    expect(q.toImmutable()).toBeInstanceOf(immutable.Quaternion);
  });

  it("Euler, Color, Box3, Sphere, Plane, Ray, Frustum round-trip", () => {
    const e = new Euler(0.1, 0.2, 0.3, "ZYX");
    expect(new Euler().fromImmutable(e.toImmutable()).equals(e)).toBe(true);
    const c = new Color(0.1, 0.2, 0.3);
    expect(new Color().fromImmutable(c.toImmutable()).equals(c)).toBe(true);
    const b = new Box3(new Vector3(-1, -2, -3), new Vector3(4, 5, 6));
    expect(new Box3().fromImmutable(b.toImmutable()).equals(b)).toBe(true);
    const s = new Sphere(new Vector3(1, 2, 3), 2);
    expect(new Sphere().fromImmutable(s.toImmutable()).equals(s)).toBe(true);
    const p = new Plane(new Vector3(0, 1, 0), -2);
    expect(new Plane().fromImmutable(p.toImmutable()).equals(p)).toBe(true);
    const r = new Ray(new Vector3(1, 2, 3), new Vector3(0, 1, 0));
    expect(new Ray().fromImmutable(r.toImmutable()).equals(r)).toBe(true);
    const f = new Frustum().setFromProjectionMatrix(new Matrix4().makePerspective(-1, 1, 1, -1, 0.1, 100));
    const roundTrip = new Frustum().fromImmutable(f.toImmutable());
    expect(roundTrip.containsPoint(new Vector3(0, 0, -5))).toBe(f.containsPoint(new Vector3(0, 0, -5)));
    expect(roundTrip.containsPoint(new Vector3(0, 0, 5))).toBe(f.containsPoint(new Vector3(0, 0, 5)));
  });

  it("compat classes accept immutable operands wherever three takes the same shape", () => {
    const sum = new Vector3(1, 1, 1).add(new immutable.Vector3(1, 2, 3));
    expect(sum.toArray()).toEqual([2, 3, 4]);
    const m = new Matrix4().makeTranslation(new immutable.Vector3(4, 5, 6));
    expect(m.elements.slice(12, 15)).toEqual([4, 5, 6]);
    expect(new Vector3(1, 0, 0).applyMatrix4(new immutable.Matrix4()).toArray()).toEqual([1, 0, 0]);
  });
});

describe("existing immutable @aura3d/math classes are unchanged", () => {
  it("methods return new instances and never mutate their receiver", () => {
    const v = new immutable.Vector3(1, 2, 3);
    const sum = v.add(new immutable.Vector3(1, 1, 1));
    expect(sum).not.toBe(v);
    expect(v).toEqual(new immutable.Vector3(1, 2, 3));
    expect(sum).toEqual(new immutable.Vector3(2, 3, 4));
    const m = immutable.Matrix4.identity();
    expect(m.multiply(immutable.Matrix4.identity())).not.toBe(m);
    const q = new immutable.Quaternion(0, 0, 0, 1);
    expect(q.multiply(q)).not.toBe(q);
  });

  it("the main entry does not re-export the compat classes", () => {
    expect(immutable.Vector3).not.toBe(three.Vector3);
    expect(immutable.Matrix4).not.toBe(three.Matrix4);
    expect((immutable.Vector3.prototype as unknown as Record<string, unknown>).isVector3).toBeUndefined();
    expect(Object.isFrozen(immutable.Vector3.zero)).toBe(true);
  });

  it("statement-form three code still does nothing on the immutable classes (documented divergence)", async () => {
    const { cases } = (await import("../../fixtures/migrate-three/cases.mjs")) as { cases: Record<string, Case> };
    const golden = goldens.values.MutationSemantics!;
    expect(firstDivergence((cases.MutationSemantics as Case)(immutable), golden)).toMatch(/value\[0\]/);
    expect(firstDivergence((cases.MutationSemantics as Case)(three), golden)).toBeUndefined();
  });
});
