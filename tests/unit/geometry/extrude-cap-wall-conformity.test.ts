import { describe, expect, it } from "vitest";
import { extrudeParityMesh, type ExtrudeParityParams } from "../../../packages/rendering/src/index";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { qrPrimitiveMeshFor } from "../../../packages/engine/src/agent-api/compiler/primitives";
import type { AuraPrimitiveOptions } from "../../../packages/engine/src/agent-api/nodes/types";

/**
 * A closed extrusion must be watertight: the cap and the first bevel/wall
 * layer have to share every boundary edge. When the cap triangulator skips a
 * collinear ring vertex B between A and C, the cap edge A-C meets the wall
 * edges A-B and B-C in a T-junction, which rasterizes as isolated background
 * pixels (the homepage "white fleck" seam on the red ribbon).
 */

type Params = NonNullable<AuraPrimitiveOptions["params"]>;
type Mesh = { readonly positions: ArrayLike<number>; readonly uvs?: ArrayLike<number>; readonly groups?: readonly { start: number; count: number; materialIndex?: number }[] };

// The homepage lane outline: 37 samples, a straight run up to x = -2.4 and a
// smoothstep bend after it (auraone-website HomepageOperatingFieldScene).
const LANE_START_X = -5, CURVE_START_X = -2.4, LANE_END_X = 1.27, LANE_HALF = 0.23;
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const laneY = (x: number): number => 0.6 + (0.38 - 0.6) * smoothstep(CURVE_START_X, LANE_END_X, x);
const samples = Array.from({ length: 37 }, (_, i) => LANE_START_X + (i * (LANE_END_X - LANE_START_X)) / 36);
function ribbon(xs: readonly number[]): number[][] {
  return [...xs.map((x) => [x, laneY(x) + LANE_HALF]), ...[...xs].reverse().map((x) => [x, laneY(x) - LANE_HALF])];
}
const collinearRibbon = ribbon(samples);
const trimmedRibbon = ribbon(samples.filter((x, i) => i === 0 || i === samples.length - 1 || samples[i + 1]! > CURVE_START_X));
const bevelled = (shape: unknown): Params => ({ shape, depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 });

function publicMesh(params: Params): Mesh {
  const node = scene().add(primitives.extrude({ name: "ribbon", params })).toJSON().nodes[0];
  if (!node || node.kind !== "primitive") throw new Error("Expected an extruded primitive.");
  const mesh = qrPrimitiveMeshFor(node, { core: true, primitiveSegments: "full" });
  if (!mesh) throw new Error("Expected a primitive mesh.");
  return mesh;
}

interface Seams { readonly openEdges: number; readonly overusedEdges: number; readonly tJunctions: number }

/** Count edges not shared by exactly two triangles and vertices lying inside another edge. */
function seams(mesh: Mesh): Seams {
  const p = mesh.positions, key = (i: number): string => `${p[i * 3]},${p[i * 3 + 1]},${p[i * 3 + 2]}`;
  const uses = new Map<string, number>(), vertices = new Map<string, [number, number, number]>();
  for (let t = 0; t < p.length / 9; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = key(t * 3 + k), b = key(t * 3 + (k + 1) % 3);
      vertices.set(a, [p[(t * 3 + k) * 3]!, p[(t * 3 + k) * 3 + 1]!, p[(t * 3 + k) * 3 + 2]!]);
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      uses.set(edge, (uses.get(edge) ?? 0) + 1);
    }
  }
  let openEdges = 0, overusedEdges = 0, tJunctions = 0;
  const points = [...vertices.values()];
  for (const [edge, count] of uses) {
    if (count === 2) continue;
    if (count < 2) openEdges += 1; else overusedEdges += 1;
    if (count !== 1) continue;
    const [a, b] = edge.split("|").map((k) => vertices.get(k)!);
    const d = [b![0] - a![0], b![1] - a![1], b![2] - a![2]], dd = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2;
    for (const q of points) {
      const t = ((q[0] - a![0]) * d[0]! + (q[1] - a![1]) * d[1]! + (q[2] - a![2]) * d[2]!) / dd;
      if (t <= 1e-9 || t >= 1 - 1e-9) continue;
      const off = Math.hypot(a![0] + d[0]! * t - q[0], a![1] + d[1]! * t - q[1], a![2] + d[2]! * t - q[2]);
      if (off <= 1e-9 * Math.sqrt(dd) + 1e-12) tJunctions += 1;
    }
  }
  return { openEdges, overusedEdges, tJunctions };
}

function capArea(mesh: Mesh): number {
  const p = mesh.positions, count = mesh.groups![0]!.count;
  let area = 0;
  for (let i = 0; i < count; i += 3) {
    const ax = p[i * 3]!, ay = p[i * 3 + 1]!, bx = p[i * 3 + 3]!, by = p[i * 3 + 4]!, cx = p[i * 3 + 6]!, cy = p[i * 3 + 7]!;
    area += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
  }
  return area;
}

function signedCapAreas(mesh: Mesh): number[] {
  const p = mesh.positions, count = mesh.groups![0]!.count, out: number[] = [];
  for (let i = 0; i < count; i += 3) {
    const ax = p[i * 3]!, ay = p[i * 3 + 1]!, bx = p[i * 3 + 3]!, by = p[i * 3 + 4]!, cx = p[i * 3 + 6]!, cy = p[i * 3 + 7]!;
    out.push((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
  }
  return out;
}

describe("extruded caps conform to their walls", () => {
  it("closes the homepage ribbon seam when the straight run carries collinear points", () => {
    const mesh = publicMesh(bevelled(collinearRibbon));
    expect(seams(mesh)).toEqual({ openEdges: 0, overusedEdges: 0, tJunctions: 0 });
    // Like three.js ExtrudeGeometry, each cap uses every ring vertex: n - 2 triangles.
    expect(mesh.groups![0]!.count).toBe(2 * (collinearRibbon.length - 2) * 3);
  });

  it("matches the trimmed contour's silhouette, cap area and cap winding", () => {
    const full = publicMesh(bevelled(collinearRibbon)), trimmed = publicMesh(bevelled(trimmedRibbon));
    expect(seams(trimmed)).toEqual({ openEdges: 0, overusedEdges: 0, tJunctions: 0 });
    expect(full.bounds).toEqual(trimmed.bounds);
    expect(capArea(full)).toBeCloseTo(capArea(trimmed), 9);
    // Bottom cap faces -z, top cap +z; no degenerate slivers were introduced.
    const areas = signedCapAreas(full), half = areas.length / 2;
    expect(areas.slice(0, half).every((a) => a < 0)).toBe(true);
    expect(areas.slice(half).every((a) => a > 0)).toBe(true);
    expect(Math.min(...areas.map(Math.abs))).toBeGreaterThan(1e-9);
  });

  const square = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [3, 3], [1.5, 3], [0, 3], [0, 1.5]];
  const holed = { shape: square, holes: [[[1, 1], [1.5, 1], [2, 1], [2, 2], [1, 2]]] };
  const path = [[0, 0, 0], [0, 0, 2], [1, 0, 4]];
  const cases: readonly [string, ExtrudeParityParams][] = [
    ["flat walls", { shape: square, depth: 1, bevelEnabled: false }],
    ["bevel", { shape: square, depth: 1, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 3 }],
    ["bevel with offset", { shape: square, depth: 1, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelOffset: 0.05, bevelSegments: 2 }],
    ["negative depth", { shape: square, depth: -1, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 2 }],
    ["hole with collinear points", { shape: holed, depth: 1, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }],
    ["path sweep", { shape: square, extrudePath: path, steps: 3, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 2 }],
  ];
  for (const [label, params] of cases) {
    it(`is watertight with collinear ring points: ${label}`, () => {
      const mesh = extrudeParityMesh(params);
      expect(seams(mesh)).toEqual({ openEdges: 0, overusedEdges: 0, tJunctions: 0 });
      expect(mesh.uvs!.length / 2).toBe(mesh.positions.length / 3);
      expect(mesh.groups![0]!.count + mesh.groups![1]!.count).toBe(mesh.positions.length / 3);
    });
  }
});
