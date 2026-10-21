export * from "./Vector2.js";
export * from "./Vector3.js";
export * from "./Vector4.js";
export * from "./Matrix3.js";
export * from "./Matrix4.js";
export * from "./Quaternion.js";
export * from "./Euler.js";
export * from "./Color.js";
// three.js exposes `MathUtils` as a namespace; several member names collide
// with Interpolation.ts (`clamp`, `lerp`, `inverseLerp`, `smoothstep` — with
// different argument order/semantics), so keep the namespace surface and
// re-export only the non-conflicting helpers at top level.
export * as MathUtils from "./MathUtils.js";
export {
  generateUUID,
  euclideanModulo,
  mapLinear,
  damp,
  pingpong,
  smootherstep,
  randInt,
  randFloat,
  randFloatSpread,
  seededRandom,
  degToRad,
  radToDeg,
  isPowerOfTwo,
  ceilPowerOfTwo,
  floorPowerOfTwo
} from "./MathUtils.js";
export * from "./Line3.js";
export * from "./Triangle.js";
export * from "./Spherical.js";
export * from "./Cylindrical.js";
export * from "./Ray.js";
export * from "./Plane.js";
export * from "./Box3.js";
export * from "./Sphere.js";
export * from "./Frustum.js";
export * from "./ShapeUtils.js";
export * from "./SphericalHarmonics3.js";
export * from "./OBB.js";
export * from "./Capsule.js";
export * from "./ConvexHull.js";
export * from "./Octree.js";
export * from "./Transform.js";
export * from "./Interpolation.js";
export * from "./Easing.js";
export * from "./Random.js";
export * from "./Curves.js";
