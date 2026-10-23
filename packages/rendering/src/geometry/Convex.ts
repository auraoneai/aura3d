/**
 * threejs-parity (§5.2, lane L2-07) — `ConvexGeometry` verbatim port.
 *
 * QuickHull over the input points (`@aura3d/math` `ConvexHull`, itself a port
 * of three's), then each face's half-edge loop is walked and every head vertex
 * emitted with the face normal — a non-indexed triangle list with flat
 * normals, in three's exact vertex order.
 */

import { ConvexHull, Vector3 } from "@aura3d/math";
import type { ParityMesh } from "./Support";

export type ConvexPointInput = readonly [number, number, number] | { readonly x: number; readonly y: number; readonly z: number };

export interface ConvexParityParams {
  readonly points: readonly ConvexPointInput[];
}

export function convexParityMesh(params: ConvexParityParams): ParityMesh {
  const points = params.points.map((p) => (Array.isArray(p) ? new Vector3(p[0], p[1], p[2]) : new Vector3((p as { x: number }).x, (p as { y: number }).y, (p as { z: number }).z)));
  const hull = new ConvexHull().setFromPoints(points);
  const positions: number[] = [];
  const normals: number[] = [];
  for (const face of hull.faces) {
    const start = face.edge!;
    let edge = start;
    do {
      const point = edge.head().point;
      positions.push(point.x, point.y, point.z);
      normals.push(face.normal.x, face.normal.y, face.normal.z);
      edge = edge.next!;
    } while (edge !== start);
  }
  return { positions, normals };
}
