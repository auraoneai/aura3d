/**
 * PRD-01 Phase-1 C-07 instance composition (lane 01, row 01-S4, §15 Phase 1 /
 * §8.5): `world · instance · geometry`.
 *
 * (a) A 3×3 grid with `size: 0.3` at spacing 1 gives world centers at spacing
 *     exactly 1 — `size` never scales instance translation.
 * (b) An instance rotated 45° about Y with a non-uniform scale and
 *     size [0.3, 0.6, 0.3], under a rotated + uniformly scaled node world
 *     matrix, has orthogonal world axes (|dot| < 1e-5): the non-uniform part is
 *     innermost, so no shear.
 * (c) The composed matrix agrees with an independently evaluated sequence of
 *     scale, X/Y/Z rotation and translation operations for each grid instance.
 * (d) The generated `instancing` vertex chunk multiplies in exactly that order.
 */

import { describe, expect, it } from "vitest";

import { createProductionInstanceTransforms } from "../../../../packages/engine/src/agent-api/compiler/primitives";
import { createModelMatrix } from "../../../../packages/engine/src/agent-api/index";
import type { AuraPrimitiveNode, AuraTransformSpec } from "../../../../packages/engine/src/agent-api/index";
import { INSTANCING_VERTEX_BODY_GLSL } from "../../../../packages/rendering/src/program/chunks/instancing.glsl";

type Vec3 = [number, number, number];

/** Column-major 4×4 multiply (a · b). */
function mul(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let s = 0;
      for (let k = 0; k < 4; k += 1) s += a[k * 4 + r]! * b[c * 4 + k]!;
      out[c * 4 + r] = s;
    }
  }
  return out;
}

function translationOf(m: ArrayLike<number>): Vec3 {
  return [m[12]!, m[13]!, m[14]!];
}

function axis(m: ArrayLike<number>, i: 0 | 1 | 2): Vec3 {
  return [m[i * 4]!, m[i * 4 + 1]!, m[i * 4 + 2]!];
}

function normalizedDot(a: Vec3, b: Vec3): number {
  const la = Math.hypot(...a);
  const lb = Math.hypot(...b);
  return (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
}

/** Geometry matrix the renderer folds `size` into (identity elsewhere). */
function sizeMatrix(size: Vec3): Float64Array {
  return new Float64Array([size[0], 0, 0, 0, 0, size[1], 0, 0, 0, 0, size[2], 0, 0, 0, 0, 1]);
}

/** Apply a transform directly to a point, without the implementation's matrix helpers. */
function applyTransform(point: Vec3, transform: { position?: readonly number[]; rotation?: readonly number[]; scale?: number | readonly number[] }, size: readonly number[] = [1, 1, 1]): Vec3 {
  const s = typeof transform.scale === "number" ? [transform.scale, transform.scale, transform.scale] : transform.scale ?? [1, 1, 1];
  let [x, y, z] = point.map((component, i) => component * s[i]! * size[i]!) as Vec3;
  const [rx, ry, rz] = transform.rotation ?? [0, 0, 0];
  const cosX = Math.cos(rx!); const sinX = Math.sin(rx!);
  [y, z] = [y * cosX - z * sinX, y * sinX + z * cosX];
  const cosY = Math.cos(ry!); const sinY = Math.sin(ry!);
  [x, z] = [x * cosY + z * sinY, -x * sinY + z * cosY];
  const cosZ = Math.cos(rz!); const sinZ = Math.sin(rz!);
  [x, y] = [x * cosZ - y * sinZ, x * sinZ + y * cosZ];
  const p = transform.position ?? [0, 0, 0];
  return [x + p[0]!, y + p[1]!, z + p[2]!];
}

function applyMatrix(m: ArrayLike<number>, point: Vec3): Vec3 {
  return [0, 1, 2].map((r) => m[r]! * point[0] + m[4 + r]! * point[1] + m[8 + r]! * point[2] + m[12 + r]!) as Vec3;
}

function grid3x3(extra: AuraTransformSpec = {}): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      transforms.push({ ...extra, position: [col - 1, 0, row - 1] });
    }
  }
  return transforms;
}

const WORLD_NODE: AuraPrimitiveNode = {
  kind: "primitive",
  primitive: "box",
  position: [0.5, 1.25, -2],
  rotation: [0.2, -0.6, 0.1],
  scale: 1.5
};

describe("prd01 C-07 world · instance · geometry (01-S4)", () => {
  it("(a) 3×3 grid with size 0.3 keeps spacing exactly 1 in world space", () => {
    const node: AuraPrimitiveNode = { kind: "primitive", primitive: "box", size: 0.3 };
    const matrices = createProductionInstanceTransforms(grid3x3(), node);
    expect(matrices.length).toBe(9 * 16);
    const centers: Vec3[] = [];
    for (let i = 0; i < 9; i += 1) centers.push(translationOf(matrices.subarray(i * 16, i * 16 + 16)));
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const c = centers[row * 3 + col]!;
        expect(c[0]).toBeCloseTo(col - 1, 6);
        expect(c[1]).toBeCloseTo(0, 6);
        expect(c[2]).toBeCloseTo(row - 1, 6);
      }
    }
    // Neighbour spacing is exactly 1 (size 0.3 did not scale translation).
    expect(Math.hypot(centers[1]![0] - centers[0]![0], centers[1]![2] - centers[0]![2])).toBeCloseTo(1, 6);
    expect(Math.hypot(centers[3]![0] - centers[0]![0], centers[3]![2] - centers[0]![2])).toBeCloseTo(1, 6);
    // The instance basis carries the size (geometry extent 0.3 per axis).
    const m0 = matrices.subarray(0, 16);
    expect(Math.hypot(...axis(m0, 0))).toBeCloseTo(0.3, 6);
    expect(Math.hypot(...axis(m0, 1))).toBeCloseTo(0.3, 6);
  });

  it("(b) 45° Y rotation + non-uniform scale + size [0.3,0.6,0.3] has orthogonal world axes (no shear)", () => {
    const size: Vec3 = [0.3, 0.6, 0.3];
    const node: AuraPrimitiveNode = { kind: "primitive", primitive: "box", size };
    const instanceSpec: AuraTransformSpec = { rotation: [0, Math.PI / 4, 0], scale: [1, 2, 0.5] };
    const matrices = createProductionInstanceTransforms(grid3x3(instanceSpec), node);
    const world = createModelMatrix(WORLD_NODE, { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, false, 0);
    for (let i = 0; i < 9; i += 1) {
      const composed = mul(world, matrices.subarray(i * 16, i * 16 + 16));
      const x = axis(composed, 0);
      const y = axis(composed, 1);
      const z = axis(composed, 2);
      expect(Math.abs(normalizedDot(x, y))).toBeLessThan(1e-5);
      expect(Math.abs(normalizedDot(y, z))).toBeLessThan(1e-5);
      expect(Math.abs(normalizedDot(x, z))).toBeLessThan(1e-5);
      // Axis lengths = worldScale · instanceScale · size.
      expect(Math.hypot(...x)).toBeCloseTo(1.5 * 1 * 0.3, 5);
      expect(Math.hypot(...y)).toBeCloseTo(1.5 * 2 * 0.6, 5);
      expect(Math.hypot(...z)).toBeCloseTo(1.5 * 0.5 * 0.3, 5);
    }
  });

  it("(c) applies geometry size, instance, and world transforms in order", () => {
    const size: Vec3 = [0.3, 0.6, 0.3];
    const node: AuraPrimitiveNode = { kind: "primitive", primitive: "box", size };
    const instanceSpec: AuraTransformSpec = { rotation: [0, Math.PI / 4, 0], scale: [1, 2, 0.5] };
    const transforms = grid3x3(instanceSpec);
    const auraInstances = createProductionInstanceTransforms(transforms, node);
    const world = createModelMatrix(WORLD_NODE, { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, false, 0);

    transforms.forEach((transform, i) => {
      const composed = mul(world, auraInstances.subarray(i * 16, i * 16 + 16));
      const unsized = createProductionInstanceTransforms([transform], { kind: "primitive", primitive: "box" });
      const explicit = mul(mul(world, unsized), sizeMatrix(size));
      for (const point of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [-0.4, 0.2, 0.7]] as Vec3[]) {
        const reference = applyTransform(applyTransform(point, transform, size), WORLD_NODE);
        for (const actual of [applyMatrix(composed, point), applyMatrix(explicit, point)]) {
          for (let k = 0; k < 3; k += 1) expect(actual[k]).toBeCloseTo(reference[k]!, 5);
        }
      }
    });
  });

  it("(d) the instancing chunk composes u_modelMatrix · instanceMatrix · u_geometryMatrix", () => {
    const body = INSTANCING_VERTEX_BODY_GLSL.replace(/\s+/g, " ");
    expect(body).toContain("vec4 a3dLocal = u_geometryMatrix * vec4(transformed, 1.0);");
    expect(body).toContain("vec4 a3dWorld = u_modelMatrix * instanceMatrix * a3dLocal;");
  });
});
