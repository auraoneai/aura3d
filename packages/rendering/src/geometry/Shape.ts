/**
 * threejs-parity (§5.2, lane L2-02) — `ShapeGeometry` verbatim port.
 *
 * The contour must be CW in three's winding convention (reversed when
 * `!isClockWise`), holes CCW (reversed when CW); earcut triangulates the
 * joined index space (contour, then holes in order). Vertices (x,y,0),
 * normals (0,0,1), "world" UVs (x,y). Indexed output.
 */

import { Vector2 } from "@aura3d/math";
import { isClockWise, removeDupEndPts, resolveShape2D, triangulateShape } from "./Support";
import type { ParityMesh } from "./Support";

export interface ShapeParityParams {
  readonly shape: unknown;
  readonly curveSegments?: number;
}

export function shapeParityMesh(params: ShapeParityParams): ParityMesh {
  const curveSegments = params.curveSegments ?? 12;
  const resolved = resolveShape2D(params.shape, curveSegments);

  const indices: number[] = [];
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const indexOffset = vertices.length / 3;
  let shapeVertices: Vector2[] = [...resolved.shape];
  const shapeHoles: Vector2[][] = resolved.holes.map((hole) => [...hole]);

  if (isClockWise(shapeVertices) === false) {
    shapeVertices = [...shapeVertices].reverse();
  }
  for (let i = 0, l = shapeHoles.length; i < l; i += 1) {
    if (isClockWise(shapeHoles[i]!) === true) {
      shapeHoles[i] = shapeHoles[i]!.reverse();
    }
  }

  // three's ShapeUtils.triangulateShape strips a repeated closing point from the arrays it is given, so
  // the vertices emitted below exclude it too.
  removeDupEndPts(shapeVertices);
  for (const hole of shapeHoles) removeDupEndPts(hole);

  const faces = triangulateShape(shapeVertices, shapeHoles);

  let all: Vector2[] = shapeVertices;
  for (const hole of shapeHoles) {
    all = all.concat(hole);
  }

  for (const vertex of all) {
    vertices.push(vertex.x, vertex.y, 0);
    normals.push(0, 0, 1);
    uvs.push(vertex.x, vertex.y);
  }

  for (const face of faces) {
    indices.push(face[0]! + indexOffset, face[1]! + indexOffset, face[2]! + indexOffset);
  }

  return { positions: vertices, normals, uvs, indices };
}
