/**
 * Public oriented-box implementation and compatibility notes.
 *
 * The independent contract treats boxes as closed values. Box fields are
 * readonly in TypeScript, and box-returning methods leave their receiver
 * unchanged. The default is a point at the origin with an identity frame;
 * construction and `set` retain their arguments, while `clone` and `copy`
 * clone them. Touching
 * counts as intersection. `intersectsOBB` and `equals` default to an absolute
 * tolerance of 1e-12; pass zero to request no explicit tolerance. A ray starting
 * inside the box returns the forward exit surface. Plane intersections use
 * Aura's `Plane.distanceToPoint` signed-distance convention.
 *
 * Invalid or non-finite components, negative half sizes, non-orthonormal
 * frames, arithmetic overflow, converting an empty Box3, non-affine transforms
 * and nonrepresentable shear throw RangeError. Empty Box3 and empty sphere
 * intersection queries return false. Collinear dimensions can collapse under
 * a singular affine transform. Accepted nearly orthogonal frames are
 * orthonormalized for queries. These edge semantics are the new independent
 * contract; equivalence to earlier releases has not been established.
 *
 * See the class documentation for numerical tolerances and transform limits.
 */
export { OBB } from "./independent/OrientedBox.js";
