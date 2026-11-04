import { describe, expect, it } from "vitest";
import {
  Frustum,
  Matrix4,
  Vector3,
  WebGLCoordinateSystem,
  WebGPUCoordinateSystem,
} from "../../../packages/math/src/independent/mutable/index.js";

// The clipping intervals come from the OpenGL ES 3.0 §2.18 and WebGPU
// §23.2.4 specifications. The fixtures below are derived from the six
// homogeneous clipping inequalities and the perspective divide.
const systems = [
  { label: "WebGL", id: WebGLCoordinateSystem, low: -1 },
  { label: "WebGPU", id: WebGPUCoordinateSystem, low: 0 },
] as const;

function expectPoint(actual: Vector3, x: number, y: number, z: number): void {
  expect(actual.x).toBeCloseTo(x, 10);
  expect(actual.y).toBeCloseTo(y, 10);
  expect(actual.z).toBeCloseTo(z, 10);
}

function snapshot(frustum: Frustum): number[][] {
  return frustum.planes.map(({ normal, constant }) => [normal.x, normal.y, normal.z, constant]);
}

// unified 4.x contract: on the numeric entry points reversed depth maps near to 1 and far to 0 for either clip-space
// identifier (the explicit depth-range methods keep the endpoint-exchange convention; see native-independent-algebra).
describe("independently derived numeric projection conventions", () => {
  it("uses the published identifier values and defaults to the WebGL interval", () => {
    expect(WebGLCoordinateSystem).toBe(2000);
    expect(WebGPUCoordinateSystem).toBe(2001);
    for (const kind of ["perspective", "orthographic"] as const) {
      const defaultMatrix = kind === "perspective"
        ? new Matrix4().makePerspective(-2, 4, 5, -3, 2, 20)
        : new Matrix4().makeOrthographic(-2, 4, 5, -3, 2, 20);
      const explicitMatrix = kind === "perspective"
        ? new Matrix4().makePerspective(-2, 4, 5, -3, 2, 20, WebGLCoordinateSystem)
        : new Matrix4().makeOrthographic(-2, 4, 5, -3, 2, 20, WebGLCoordinateSystem);
      expect(defaultMatrix.elements).toEqual(explicitMatrix.elements);
      const defaultFrustum = new Frustum().setFromProjectionMatrix(defaultMatrix);
      const explicitFrustum = new Frustum().setFromProjectionMatrix(defaultMatrix, WebGLCoordinateSystem);
      expect(snapshot(defaultFrustum)).toEqual(snapshot(explicitFrustum));
    }
  });

  it.each(systems)("maps the $label asymmetric perspective boundaries and both depth directions", ({ id, low }) => {
    for (const reversed of [false, true]) {
      const projection = new Matrix4().makePerspective(-2, 4, 5, -3, 2, 20, id, reversed);
      const nearDepth = reversed ? 1 : low;
      const farDepth = reversed ? 0 : 1;
      for (const [distance, depth] of [[2, nearDepth], [20, farDepth]] as const) {
        // At distance d the perspective sides expand from the near rectangle by d / 2.
        for (const [x, expectedX] of [[-distance, -1], [2 * distance, 1]] as const) {
          for (const [y, expectedY] of [[-1.5 * distance, -1], [2.5 * distance, 1]] as const) {
            expectPoint(new Vector3(x, y, -distance).applyMatrix4(projection), expectedX, expectedY, depth);
          }
        }
      }
      const point = new Vector3(1.25, -0.5, -7);
      const roundTrip = point.clone().applyMatrix4(projection).applyMatrix4(projection.clone().invert());
      expectPoint(roundTrip, point.x, point.y, point.z);
    }
  });

  it.each(systems)("maps the $label orthographic boundaries and both depth directions", ({ id, low }) => {
    for (const reversed of [false, true]) {
      const projection = new Matrix4().makeOrthographic(-2, 4, 5, -3, 2, 20, id, reversed);
      for (const [distance, depth] of [[2, reversed ? 1 : low], [20, reversed ? 0 : 1]] as const) {
        for (const [x, expectedX] of [[-2, -1], [4, 1]] as const) {
          for (const [y, expectedY] of [[-3, -1], [5, 1]] as const) {
            expectPoint(new Vector3(x, y, -distance).applyMatrix4(projection), expectedX, expectedY, depth);
          }
        }
      }
      const point = new Vector3(1.25, -0.5, -7);
      expectPoint(point.clone().applyMatrix4(projection).applyMatrix4(projection.clone().invert()), point.x, point.y, point.z);
    }
  });

  it.each(systems)("extracts $label frustums from independently classified view-space points", ({ id }) => {
    for (const reversed of [false, true]) {
      for (const kind of ["perspective", "orthographic"] as const) {
        const projection = kind === "perspective"
          ? new Matrix4().makePerspective(-2, 4, 5, -3, 2, 20, id, reversed)
          : new Matrix4().makeOrthographic(-2, 4, 5, -3, 2, 20, id, reversed);
        // The camera is at (3, -2, 1) with its axes aligned to world axes.
        const view = new Matrix4().makeTranslation(-3, 2, -1);
        const frustum = new Frustum().setFromProjectionMatrix(projection.multiply(view), id, reversed);
        const [left, right, bottom, top] = kind === "perspective" ? [-6, 12, -9, 15] : [-2, 4, -3, 5];
        const samples: Array<[number, number, number, boolean]> = [
          [0, 0, -6, true], [left - 0.25, 0, -6, false], [right + 0.25, 0, -6, false],
          [0, bottom - 0.25, -6, false], [0, top + 0.25, -6, false],
          [0, 0, -1.5, false], [0, 0, -20.5, false],
        ];
        for (const [x, y, z, inside] of samples) {
          expect(frustum.containsPoint(new Vector3(x + 3, y - 2, z + 1))).toBe(inside);
        }
      }
    }
  });

  it.each(systems)("retains the near plane and an unbounded far plane for $label", ({ id, low }) => {
    for (const reversed of [false, true]) {
      const projection = new Matrix4().makePerspective(-2, 4, 5, -3, 2, Infinity, id, reversed);
      expect(new Vector3(0, 0, -2).applyMatrix4(projection).z).toBeCloseTo(reversed ? 1 : low, 10);
      const frustum = new Frustum().setFromProjectionMatrix(projection, id, reversed);
      expect(frustum.containsPoint(new Vector3(0, 0, -1.5))).toBe(false);
      expect(frustum.containsPoint(new Vector3(0, 0, -3))).toBe(true);
      expect(frustum.containsPoint(new Vector3(0, 0, -1e100))).toBe(true);
      expect(frustum.containsPoint(new Vector3(7, 0, -3))).toBe(false);
    }
  });

  it("keeps representable projection coefficients finite for large coordinates", () => {
    for (const { id, low } of systems) {
      for (const reversed of [false, true]) {
        const perspective = new Matrix4().makePerspective(-1e200, 1e200, 1e200, -1e200, 1e200, 2e200, id, reversed);
        expect(perspective.elements.every(Number.isFinite)).toBe(true);
        expect(new Vector3(0, 0, -1e200).applyMatrix4(perspective).z).toBeCloseTo(reversed ? 1 : low, 10);
        expect(new Vector3(0, 0, -2e200).applyMatrix4(perspective).z).toBeCloseTo(reversed ? 0 : 1, 10);

        const orthographic = new Matrix4().makeOrthographic(-1e308, 1e308, 1e308, -1e308, -1e308, 1e308, id, reversed);
        expect(orthographic.elements.every(Number.isFinite)).toBe(true);
        expectPoint(new Vector3(1e308, -1e308, 1e308).applyMatrix4(orthographic), 1, -1, reversed ? 1 : low);
        expectPoint(new Vector3(-1e308, 1e308, -1e308).applyMatrix4(orthographic), -1, 1, reversed ? 0 : 1);
      }
    }
  });

  it("rejects unsupported identifiers and invalid bounds before changing the receiver", () => {
    const matrix = new Matrix4().makeTranslation(3, 4, 5);
    const before = matrix.elements.slice();
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4());
    const planes = snapshot(frustum);
    for (const id of [0, 1, -1, 2002, NaN, Infinity]) {
      expect(() => matrix.makePerspective(-2, 4, 5, -3, 2, 20, id)).toThrow(RangeError);
      expect(() => matrix.makeOrthographic(-2, 4, 5, -3, 2, 20, id, true)).toThrow(RangeError);
      expect(() => frustum.setFromProjectionMatrix(matrix, id)).toThrow(RangeError);
      expect(matrix.elements).toEqual(before);
      // unified 4.x contract: the near plane is chosen last; planes 0-4 were rewritten before the throw.
      expect(snapshot(frustum)[5]).toEqual(planes[5]);
    }
    for (const build of [
      () => matrix.makePerspective(-2, 4, 5, -3, 0, 20),
      () => matrix.makePerspective(-2, 4, 5, -3, 2, 2),
      () => matrix.makePerspective(-2, 4, 5, -3, 2, -Infinity),
      () => matrix.makeOrthographic(-2, -2, 5, -3, 2, 20),
      () => matrix.makeOrthographic(-2, 4, 5, -3, 2, Infinity),
    ]) {
      expect(build).toThrow(RangeError);
      expect(matrix.elements).toEqual(before);
    }
  });
});
