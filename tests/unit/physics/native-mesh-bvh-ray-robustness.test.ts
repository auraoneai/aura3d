import { describe, expect, it } from "vitest";
import { buildMeshBVH, raycastMesh, raycastMeshBruteForce } from "../../../packages/physics/src/MeshBVH";
import type { Vec3 } from "../../../packages/physics/src/Shape";

// These triangles and expected intersections are defined directly in world
// space rather than by another ray or geometry implementation.
const floor = buildMeshBVH(
  new Float32Array([-4, 0, -4, 4, 0, -4, 0, 0, 4]),
  new Uint32Array([0, 1, 2])
);
const casters = [raycastMesh, raycastMeshBruteForce] as const;

function expectVectorClose(actual: Vec3, expected: Vec3): void {
  for (let axis = 0; axis < 3; axis += 1) expect(actual[axis]).toBeCloseTo(expected[axis]!, 12);
}

describe("mesh raycast direction and slab robustness", () => {
  it.each([1e-13, 1e-200, Number.MIN_VALUE, 1, Number.MAX_VALUE])(
    "normalizes a finite nonzero downward direction of magnitude %s in world units",
    (magnitude) => {
      for (const cast of casters) {
        const hit = cast(floor, [0, 1, 0], [0, -magnitude, 0]);
        expect(hit).toBeDefined();
        expect(hit!.triangle).toBe(0);
        expect(hit!.distance).toBeCloseTo(1, 12);
        expectVectorClose(hit!.point, [0, 0, 0]);
      }
    }
  );

  it.each([Number.MIN_VALUE, 1e-200, Number.MAX_VALUE])(
    "normalizes equal finite components at magnitude %s without underflow or overflow",
    (magnitude) => {
      for (const cast of casters) {
        const hit = cast(floor, [0, 1, 0], [magnitude, -magnitude, 0]);
        expect(hit).toBeDefined();
        expect(hit!.distance).toBeCloseTo(Math.SQRT2, 12);
        expectVectorClose(hit!.point, [1, 0, 0]);
      }
    }
  );

  it("preserves an ordinary non-axis hit for equivalent scaled and unit directions", () => {
    // A 3-4-5 direction starting one unit above y=0 travels 1.25 world
    // units and reaches x=0.75, strictly inside the floor triangle.
    for (const cast of casters) {
      const scaled = cast(floor, [0, 1, 0], [3, -4, 0]);
      const unit = cast(floor, [0, 1, 0], [0.6, -0.8, 0]);
      expect(scaled).toBeDefined();
      expect(unit).toEqual(scaled);
      expect(scaled!.distance).toBeCloseTo(1.25, 12);
      expectVectorClose(scaled!.point, [0.75, 0, 0]);
    }
  });

  it("normalizes three minimum-subnormal components without changing the ray angle", () => {
    for (const cast of casters) {
      const hit = cast(floor, [0, 1, 0], [Number.MIN_VALUE, -Number.MIN_VALUE, Number.MIN_VALUE]);
      expect(hit).toBeDefined();
      expect(hit!.distance).toBeCloseTo(Math.sqrt(3), 12);
      expectVectorClose(hit!.point, [1, 0, 1]);
    }
  });

  // Powers of two are represented exactly by Float32 here. The old finite
  // stand-in for a zero X direction capped a valid inside-slab hit at 1e30.
  const far = 2 ** 103;
  const distant = buildMeshBVH(
    new Float32Array([-1, far, -1, 1, far, -1, 0, far, 1]),
    new Uint32Array([0, 1, 2])
  );

  it.each([0, -0])("hits a distant triangle while parallel to an inside slab (signed zero %s)", (zero) => {
    for (const cast of casters) {
      const hit = cast(distant, [0, 0, 0], [zero, 1, 0]);
      expect(hit).toBeDefined();
      expect(hit!.distance).toBe(far);
      expectVectorClose(hit!.point, [0, far, 0]);
    }
  });

  it.each([-1, 1])("hits the distant triangle on a parallel X-slab boundary %s", (x) => {
    for (const cast of casters) {
      const hit = cast(distant, [x, 0, -1], [0, 1, -0]);
      expect(hit).toBeDefined();
      expect(hit!.distance).toBe(far);
      expectVectorClose(hit!.point, [x, far, -1]);
    }
  });

  it.each([-2, 2])("misses a distant triangle outside a parallel X slab at %s", (x) => {
    for (const cast of casters) expect(cast(distant, [x, 0, 0], [0, 1, 0])).toBeUndefined();
  });

  it.each([
    { x: -4, xDirection: Number.MIN_VALUE },
    { x: 4, xDirection: -Number.MIN_VALUE }
  ])(
    "keeps an inward subnormal normalized component at the X boundary $x",
    ({ x, xDirection }) => {
      for (const cast of casters) {
        const hit = cast(floor, [x, 1, -4], [xDirection, -1, 0]);
        expect(hit).toBeDefined();
        expect(hit!.distance).toBeCloseTo(1, 12);
        expectVectorClose(hit!.point, [x, 0, -4]);
      }
    }
  );

  it("includes an exact maximum distance and excludes shorter distances", () => {
    for (const cast of casters) {
      expect(cast(distant, [0, 0, 0], [0, 1, 0], { maxDistance: far })?.distance).toBe(far);
      expect(cast(distant, [0, 0, 0], [0, 1, 0], { maxDistance: far / 2 })).toBeUndefined();
      expect(cast(floor, [0, 0, 0], [0, -1, 0], { maxDistance: 0 })?.distance).toBeCloseTo(0, 12);
      expect(cast(floor, [0, 1, 0], [0, -1, 0], { maxDistance: -1 })).toBeUndefined();
    }
  });

  it.each([
    [0, 0, 0],
    [-0, 0, -0],
    [Number.NaN, -1, 0],
    [Number.POSITIVE_INFINITY, -1, 0],
    [Number.NEGATIVE_INFINITY, 0, 0]
  ] as const)("rejects zero or nonfinite direction %s", (...components) => {
    const direction: Vec3 = [components[0], components[1], components[2]];
    for (const cast of casters) expect(cast(floor, [0, 1, 0], direction)).toBeUndefined();
  });

  it("keeps an empty mesh a miss for both valid and invalid directions", () => {
    const empty = buildMeshBVH(new Float32Array(), new Uint32Array());
    for (const cast of casters) {
      expect(cast(empty, [0, 1, 0], [0, -1, 0])).toBeUndefined();
      expect(cast(empty, [0, 1, 0], [0, 0, 0])).toBeUndefined();
    }
  });
});

describe("mesh raycast nearest-hit determinism", () => {
  it.each([1, 8])("selects the lowest triangle index on exact ties with leaf size %s", (maxLeafTriangles) => {
    const duplicate = buildMeshBVH(
      new Float32Array([-4, 0, -4, 4, 0, -4, 0, 0, 4]),
      new Uint32Array([0, 1, 2, 0, 1, 2]),
      { maxLeafTriangles }
    );
    for (const cast of casters) {
      const hit = cast(duplicate, [0, 1, 0], [0, -1, 0]);
      expect(hit?.triangle).toBe(0);
      expect(hit?.distance).toBeCloseTo(1, 12);
    }
  });

  it("does not merge distinct close distances when choosing the nearest triangle", () => {
    const elevation = 2 ** -20;
    const mesh = buildMeshBVH(
      new Float32Array([-4, 0, -4, 4, 0, -4, 0, 0, 4, -4, elevation, -4, 4, elevation, -4, 0, elevation, 4]),
      new Uint32Array([0, 1, 2, 3, 4, 5]),
      { maxLeafTriangles: 1 }
    );
    for (const cast of casters) {
      const hit = cast(mesh, [0, 1, 0], [0, -1, 0]);
      expect(hit?.triangle).toBe(1);
      expect(hit?.distance).toBe(1 - elevation);
    }
  });
});
