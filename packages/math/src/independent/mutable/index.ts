/**
 * Source entry for the independent mutable math classes. The public
 * `@aura3d/math/three` subpath re-exports it (packages/math/src/three/index.ts).
 *
 * Projection supports numeric WebGL/WebGPU clip-space identifiers and explicit
 * depth ranges through
 * `Matrix4.makePerspectiveForDepthRange`, `Matrix4.makeOrthographicForDepthRange`,
 * and `Frustum.setFromProjectionMatrixDepthRange`. On those explicit entries,
 * reversed depth exchanges the near and far endpoints of the selected clip-space
 * interval. The numeric-identifier entries (`makePerspective`, `makeOrthographic`,
 * `Frustum.setFromProjectionMatrix`) keep the 4.x convention: reversed depth maps
 * near to 1 and far to 0 for either identifier.
 *
 * Mutable-to-immutable conversions have representation limits: Color drops
 * alpha on `fromImmutable` and `toImmutable` defaults alpha to 1; Ray conversion
 * normalizes a nonzero direction and rejects a zero direction, changing the
 * distance represented by its parameter. Plane conversion normalizes its
 * normal and constant and rejects a zero normal. Triangle currently provides
 * `fromImmutable` only. Vector and quaternion `random` methods use `Math.random`.
 */
import { ColorManagement as candidateColorManagement } from "./Color.js";

// Give downstream declaration emit a name for this inferred object type. Its
// spaces reference a module-private interface in Color.ts; the named interface
// preserves the complete candidate surface and the original object identity.
export interface ColorManagementApi extends Omit<typeof candidateColorManagement, never> {}
export const ColorManagement: ColorManagementApi = candidateColorManagement;

export { Vector2, type Vector2Like, type BufferAttributeLike2 } from "./Vector2.js";
export { Vector3, type Vector3Like, type BufferAttributeLike3, type ProjectionCameraLike } from "./Vector3.js";
export { Vector4, type Vector4Like, type BufferAttributeLikeW } from "./Vector4.js";
export { Matrix3 } from "./Matrix3.js";
export { Matrix4, WebGLCoordinateSystem, WebGPUCoordinateSystem, type ProjectionDepthRange } from "./Matrix4.js";
export { Quaternion, type QuaternionLike, type EulerLike, type EulerOrder, type BufferAttributeLike4 } from "./Quaternion.js";
export { Euler } from "./Euler.js";
export {
  Color,
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
