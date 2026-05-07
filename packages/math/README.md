# @galileo3d/math

`@galileo3d/math` owns deterministic engine math primitives used by runtime packages without depending on browser, rendering, scene, physics, or ECS packages.

## Public API

- `Vector2`, `Vector3`, `Vector4`: immutable vector operations and finite-value validation.
- `Matrix3`, `Matrix4`: matrix construction, multiplication, inversion, projection, and transform helpers.
- `Quaternion`: rotations, normalization, interpolation, and matrix conversion.
- `Color`: linear/color utility data.
- `Ray`, `Plane`, `Box3`, `Sphere`, `Frustum`: geometry queries, bounds, intersections, and containment.
- `Transform`: position/rotation/scale composition helpers.
- `Interpolation`, `Easing`: scalar interpolation and easing curves.
- `Random`: deterministic seeded random number generation.

## Verification

Vector, matrix, quaternion, bounds, ray, frustum, transform, interpolation, easing, and deterministic random behavior are covered by `tests/unit/math/vector-matrix.test.ts` and `tests/unit/math/geometry-random.test.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.
