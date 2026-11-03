/**
 * Opt-in entry for Aura3D's independently authored convex hull, registered as
 * `@aura3d/engine/v5/math/hull`. Installed-package ESM and declarations must
 * still be verified against a built candidate. It does not replace the 4.x math entry.
 *
 * The hull accepts finite points and represents empty, point, segment, planar,
 * and solid inputs. Construction is bounded to 100,000 input points, 8,192
 * distinct points, and 25 million face tests; invalid coordinates, exceeded
 * bounds, and detected numerical or topology failures throw RangeError. A ray
 * whose origin is more than 2^48 hull scales from the center also throws.
 * Construction uses a scale-relative degeneracy threshold rather than exact
 * predicates. Containment and ray queries use a finite non-negative public
 * tolerance with a small scale-relative numerical floor; solid ray hits use
 * the tolerance-expanded supporting planes.
 *
 * Faces and their edge graph are snapshots of the last successful build.
 * Queries reject edited face snapshots; call compute() after changing vertices
 * or setFromPoints() to rebuild. Empty, detached, and unlinked list, vertex,
 * edge, and face references are nullable in both the types and runtime values.
 * List mutations enforce ownership. These explicit semantics are not a claim
 * of full behavioral compatibility with the 4.x hull.
 *
 * HullPoint3 and HullRayLike are structural input contracts. HullVector3 and
 * HullRay are small, frozen hull-specific values, not the 4.x Vector3 and Ray
 * classes. HullRay copies its inputs, requires finite components and a nonzero
 * direction, and retains the direction's magnitude. Hull intersection returns
 * HullVector3 values; it does not provide the full 4.x vector method surface.
 */
export { HullVector3, HullRay, type HullPoint3, type HullRayLike } from "./HullPrimitives.js";
export { ConvexHull, ConvexHullFace, HalfEdge, VertexNode, VertexList } from "./ConvexHull.js";
