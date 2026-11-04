/**
 * `@aura3d/math/three`: mutable, three.js-compatible math classes.
 *
 * The classes in `@aura3d/math` are immutable value types; every method returns a new
 * instance. three.js code is written against mutating methods that return `this`
 * (`v.add(w);` changes `v`), so this subpath ships the same method sets with the same
 * mutation, `target` out-parameter and `null`-miss semantics. Numerics are checked against
 * an independent CPU reference (tests/unit/math/three-compat-parity.test.ts,
 * tests/support/independent-math-reference.mjs). Existing `@aura3d/math` classes are
 * unchanged; cross between the two with the `fromImmutable(v)` and `toImmutable()`
 * methods on each class.
 *
 * The method names and semantics mirror the three.js r185 API (MIT) so existing code ports unchanged;
 * no three.js source is included.
 *
 * Every class is implemented by Aura3D's independent mutable modules
 * (`../independent/mutable/*`); this subpath only re-exports them. Projection
 * accepts numeric WebGL/WebGPU clip-space identifiers and explicit depth ranges
 * (`Matrix4.makePerspectiveForDepthRange`, `makeOrthographicForDepthRange`,
 * `Frustum.setFromProjectionMatrixDepthRange`); mutable-to-immutable conversions
 * have the representation limits documented in `../independent/mutable/index.ts`.
 */
export * from "../independent/mutable/index.js";
