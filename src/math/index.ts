/**
 * @module Math
 * @description
 * Comprehensive mathematics library for 3D graphics and game development.
 *
 * This module provides a complete suite of mathematical primitives and utilities optimized
 * for graphics programming, physics simulation, and game logic. Key features include:
 *
 * **Core Types:**
 * - Vector types (Vector2, Vector3, Vector4) with full operator support
 * - Matrix types (Matrix3, Matrix4) for transformations
 * - Quaternions for robust 3D rotations
 * - Color representation with multiple color spaces
 *
 * **Geometry Primitives:**
 * - Bounding volumes (Box3, Sphere)
 * - Geometric shapes (Plane, Ray, Rect)
 * - View frustum for culling operations
 *
 * **Utilities:**
 * - Mathematical constants and common operations
 * - Interpolation functions (linear, cubic, bezier)
 * - Easing functions for animations
 * - Random number generation with seeding support
 * - Spline curves for smooth paths
 *
 * All types are designed for performance with minimal allocations and SIMD-friendly layouts.
 *
 * @example
 * ```typescript
 * import { Vector3, Matrix4, Quaternion } from './math';
 *
 * // Create a transformation
 * const position = new Vector3(0, 10, 0);
 * const rotation = Quaternion.fromEuler(0, Math.PI / 2, 0);
 * const transform = Matrix4.compose(position, rotation, Vector3.one());
 *
 * // Transform a point
 * const point = new Vector3(1, 0, 0);
 * const transformed = transform.transformPoint(point);
 * ```
 */

// Constants and utilities
export * from './MathConstants';
export * from './Interpolation';
export * from './Easing';
export * from './RandomMath';

// Vector types
export { Vector2 } from './Vector2';
export { Vector3 } from './Vector3';
export { Vector4 } from './Vector4';
export { Color } from './Color';

// Matrix types
export { Matrix3 } from './Matrix3';
export { Matrix4 } from './Matrix4';
export { Quaternion } from './Quaternion';

// Geometry primitives
export { Rect } from './Rect';
export { Box3 } from './Box3';
export { Sphere } from './Sphere';
export { Plane } from './Plane';
export { Ray } from './Ray';

// Advanced math
export { Frustum } from './Frustum';
export { Transform } from './Transform';
export { Spline, SplineType } from './Spline';

/**
 * CatmullRomSpline is a type alias for Spline.
 * Use Spline.fromCatmullRom() factory method or create a Spline with SplineType.CATMULL_ROM.
 *
 * @example
 * ```typescript
 * const spline = Spline.fromCatmullRom(points, 0.5);
 * // or
 * const spline = new CatmullRomSpline(points);
 * spline.type = SplineType.CATMULL_ROM;
 * ```
 */
export { Spline as CatmullRomSpline } from './Spline';
