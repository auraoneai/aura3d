/**
 * Public convex hull. The implementation is Aura3D's independently authored
 * hull in `independent/ConvexHull.ts` (documented there); this module only
 * re-exports it. In 5.0 the hull accepts structural points and rays
 * (`HullPoint3`, `HullRayLike`) and returns frozen `HullVector3` values rather
 * than `Vector3` instances; see the 4.x to 5.0 migration notes.
 */
export { ConvexHull, ConvexHullFace, HalfEdge, VertexNode, VertexList } from "./independent/ConvexHull.js";
