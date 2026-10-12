/**
 * Regression: Turbo Drift's committed drivable mesh must cover the road it drives on.
 *
 * The geometry extractor used to cap the drivable mesh at 4000 triangles by keeping every
 * Nth triangle. The circuit has 4052 source triangles, so the stride was 2, and because
 * road quads are emitted as consecutive triangle pairs it kept exactly one half of every
 * quad. Half the asphalt (and the start straight's centreline in 1-unit stretches) had no
 * triangle under it, so the chassis' wheel rays missed the road, wheels hung, and the car
 * tilted / read as sinking.
 */
import { describe, expect, it } from "vitest";
import { gameGeometryContract } from "../../../apps/showcase-turbo-drift-circuit/src/generated/game-geometry";

type Point = { readonly x: number; readonly z: number; readonly width: number };

const mesh = gameGeometryContract.topology.drivableMesh;
const centerline = gameGeometryContract.topology.roadCenterline as readonly Point[];

function covered(x: number, z: number): boolean {
  const p = mesh.positions;
  const ids = mesh.indices;
  for (let t = 0; t < ids.length; t += 3) {
    const a = ids[t]! * 3, b = ids[t + 1]! * 3, c = ids[t + 2]! * 3;
    const s1 = (p[b]! - p[a]!) * (z - p[a + 2]!) - (p[b + 2]! - p[a + 2]!) * (x - p[a]!);
    const s2 = (p[c]! - p[b]!) * (z - p[b + 2]!) - (p[c + 2]! - p[b + 2]!) * (x - p[b]!);
    const s3 = (p[a]! - p[c]!) * (z - p[c + 2]!) - (p[a + 2]! - p[c + 2]!) * (x - p[c]!);
    if ((s1 >= -1e-9 && s2 >= -1e-9 && s3 >= -1e-9) || (s1 <= 1e-9 && s2 <= 1e-9 && s3 <= 1e-9)) return true;
  }
  return false;
}

describe("turbo drift drivable mesh coverage", () => {
  it("keeps every source triangle (no decimation holes)", () => {
    expect(mesh.triangleCount).toBe(mesh.sourceTriangleCount);
    expect(mesh.indices.length / 3).toBe(mesh.sourceTriangleCount);
  });

  it("has a triangle under the centreline and both wheel tracks for the whole lap", () => {
    const misses: string[] = [];
    let samples = 0;
    for (let i = 0; i < centerline.length; i += 1) {
      const from = centerline[i]!;
      const to = centerline[(i + 1) % centerline.length]!;
      const length = Math.hypot(to.x - from.x, to.z - from.z);
      if (length < 1e-6) continue;
      const nx = -(to.z - from.z) / length;
      const nz = (to.x - from.x) / length;
      const steps = Math.max(1, Math.ceil(length / 0.1));
      for (let s = 0; s < steps; s += 1) {
        const u = s / steps;
        const x = from.x + (to.x - from.x) * u;
        const z = from.z + (to.z - from.z) * u;
        // Centre and +/-30% of the half width: where a car's wheels run.
        for (const lateral of [0, -0.3, 0.3]) {
          const off = lateral * from.width * 0.5;
          samples += 1;
          if (!covered(x + nx * off, z + nz * off)) misses.push(`${i}:${u.toFixed(2)}:${lateral}`);
        }
      }
    }
    expect(samples).toBeGreaterThan(1000);
    expect(misses.slice(0, 10)).toEqual([]);
  });
});
