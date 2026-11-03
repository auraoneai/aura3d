import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { Box3 } from "../../../packages/math/src/Box3";
import { Matrix3 } from "../../../packages/math/src/Matrix3";
import { Matrix4 } from "../../../packages/math/src/Matrix4";
import { OBB } from "../../../packages/math/src/independent/OrientedBox";
import { Plane } from "../../../packages/math/src/Plane";
import { Ray } from "../../../packages/math/src/Ray";
import { Sphere } from "../../../packages/math/src/Sphere";
import { Vector3 } from "../../../packages/math/src/Vector3";

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const rotationZ = (angle: number) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Matrix3().set(c, -s, 0, s, c, 0, 0, 0, 1);
};
const expectPoint = (actual: Vector3 | undefined, expected: Vector3) => {
  expect(actual).toBeDefined();
  expect(actual!.x).toBeCloseTo(expected.x, 10);
  expect(actual!.y).toBeCloseTo(expected.y, 10);
  expect(actual!.z).toBeCloseTo(expected.z, 10);
};

describe("independently authored oriented box", () => {
  it("matches the neutral constructor, readonly fields and all method signatures", () => {
    const contract = JSON.parse(readFileSync(resolve("docs/prds/aura3d-independent-math-api.json"), "utf8"));
    const expected = contract.groups.native.find((unit: { name: string }) => unit.name === "OBB").classes[0];
    const file = resolve("packages/math/src/independent/OrientedBox.ts");
    const program = ts.createProgram([file], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(file)!;
    const module = checker.getSymbolAtLocation(source)!;
    const symbol = checker.getExportsOfModule(module).find((item) => item.name === "OBB")!;
    const instance = checker.getDeclaredTypeOfSymbol(symbol);
    const constructor = checker.getTypeOfSymbolAtLocation(symbol, source);
    const flags = ts.TypeFormatFlags.NoTruncation;
    const constructorSignatures = checker.getSignaturesOfType(constructor, ts.SignatureKind.Construct)
      .map((signature) => checker.signatureToString(signature, source, flags));
    expect(constructorSignatures).toEqual(expected.constructors.map((item: { signature: string }) => item.signature));
    const members: object[] = [];
    for (const property of checker.getPropertiesOfType(instance)) {
      const type = checker.getTypeOfSymbolAtLocation(property, source);
      const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
      if (signatures.length) {
        for (const signature of signatures) members.push({
          kind: "method", name: property.name, static: false,
          signature: checker.signatureToString(signature, source, flags),
        });
      } else {
        const declaration = property.valueDeclaration ?? property.declarations![0];
        members.push({
          kind: "field", name: property.name, static: false,
          readonly: !!(ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Readonly),
          optional: !!(property.flags & ts.SymbolFlags.Optional),
          type: checker.typeToString(type, source, flags),
        });
      }
    }
    for (const property of checker.getPropertiesOfType(constructor)) {
      if (property.name === "prototype") continue;
      const type = checker.getTypeOfSymbolAtLocation(property, source);
      for (const signature of checker.getSignaturesOfType(type, ts.SignatureKind.Call)) members.push({
        kind: "method", name: property.name, static: true,
        signature: checker.signatureToString(signature, source, flags),
      });
    }
    const sort = (values: object[]) => [...values].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(sort(members)).toEqual(sort(expected.members));
  });

  it("constructs immutable values, clones, copies, sets and converts finite AABBs", () => {
    const defaultBox = new OBB();
    expectPoint(defaultBox.center, v(0, 0, 0));
    expectPoint(defaultBox.halfSize, v(0, 0, 0));
    expect(defaultBox.rotation.equals(new Matrix3())).toBe(true);
    expect(defaultBox.containsPoint(v(0, 0, 0))).toBe(true);
    const center = v(1, 2, 3);
    const halfSize = v(2, 3, 4);
    const frame = rotationZ(Math.PI / 2);
    const original = new OBB(center, halfSize, frame);
    expect(original.center).toBe(center);
    expect(original.halfSize).toBe(halfSize);
    expect(original.rotation).toBe(frame);
    expectPoint(original.getSize(), v(4, 6, 8));
    const clone = original.clone();
    expect(clone).not.toBe(original);
    expect(clone.center).not.toBe(original.center);
    expect(clone.rotation).not.toBe(original.rotation);
    expect(clone.equals(original)).toBe(true);
    const changed = original.set(v(4, 5, 6), v(1, 1, 1), new Matrix3());
    expectPoint(original.center, v(1, 2, 3));
    expectPoint(changed.center, v(4, 5, 6));
    expect(changed.copy(original).equals(original)).toBe(true);
    const copy = changed.copy(original);
    expect(copy).not.toBe(original);
    expect(copy.center).not.toBe(original.center);
    expect(copy.halfSize).not.toBe(original.halfSize);
    expect(copy.rotation).not.toBe(original.rotation);
    const close = new OBB(v(1 + 5e-7, 2, 3), halfSize, frame);
    expect(original.equals(close, 1e-6)).toBe(true);
    expect(original.equals(close, 1e-8)).toBe(false);
    const box = OBB.fromBox3(new Box3(v(-2, 1, 0), v(4, 5, 2)));
    expectPoint(box.center, v(1, 3, 1));
    expectPoint(box.halfSize, v(3, 2, 1));
    expect(box.containsPoint(v(-2, 1, 0))).toBe(true);
    expect(box.intersectsBox3(Box3.empty())).toBe(false);
    expect(() => OBB.fromBox3(Box3.empty())).toThrow(RangeError);
    const smallestPoint = OBB.fromBox3(new Box3(v(Number.MIN_VALUE, 0, 0), v(Number.MIN_VALUE, 0, 0)));
    expect(smallestPoint.center.x).toBe(Number.MIN_VALUE);
    expect(smallestPoint.halfSize.x).toBe(0);
    const wide = OBB.fromBox3(new Box3(v(-Number.MAX_VALUE, 0, 0), v(Number.MAX_VALUE, 0, 0)));
    expect(wide.center.x).toBe(0);
    expect(wide.halfSize.x).toBe(Number.MAX_VALUE);
  });

  it("contains and clamps points in a rotated frame", () => {
    const c = Math.SQRT1_2;
    const box = new OBB(v(2, -1, 1), v(2, 1, 0.5), rotationZ(Math.PI / 4));
    // Local (1, 0.25, 0) and (3, 0.25, 0), rotated by 45 degrees.
    const inside = v(2 + 0.75 * c, -1 + 1.25 * c, 1);
    const outside = v(2 + 2.75 * c, -1 + 3.25 * c, 1);
    const nearest = v(2 + 1.75 * c, -1 + 2.25 * c, 1);
    expect(box.containsPoint(inside)).toBe(true);
    expect(box.containsPoint(outside)).toBe(false);
    expectPoint(box.clampPoint(outside), nearest);
    expectPoint(box.clampPoint(inside), inside);
    // A frame within the documented tolerance is orthonormalized before use.
    const approximate = new OBB(v(0, 0, 0), v(1, 1, 1), new Matrix3().set(1, 5e-11, 0, 0, 1, 0, 0, 0, 1));
    const projected = approximate.clampPoint(v(0, 1, 0));
    expect(projected.x).toBeCloseTo(0, 14);
    expect(projected.y).toBeCloseTo(1, 14);
  });

  it("clamps against an independently constructed three-dimensional frame", () => {
    // Its columns are (1,2,2)/3, (2,1,-2)/3 and (-2,2,-1)/3.
    const frame = new Matrix3().set(1 / 3, 2 / 3, -2 / 3, 2 / 3, 1 / 3, 2 / 3, 2 / 3, -2 / 3, -1 / 3);
    const box = new OBB(v(0, 0, 0), v(1, 2, 3), frame);
    const corner = v(-1 / 3, 10 / 3, -5 / 3);
    expect(box.containsPoint(corner)).toBe(true);
    // (0,5,-2) has local coordinates (2,3,4), so each clamps to a face.
    expectPoint(box.clampPoint(v(0, 5, -2)), corner);
    const normal = v(1 / 3, 2 / 3, 2 / 3);
    expect(box.intersectsSphere(new Sphere(normal.multiplyScalar(1.5), 0.5))).toBe(true);
    expect(box.intersectsPlane(new Plane(normal, -1))).toBe(true);
    expect(box.intersectsPlane(new Plane(normal, -1.01))).toBe(false);
  });

  it("handles rotated face, edge and corner tangencies without accepting a gap", () => {
    const diamond = new OBB(v(0, 0, 0), v(1, 1, 1), rotationZ(Math.PI / 4));
    const normal = v(Math.SQRT1_2, Math.SQRT1_2, 0);
    expect(diamond.intersectsSphere(new Sphere(normal.multiplyScalar(1.5), 0.5))).toBe(true);
    expect(diamond.intersectsSphere(new Sphere(normal.multiplyScalar(1.51), 0.5))).toBe(false);
    expect(diamond.intersectsPlane(new Plane(v(2, 0, 0), -2 * Math.SQRT2))).toBe(true);
    expect(diamond.intersectsPlane(new Plane(v(2, 0, 0), -2 * (Math.SQRT2 + 0.01)))).toBe(false);
    const aligned = new OBB(v(0, 0, 0), v(1, 1, 1));
    expect(aligned.intersectsOBB(new OBB(v(2, 2, 2), v(1, 1, 1)), 0)).toBe(true);
    expect(aligned.intersectsOBB(new OBB(v(2.001, 2, 2), v(1, 1, 1)), 0)).toBe(false);
    expect(aligned.intersectsBox3(new Box3(v(1, -0.2, -0.2), v(2, 0.2, 0.2)))).toBe(true);
    const smallGap = new OBB(v(2 + 1e-7, 0, 0), v(1, 1, 1));
    expect(aligned.intersectsOBB(smallGap, 0)).toBe(false);
    expect(aligned.intersectsOBB(smallGap, 2e-7)).toBe(true);
  });

  it("uses Aura plane signed distances for positive and negative constants", () => {
    const rightBox = new OBB(v(2, 0, 0), v(0.5, 1, 1));
    const leftBox = new OBB(v(-2, 0, 0), v(0.5, 1, 1));
    const rightTangent = new Plane(v(2, 0, 0), -3);
    const leftTangent = new Plane(v(2, 0, 0), 3);
    expect(rightTangent.distanceToPoint(rightBox.center)).toBe(0.5);
    expect(leftTangent.distanceToPoint(leftBox.center)).toBe(-0.5);
    expect(rightBox.intersectsPlane(rightTangent)).toBe(true);
    expect(leftBox.intersectsPlane(leftTangent)).toBe(true);
    expect(rightBox.intersectsPlane(new Plane(v(2, 0, 0), -2.98))).toBe(false);
    expect(leftBox.intersectsPlane(new Plane(v(2, 0, 0), 2.98))).toBe(false);
  });

  it("uses edge cross products when all six face axes overlap", () => {
    const root = Math.SQRT1_2;
    const rotation = new Matrix3().set(
      0, root, root,
      root, -0.5, 0.5,
      root, 0.5, -0.5,
    );
    const first = new OBB(v(0, 0, 0), v(1, 1, 1));
    const second = new OBB(v(0, -Math.SQRT2, Math.SQRT2), v(1.5, 0.25, 0.25), rotation);
    // The separating axis is (0, -1, 1)/sqrt(2): center distance 2,
    // radii sqrt(2) and sqrt(2)/4, so their sum is less than 2.
    const axis = v(0, -root, root);
    const separation = second.center.dot(axis);
    const radius = Math.SQRT2 + Math.SQRT2 / 4;
    expect(separation).toBeGreaterThan(radius);
    // Projections on each of the six face normals still overlap.
    expect(Math.SQRT2).toBeLessThan(1 + 1.5 * root + 0.25);
    expect(Math.SQRT2).toBeLessThan(1 + root + 0.25);
    expect(first.intersectsOBB(second, 0)).toBe(false);
    expect(second.intersectsOBB(first, 0)).toBe(false);
  });

  it("intersects forward rays, including interior, tangent and stationary rays", () => {
    const diamond = new OBB(v(0, 0, 0), v(1, 1, 1), rotationZ(Math.PI / 4));
    expectPoint(diamond.intersectRay(new Ray(v(-3, 0, 0), v(1, 0, 0))), v(-Math.SQRT2, 0, 0));
    expectPoint(diamond.intersectRay(new Ray(v(0, 0, 0), v(2, 0, 0))), v(Math.SQRT2, 0, 0));
    expectPoint(diamond.intersectRay(new Ray(v(-3, Math.SQRT2, 0), v(1, 0, 0))), v(0, Math.SQRT2, 0));
    expect(diamond.intersectsRay(new Ray(v(-3, Math.SQRT2 + 0.01, 0), v(1, 0, 0)))).toBe(false);
    expect(diamond.intersectsRay(new Ray(v(-3, 0, 0), v(-1, 0, 0)))).toBe(false);
    // The Ray constructor rejects a zero direction, but JavaScript callers can
    // still supply a structurally shaped stationary ray.
    const stationaryInside = { origin: v(0, 0, 0), direction: v(0, 0, 0) } as Ray;
    const stationaryOutside = { origin: v(3, 0, 0), direction: v(0, 0, 0) } as Ray;
    expectPoint(diamond.intersectRay(stationaryInside), v(0, 0, 0));
    expect(diamond.intersectsRay(stationaryOutside)).toBe(false);
    for (const angle of [0.005048, 0.1, 0.3, 0.9, 1.2, 2.4]) {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const rotated = new OBB(v(0, 0, 0), v(1, 1, 1), rotationZ(angle));
      // Local x = 1 is a face; the ray travels along it from local y = -3.
      const alongFace = new Ray(v(c + 3 * s, s - 3 * c, 0), v(-s, c, 0));
      expectPoint(rotated.intersectRay(alongFace), v(c + s, s - c, 0));
    }
  });

  it("treats zero-size dimensions as closed points, lines and planes", () => {
    const point = new OBB(v(2, 0, 0));
    const line = new OBB(v(0, 0, 0), v(2, 0, 0));
    const plane = new OBB(v(0, 0, 0), v(2, 2, 0));
    expect(line.containsPoint(v(2, 0, 0))).toBe(true);
    expect(line.containsPoint(v(1, 0.01, 0))).toBe(false);
    expect(point.intersectsOBB(line, 0)).toBe(true);
    expect(point.intersectsOBB(new OBB(v(2.01, 0, 0)), 0)).toBe(false);
    expect(line.intersectsOBB(plane, 0)).toBe(true);
    expectPoint(plane.intersectRay(new Ray(v(1, 1, 2), v(0, 0, -1))), v(1, 1, 0));
    expect(plane.intersectsSphere(new Sphere(v(0, 0, 1), 1))).toBe(true);
    expect(plane.intersectsSphere(new Sphere(v(0, 0, 1), -1))).toBe(false);
  });

  it("transforms representable boxes, including reflections and collapsed dimensions", () => {
    const quarterTurn = new Matrix3().set(0, -1, 0, 1, 0, 0, 0, 0, 1);
    const reflected = new OBB(v(0, 0, 0), v(1, 2, 3), new Matrix3().set(-1, 0, 0, 0, 1, 0, 0, 0, 1));
    expect(reflected.containsPoint(v(-1, 2, 3))).toBe(true);
    expect(reflected.applyMatrix4(Matrix4.identity()).equals(reflected)).toBe(true);
    const box = new OBB(v(1, 0, 0), v(1, 2, 3), quarterTurn);
    const transformed = box.applyMatrix4(Matrix4.scaling(v(2, 3, -1)));
    expectPoint(transformed.center, v(2, 0, 0));
    expectPoint(transformed.halfSize, v(3, 4, 3));
    expect(transformed.containsPoint(v(6, 3, 3))).toBe(true);
    expect(transformed.containsPoint(v(6.01, 3, 3))).toBe(false);
    const line = box.applyMatrix4(Matrix4.scaling(v(0, 2, 0)));
    expect(line.containsPoint(v(0, 2, 0))).toBe(true);
    expect(line.containsPoint(v(0, 4.1, 0))).toBe(false);
    const point = box.applyMatrix4(Matrix4.scaling(v(0, 0, 0)));
    expectPoint(point.center, v(0, 0, 0));
    expectPoint(point.halfSize, v(0, 0, 0));
    expect(point.containsPoint(v(0, 0, 0))).toBe(true);
    for (const size of [v(0, 0, 0), v(1, 0, 0), v(1, 2, 0), v(1, 2, 3)]) {
      const rotated = new OBB(v(1, 2, 3), size, rotationZ(0.37));
      expect(rotated.applyMatrix4(Matrix4.identity()).equals(rotated)).toBe(true);
    }
    // Both source axes collapse onto x; the resulting segment is [-2, 2].
    const collapse = new Matrix4([1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const segment = new OBB(v(0, 0, 0), v(1, 1, 0)).applyMatrix4(collapse);
    expect(segment.containsPoint(v(2, 0, 0))).toBe(true);
    expect(segment.containsPoint(v(2.01, 0, 0))).toBe(false);
    const mirroredCollapse = new Matrix4([1, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const rectangle = new OBB(v(0, 0, 0), v(1, 2, 3)).applyMatrix4(mirroredCollapse);
    expect(rectangle.containsPoint(v(3, 0, 3))).toBe(true);
    expect(rectangle.containsPoint(v(3.01, 0, 3))).toBe(false);
  });

  it("rejects invalid input and transformations that cannot represent a box", () => {
    expect(() => new OBB(v(0, 0, 0), v(-1, 1, 1))).toThrow(RangeError);
    expect(() => new OBB(v(NaN, 0, 0))).toThrow(RangeError);
    expect(() => new OBB(v(0, 0, 0), v(1, 1, 1), new Matrix3().set(1, 1, 0, 0, 1, 0, 0, 0, 1))).toThrow(RangeError);
    const box = new OBB(v(0, 0, 0), v(1, 1, 1));
    const shear = new Matrix4([1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const projection = new Matrix4([1, 0, 0, 0.1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(() => box.applyMatrix4(shear)).toThrow(/shear/);
    // Nearly parallel is still distinct: the second edge adds one world unit
    // of y even though its angular difference is only 1e-15 radians.
    const nearCollapse = new Matrix4([1, 0, 0, 0, 1, 1e-15, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(() => new OBB(v(0, 0, 0), v(1, 1e15, 0)).applyMatrix4(nearCollapse)).toThrow(/shear/);
    // A barely non-orthogonal edge can also create a large displacement.
    const slightShear = new Matrix4([1, 0, 0, 0, 5e-11, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(() => new OBB(v(0, 0, 0), v(1, 1e15, 0)).applyMatrix4(slightShear)).toThrow(/shear/);
    // A zero-width dimension contributes no shear, so a line remains representable.
    const line = new OBB(v(0, 0, 0), v(1, 0, 0)).applyMatrix4(shear);
    expect(line.containsPoint(v(1, 0, 0))).toBe(true);
    expect(line.containsPoint(v(1.01, 0, 0))).toBe(false);
    expect(() => box.applyMatrix4(projection)).toThrow(/affine/);
    expect(() => box.intersectsOBB(box, -1)).toThrow(RangeError);
    expect(() => box.clampPoint(v(Infinity, 0, 0))).toThrow(RangeError);
    expect(() => box.intersectRay(new Ray(v(0, 0, 0), v(0, NaN, 0)))).toThrow(RangeError);
    const huge = new OBB(v(Number.MAX_VALUE, 0, 0), v(Number.MAX_VALUE, 0, 0));
    expect(() => huge.getSize()).toThrow(RangeError);
    expect(() => huge.intersectsOBB(new OBB(v(-Number.MAX_VALUE, 0, 0)))).toThrow(RangeError);
  });

  it("agrees with interval geometry after independent three-dimensional rigid transforms", () => {
    let state = 0x52a724bd;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const position = () => v(4 * random() - 2, 4 * random() - 2, 4 * random() - 2);
    const size = () => v(0.3 + random(), 0.3 + random(), 0.3 + random());
    let hits = 0;
    for (let i = 0; i < 800; i++) {
      const a = new OBB(position(), size());
      const b = new OBB(position(), size());
      const expected = Math.abs(a.center.x - b.center.x) <= a.halfSize.x + b.halfSize.x &&
        Math.abs(a.center.y - b.center.y) <= a.halfSize.y + b.halfSize.y &&
        Math.abs(a.center.z - b.center.z) <= a.halfSize.z + b.halfSize.z;
      if (expected) hits++;
      expect(a.intersectsOBB(b, 0)).toBe(expected);
      const x = random() * 6, y = random() * 6, z = random() * 6;
      const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
      // Explicit Rz * Ry * Rx, then translate by (7,-5,3).
      const matrix = new Matrix4([
        cz * cy, sz * cy, -sy, 0,
        cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx, 0,
        cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx, 0,
        7, -5, 3, 1,
      ]);
      const ar = a.applyMatrix4(matrix);
      const br = b.applyMatrix4(matrix);
      expect(ar.intersectsOBB(br, 0)).toBe(expected);
      expect(br.intersectsOBB(ar, 0)).toBe(expected);
      const probe = position();
      const nearest = ar.clampPoint(probe);
      expect(ar.containsPoint(nearest)).toBe(true);
      // The center is an interior point, so clamping cannot be farther away.
      expect(nearest.distanceTo(probe)).toBeLessThanOrEqual(ar.center.distanceTo(probe) + 1e-12);
    }
    expect(hits).toBeGreaterThan(10);
    expect(hits).toBeLessThan(790);
  });

  it("preserves intersection under translation and reverses operands symmetrically", () => {
    let state = 0x31415926;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    for (let i = 0; i < 200; i++) {
      const position = () => v(8 * random() - 4, 8 * random() - 4, 8 * random() - 4);
      const size = () => v(0.1 + random(), 0.1 + random(), 0.1 + random());
      const first = new OBB(position(), size(), rotationZ(2 * Math.PI * random()));
      const second = new OBB(position(), size(), rotationZ(2 * Math.PI * random()));
      const translation = Matrix4.translation(v(5, -7, 3));
      const overlaps = first.intersectsOBB(second);
      expect(second.intersectsOBB(first)).toBe(overlaps);
      expect(first.applyMatrix4(translation).intersectsOBB(second.applyMatrix4(translation))).toBe(overlaps);
      const inside = first.clampPoint(position());
      expect(first.containsPoint(inside)).toBe(true);
    }
  });
});
