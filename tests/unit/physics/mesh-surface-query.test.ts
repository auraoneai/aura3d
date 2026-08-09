import { describe, expect, it } from "vitest";
import {
  buildMeshBVH,
  createMeshSurfaceQuery,
  raycastMesh,
  raycastMeshBruteForce
} from "../../../packages/physics/src";

/** Deterministic PRNG so a failure is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A grid plane, subdivided, with an optional height function. */
function grid(
  size: number,
  divisions: number,
  height: (x: number, z: number) => number = () => 0
): { positions: Float32Array; indices: Uint32Array } {
  const positions: number[] = [];
  const indices: number[] = [];
  const step = size / divisions;
  for (let iz = 0; iz <= divisions; iz += 1) {
    for (let ix = 0; ix <= divisions; ix += 1) {
      const x = -size / 2 + ix * step;
      const z = -size / 2 + iz * step;
      positions.push(x, height(x, z), z);
    }
  }
  const stride = divisions + 1;
  for (let iz = 0; iz < divisions; iz += 1) {
    for (let ix = 0; ix < divisions; ix += 1) {
      const a = iz * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

describe("MeshBVH", () => {
  it("matches brute force on 1000 random rays over a 10k-triangle mesh", () => {
    // 71x71 grid = 10082 triangles.
    const mesh = grid(20, 71, (x, z) => Math.sin(x * 0.6) * 0.4 + Math.cos(z * 0.5) * 0.3);
    const bvh = buildMeshBVH(mesh.positions, mesh.indices);
    expect(bvh.triangleCount).toBeGreaterThan(10_000);

    const random = mulberry32(1234);
    let compared = 0;
    for (let i = 0; i < 1000; i += 1) {
      const x = (random() - 0.5) * 18;
      const z = (random() - 0.5) * 18;
      const origin = [x, 6, z] as const;
      const direction = [0, -1, 0] as const;
      const fast = raycastMesh(bvh, origin, direction);
      const slow = raycastMeshBruteForce(bvh, origin, direction);
      expect(Boolean(fast)).toBe(Boolean(slow));
      if (fast && slow) {
        // Same distance to floating tolerance; the triangle may differ only on a shared edge.
        expect(fast.distance).toBeCloseTo(slow.distance, 6);
        compared += 1;
      }
    }
    expect(compared, "rays that hit the mesh").toBeGreaterThan(900);
  }, 15_000);

  it("builds deterministically: two builds of the same mesh are identical", () => {
    const mesh = grid(4, 9, (x) => x * 0.1);
    const a = buildMeshBVH(mesh.positions, mesh.indices);
    const b = buildMeshBVH(mesh.positions, mesh.indices);
    expect(JSON.stringify(a.nodes)).toBe(JSON.stringify(b.nodes));
  });

  it("rejects an index count that is not a multiple of three", () => {
    expect(() => buildMeshBVH(new Float32Array(9), new Uint32Array([0, 1]))).toThrow(/divisible by 3/);
  });
});

describe("raycastMesh edge cases", () => {
  /*
   * Single triangle in the y=0 plane, wound so its geometric normal points UP.
   *
   * Winding matters and is easy to get backwards: with vertices (0,0,0), (1,0,0),
   * (0,0,1) the cross product e1 x e2 is (0,-1,0) — pointing *down* — so a downward ray
   * would legitimately report `backFace: true`. Index order [0, 2, 1] flips it, which is
   * what an upward-facing floor triangle actually looks like.
   */
  const tri = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    indices: new Uint32Array([0, 2, 1])
  };
  const bvh = buildMeshBVH(tri.positions, tri.indices);

  it("hits a front face and reports an upward normal", () => {
    const hit = raycastMesh(bvh, [0.25, 1, 0.25], [0, -1, 0]);
    expect(hit).toBeTruthy();
    expect(hit!.distance).toBeCloseTo(1, 6);
    // Normal is oriented against the ray, so a downward ray gets an upward normal.
    expect(hit!.normal[1]).toBeGreaterThan(0.99);
    expect(hit!.backFace).toBe(false);
  });

  it("hits a back face and flags it", () => {
    const hit = raycastMesh(bvh, [0.25, -1, 0.25], [0, 1, 0]);
    expect(hit).toBeTruthy();
    expect(hit!.backFace).toBe(true);
    // Culling removes it.
    expect(raycastMesh(bvh, [0.25, -1, 0.25], [0, 1, 0], { cullBackFaces: true })).toBeUndefined();
  });

  it("misses a ray parallel to the triangle plane", () => {
    expect(raycastMesh(bvh, [-1, 0, 0.25], [1, 0, 0])).toBeUndefined();
  });

  it("misses outside the triangle", () => {
    expect(raycastMesh(bvh, [5, 1, 5], [0, -1, 0])).toBeUndefined();
  });

  it("returns undefined for a degenerate zero-area triangle", () => {
    const degenerate = buildMeshBVH(
      new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]),
      new Uint32Array([0, 1, 2])
    );
    expect(raycastMesh(degenerate, [0.5, 1, 0], [0, -1, 0])).toBeUndefined();
  });

  it("normalises the direction so distance is in world units", () => {
    // An unnormalised direction must not scale the reported distance.
    const unit = raycastMesh(bvh, [0.25, 2, 0.25], [0, -1, 0]);
    const scaled = raycastMesh(bvh, [0.25, 2, 0.25], [0, -10, 0]);
    expect(unit!.distance).toBeCloseTo(2, 6);
    expect(scaled!.distance).toBeCloseTo(2, 6);
  });

  it("respects maxDistance", () => {
    expect(raycastMesh(bvh, [0.25, 5, 0.25], [0, -1, 0], { maxDistance: 1 })).toBeUndefined();
    expect(raycastMesh(bvh, [0.25, 5, 0.25], [0, -1, 0], { maxDistance: 10 })).toBeTruthy();
  });

  it("reports barycentric coordinates that sum to one", () => {
    const hit = raycastMesh(bvh, [0.25, 1, 0.25], [0, -1, 0])!;
    const [u, v, w] = hit.barycentric;
    expect(u + v + w).toBeCloseTo(1, 6);
  });
});

describe("createMeshSurfaceQuery", () => {
  it("returns different heights across a banked surface, which a flat plane cannot", () => {
    /*
     * This is the exact defect the vehicle had. A track banked across its width was
     * sampled as one scalar height, so the outer wheels solved against a surface that
     * was not there and the tyres passed through the road.
     */
    const banked = grid(10, 20, (x) => x * 0.2);
    const query = createMeshSurfaceQuery(banked);

    const left = query.sampleHeight(-4, 0);
    const middle = query.sampleHeight(0, 0);
    const right = query.sampleHeight(4, 0);

    expect(left).toBeCloseTo(-0.8, 2);
    expect(middle).toBeCloseTo(0, 2);
    expect(right).toBeCloseTo(0.8, 2);
    // The failing assertion under the old analytic model: all three were equal.
    expect(left).not.toBeCloseTo(right, 2);
  });

  it("returns a real tilted normal, not a hardcoded world up", () => {
    const banked = grid(10, 20, (x) => x * 0.5);
    const query = createMeshSurfaceQuery(banked);
    const normal = query.sampleNormal(1, 0);

    // A 0.5 gradient tilts the normal noticeably off vertical.
    expect(normal[1]).toBeLessThan(0.95);
    expect(Math.abs(normal[0])).toBeGreaterThan(0.2);
    expect(Math.hypot(normal[0], normal[1], normal[2])).toBeCloseTo(1, 6);
    // Always oriented upward, so attitude maths built on it cannot invert.
    expect(normal[1]).toBeGreaterThan(0);
  });

  it("follows a crowned surface across its width", () => {
    const crowned = grid(10, 24, (x) => -0.02 * x * x);
    const query = createMeshSurfaceQuery(crowned);
    const centre = query.sampleHeight(0, 0);
    const edge = query.sampleHeight(4.5, 0);
    expect(centre).toBeGreaterThan(edge);
  });

  it("applies a world matrix so a placed track grounds correctly", () => {
    const flat = grid(4, 4);
    // Translate up 3 units.
    const translated = createMeshSurfaceQuery(flat, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,3,0,1]);
    expect(translated.sampleHeight(0, 0)).toBeCloseTo(3, 5);
  });

  it("reports a miss with a fallback rather than throwing", () => {
    const flat = grid(2, 2);
    const query = createMeshSurfaceQuery(flat, undefined, { fallbackHeight: -99 });
    const sample = query.sample(50, 50);
    expect(sample.hit).toBe(false);
    expect(sample.height).toBe(-99);
    expect(sample.normal).toEqual([0, 1, 0]);
  });

  it("caches repeated samples in the same cell and can be invalidated", () => {
    const flat = grid(4, 8);
    const query = createMeshSurfaceQuery(flat, undefined, { cacheCellSize: 0.5 });
    query.sampleHeight(1, 1);
    query.sampleHeight(1, 1);
    query.sampleHeight(1.05, 1.05);
    const stats = query.stats();
    expect(stats.samples).toBe(3);
    expect(stats.cacheHits).toBeGreaterThanOrEqual(2);

    query.invalidate();
    expect(query.stats().cachedCells).toBe(0);
  });

  it("maps triangles to grip so off-line surfaces are slower", () => {
    const flat = grid(4, 2);
    const bvh = buildMeshBVH(flat.positions, flat.indices);
    const hit = raycastMesh(bvh, [0.5, 5, 0.5], [0, -1, 0])!;
    const query = createMeshSurfaceQuery(flat, undefined, {
      gripByTriangle: new Map([[hit.triangle, 0.35]])
    });
    expect(query.sampleGrip(0.5, 0.5)).toBeCloseTo(0.35, 6);
    // Triangles without an entry keep full grip.
    expect(query.sampleGrip(-1.5, -1.5)).toBe(1);
  });
});
