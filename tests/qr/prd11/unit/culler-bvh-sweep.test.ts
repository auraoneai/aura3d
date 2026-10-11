import { describe, expect, it, vi } from "vitest";

import * as math from "@aura3d/math";
import { Frustum, Matrix4 } from "@aura3d/math";
import { buildStaticBoundsBvh, sphereSweep } from "../../../../packages/rendering/src/performance/BVH";
import { cull, cullStaticItems, packFrustumPlanes } from "../../../../packages/rendering/src/performance/FrustumCuller";
import type { StaticSpatialItem } from "../../../../packages/rendering/src/SceneOptimization";

/** PRD-11 11-S5 culler + #215 sphereSweep over the static-bounds BVH. */

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomItems(count: number, seed: number, spread = 100): StaticSpatialItem[] {
  const random = rng(seed);
  return Array.from({ length: count }, (_, index) => {
    const cx = (random() - 0.5) * spread;
    const cy = (random() - 0.5) * spread;
    const cz = (random() - 0.5) * spread;
    const h = 0.2 + random() * 2;
    return { id: `box-${index}`, bounds: { min: [cx - h, cy - h, cz - h], max: [cx + h, cy + h, cz + h] } };
  });
}

function testFrustum(): Frustum {
  // Camera at the origin looking down -z: boxes behind or outside the cone are culled.
  return Frustum.fromMatrix(Matrix4.perspective(Math.PI / 3, 1, 0.1, 60));
}

describe("11-S5 allocation-free culler", () => {
  it("cull() matches Frustum.intersectsBox for 10,000 random boxes", () => {
    const items = randomItems(10_000, 7);
    const frustum = testFrustum();
    const expected = items.map((item) => frustum.intersectsBox(new math.Box3(
      new math.Vector3(...item.bounds.min), new math.Vector3(...item.bounds.max)
    )));
    const bounds = new Float64Array(items.length * 6);
    items.forEach((item, index) => { bounds.set(item.bounds.min, index * 6); bounds.set(item.bounds.max, index * 6 + 3); });
    const out = new Uint8Array(items.length);
    const visible = cull(bounds, items.length, packFrustumPlanes(frustum.planes), out);
    expect(Array.from(out, (v) => v === 1)).toEqual(expected);
    expect(visible).toBe(expected.filter(Boolean).length);
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(items.length);
  });

  it("cullStaticItems with a math Frustum skips the per-item Box3 intersectsBox path", () => {
    const items = randomItems(2_000, 11);
    const frustum = testFrustum();
    const box3 = vi.spyOn(math.Box3.prototype, "isEmpty");
    const intersects = vi.spyOn(frustum, "intersectsBox");
    const visible = cullStaticItems(items, frustum);
    expect(intersects).not.toHaveBeenCalled();
    expect(box3).not.toHaveBeenCalled();
    expect(visible.length).toBeGreaterThan(0);
    box3.mockRestore();
  });

  it("NaN and empty boxes follow Box3 semantics (NaN visible, inverted culled)", () => {
    const frustum = testFrustum();
    const planes = packFrustumPlanes(frustum.planes);
    const out = new Uint8Array(2);
    const bounds = new Float64Array([Number.NaN, 0, -5, Number.NaN, 1, -4, 1, 1, -4, 0, 0, -5]);
    cull(bounds, 2, planes, out);
    const nanBox = new math.Box3(new math.Vector3(Number.NaN, 0, -5), new math.Vector3(Number.NaN, 1, -4));
    const inverted = new math.Box3(new math.Vector3(1, 1, -4), new math.Vector3(0, 0, -5));
    expect([out[0] === 1, out[1] === 1]).toEqual([frustum.intersectsBox(nanBox), frustum.intersectsBox(inverted)]);
  });

  it("cull() rejects undersized buffers", () => {
    expect(() => cull(new Float32Array(5), 1, new Float32Array(24), new Uint8Array(1))).toThrow(RangeError);
    expect(() => cull(new Float32Array(6), 1, new Float32Array(24), new Uint8Array(0))).toThrow(RangeError);
  });
});

/** Brute force: march the centre in tiny steps and report the first t where it touches any box. */
function bruteSweep(items: readonly StaticSpatialItem[], from: readonly number[], to: readonly number[], radius: number): number {
  const length = Math.hypot(to[0]! - from[0]!, to[1]! - from[1]!, to[2]! - from[2]!);
  const steps = 4000;
  for (let step = 0; step <= steps; step += 1) {
    const t = (length * step) / steps;
    const p = [0, 1, 2].map((axis) => from[axis]! + ((to[axis]! - from[axis]!) * t) / (length || 1));
    for (const item of items) {
      const d = Math.hypot(
        Math.max(item.bounds.min[0] - p[0]!, 0, p[0]! - item.bounds.max[0]),
        Math.max(item.bounds.min[1] - p[1]!, 0, p[1]! - item.bounds.max[1]),
        Math.max(item.bounds.min[2] - p[2]!, 0, p[2]! - item.bounds.max[2])
      );
      if (d <= radius) return t;
    }
  }
  return Number.POSITIVE_INFINITY;
}

describe("#215 sphereSweep over the static-bounds BVH", () => {
  const unit: StaticSpatialItem = { id: "unit", bounds: { min: [-1, -1, -1], max: [1, 1, 1] } };

  it("face hit: distance = gap minus radius", () => {
    const bvh = buildStaticBoundsBvh([unit]);
    const result = sphereSweep(bvh, [-5, 0, 0], [5, 0, 0], 0.5);
    expect(result.hit).toBe(true);
    expect(result.distance).toBeCloseTo(3.5, 5);
    expect(result.item?.id).toBe("unit");
    expect(result.nodeId).toBe(bvh.root.id);
    expect(result.point?.[0]).toBeCloseTo(-1.5, 5);
  });

  it("corner graze is exact, not the grown-box overestimate", () => {
    const bvh = buildStaticBoundsBvh([unit]);
    // Path along x at y = z = 1.3: passes the grown box (radius 0.5) but the
    // rounded box only near the edge x ∈ [-1, 1] (distance to edge 0.3√2 ≈ 0.424 < 0.5).
    const result = sphereSweep(bvh, [-5, 1.3, 1.3], [5, 1.3, 1.3], 0.5);
    expect(result.hit).toBe(true);
    // Contact at the corner (-1, 1, 1): (x + 1)² + 0.18 = 0.25 → x = -1 - √0.07.
    expect(result.distance).toBeCloseTo(4 - Math.sqrt(0.07), 4);
    // y = z = 1.4 → edge distance 0.4√2 ≈ 0.566 > 0.5: miss although inside the grown box.
    expect(sphereSweep(bvh, [-5, 1.4, 1.4], [5, 1.4, 1.4], 0.5).hit).toBe(false);
  });

  it("tangent face contact is a hit and long near-miss sweeps stay misses (PR #923 review)", () => {
    const bvh = buildStaticBoundsBvh([unit]);
    // Grazes the top face y = 1 exactly with radius 0.5 at y = 1.5.
    const graze = sphereSweep(bvh, [-5, 1.5, 0], [5, 1.5, 0], 0.5);
    expect(graze.hit).toBe(true);
    expect(graze.distance).toBeCloseTo(4, 6);
    // 10,000,000-unit sweep whose closest approach (0.4√2 ≈ 0.566) exceeds the radius.
    expect(sphereSweep(bvh, [-5_000_000, 1.4, 1.4], [5_000_000, 1.4, 1.4], 0.5).hit).toBe(false);
    // Same long sweep that does touch the corner region.
    const far = sphereSweep(bvh, [-5_000_000, 1.3, 1.3], [5_000_000, 1.3, 1.3], 0.5);
    expect(far.hit).toBe(true);
    expect(far.distance).toBeCloseTo(5_000_000 - 1 - Math.sqrt(0.07), 3);
  });

  it("starting in contact hits at distance 0; a short sweep that stops early misses", () => {
    const bvh = buildStaticBoundsBvh([unit]);
    expect(sphereSweep(bvh, [1.2, 0, 0], [3, 0, 0], 0.5)).toMatchObject({ hit: true, distance: 0 });
    expect(sphereSweep(bvh, [-5, 0, 0], [-4, 0, 0], 0.5).hit).toBe(false);
  });

  it("matches brute force on random scenes and returns the nearest item", () => {
    const random = rng(42);
    let hits = 0;
    for (let trial = 0; trial < 40; trial += 1) {
      const items = randomItems(300, 100 + trial, 40);
      const bvh = buildStaticBoundsBvh(items);
      const from = [(random() - 0.5) * 60, (random() - 0.5) * 60, (random() - 0.5) * 60];
      const to = [(random() - 0.5) * 60, (random() - 0.5) * 60, (random() - 0.5) * 60];
      const radius = random() * 1.5;
      const result = sphereSweep(bvh, from as [number, number, number], to as [number, number, number], radius);
      const brute = bruteSweep(items, from, to, radius);
      const length = Math.hypot(to[0]! - from[0]!, to[1]! - from[1]!, to[2]! - from[2]!);
      const step = length / 4000;
      if (Number.isFinite(brute)) {
        hits += 1;
        expect(result.hit).toBe(true);
        expect(result.distance).toBeLessThanOrEqual(brute + 1e-6);
        expect(result.distance).toBeGreaterThanOrEqual(brute - step - 1e-6);
      } else {
        // Brute force can step over a contact shorter than one step; any hit must be within a step-sized sliver.
        if (result.hit) expect(result.distance).toBeLessThanOrEqual(length);
      }
    }
    // The scenes are dense enough that most sweeps hit; guards against a vacuous pass.
    expect(hits).toBeGreaterThanOrEqual(20);
  });

  it("rejects a negative radius", () => {
    const bvh = buildStaticBoundsBvh([unit]);
    expect(() => sphereSweep(bvh, [0, 0, 0], [1, 0, 0], -1)).toThrow(RangeError);
  });
});
