import type { Vector2 } from "./Vector2.js";
import {
  earcut as triangulateFlat,
  isClockWise as polygonIsClockWise,
  shapeArea as polygonArea,
  triangulateShape as triangulatePolygon,
} from "./independent/PolygonTriangulation.js";

/**
 * Polygon utilities backed by Aura3D's independent triangulator.
 *
 * Coordinates must be finite. Triangulation accepts simple contours with
 * disjoint holes strictly inside the contour; crossings and touches throw.
 * Empty or collinear contours produce no faces and collinear holes are ignored.
 * Up to 4,096 holes are accepted, and an eight-million-predicate budget bounds
 * triangulation. Large convex rings and some concave rings use certified fast
 * paths; other valid complex inputs can still exceed the predicate budget.
 * Area and winding queries do not use the triangulation budget.
 *
 * Triangles wind counterclockwise in XY. Shape indices refer to the contour
 * followed by its holes, after removing one repeated closing point from each
 * ring. Flat-data indices refer to the original, unmodified vertex array.
 */
export function earcut(data: ArrayLike<number>, holeIndices: readonly number[] | null, dim: number = 2): number[] {
  return triangulateFlat(data, holeIndices, dim);
}

export function shapeArea(contour: readonly Vector2[]): number {
  return polygonArea(contour);
}

export function isClockWise(pts: readonly Vector2[]): boolean {
  return polygonIsClockWise(pts);
}

export function triangulateShape(contour: readonly Vector2[], holes: readonly (readonly Vector2[])[]): [number, number, number][] {
  return triangulatePolygon(contour, holes);
}

export const ShapeUtils = {
  area: shapeArea,
  isClockWise,
  triangulateShape,
} as const;
