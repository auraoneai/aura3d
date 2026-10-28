/**
 * `@aura3d/math/three`: mutable, three.js-compatible math classes.
 *
 * The classes in `@aura3d/math` are immutable value types; every method returns a new
 * instance. three.js code is written against mutating methods that return `this`
 * (`v.add(w);` changes `v`), so this subpath ships the same method sets with the same
 * mutation, `target` out-parameter and `null`-miss semantics. Numerics are proven against
 * goldens generated from three@0.185.1 (tests/unit/math/three-compat-parity.test.ts).
 * Existing `@aura3d/math` classes are unchanged; cross between the two with the
 * `fromImmutable(v)` and `toImmutable()` methods on each class.
 *
 * The method bodies follow the three.js r185 reference implementation
 * (MIT License, Copyright (c) 2010-2025 three.js authors).
 */
export { Vector2, type Vector2Like, type BufferAttributeLike2 } from "./Vector2.js";
export { Vector3, type Vector3Like, type BufferAttributeLike3, type ProjectionCameraLike } from "./Vector3.js";
export { Vector4, type Vector4Like, type BufferAttributeLikeW } from "./Vector4.js";
export { Matrix3 } from "./Matrix3.js";
export { Matrix4, WebGLCoordinateSystem, WebGPUCoordinateSystem } from "./Matrix4.js";
export { Quaternion, type QuaternionLike, type EulerLike, type EulerOrder, type BufferAttributeLike4 } from "./Quaternion.js";
export { Euler } from "./Euler.js";
export {
  Color,
  ColorManagement,
  COLOR_KEYWORDS,
  SRGBToLinear,
  LinearToSRGB,
  NoColorSpace,
  SRGBColorSpace,
  LinearSRGBColorSpace,
  LinearTransfer,
  SRGBTransfer,
  type ColorLike,
  type HSL,
  type RGB
} from "./Color.js";
export { Box3, type Box3Like, type Box3ObjectLike, type TriangleLike, type PositionAttributeLike } from "./Box3.js";
export { Sphere, type SphereLike } from "./Sphere.js";
export { Plane, type PlaneLike, type Line3Like } from "./Plane.js";
export { Ray, type RayLike } from "./Ray.js";
export { Frustum, type FrustumLike } from "./Frustum.js";
export { Triangle, type TriangleCornersLike } from "./Triangle.js";
