# Aura3D public API design rules

Derived from the API defects this remediation exposed. Each rule exists because its
absence produced a visible product failure, named alongside it.

## 1. Publish local axis and coordinate conventions

**Defect it prevents:** the configurator's focus indicator rendered as a flat bar.
Aura3D's torus is a ring in local XY with its tube on Z. Nothing said so, so a route
scaled `[1.22, 0.08, 0.78]` — thinning the ring's own radius rather than its tube — and
the following rotation laid the sliver flat.

**Rule:** any primitive, node or transform with a non-obvious local orientation must
publish that convention as an exported constant, not describe it in a comment.
`AURA_PRIMITIVE_AXES` is the reference implementation. If a caller has to know an axis
convention to use an API correctly, the convention is part of the API.

## 2. A declared capability must work in every render path

**Defect it prevents:** `labels.callout(...)` never rendered in any public route. Labels
were drawn only by the canvas2d fallback; every typed-GLB route takes the production
WebGL2 path, which ignored `kind: "label"` entirely.

**Rule:** an exported factory must not be able to produce a node that some render path
silently drops. When a capability is path-specific, the API must either surface it in
every path or fail loudly in paths that cannot honour it. "Implemented in one backend" is
not implemented.

## 3. Evidence must measure the rendered result, not the authored intent

**Defect it prevents:** the same one. `collectAuraSceneEvidence` counted label *nodes*, so
every report showed labels present while the screen showed none.

**Rule:** when evidence exists for a capability, it must observe the output. Count what
was drawn and where, not what was requested. `AuraDiagnostics.labels` reports projected
pixel positions and visibility for exactly this reason.

## 4. Derive from asset facts; never freeze an asset's dimensions

**Defect it prevents:** `CAR_SCENE_HEIGHT` was hardcoded to one car's bounds ratio and
survived two hero-asset swaps, mis-seating each replacement. Digital Twin's helper
geometry sat at literal coordinates unrelated to the loaded workcell.

**Rule:** any API that positions or scales something relative to an asset must take the
asset (or its measured bounds) rather than a number derived from it. Provide the derivation
so a route never needs the dimension. Literal world coordinates are legitimate only as
level-design decisions, and must be commented as such.

## 5. A tuning API must validate its values against the geometry they act on

**Defect it prevents:** Skyline shipped a jump with a 1.245-unit apex over 0.216-unit
platform steps — a 5.76x overshoot that reads as floating. The level was *solvable*, so
every gate passed. Aura Clash shipped 12–32 active frames against 4–5 recovery frames,
inverted from any real fighting game, and nothing checked frame data as frame data.

**Rule:** where a system accepts tuning values, ship a solver that derives them and a
validator that rejects values inconsistent with their context. Solvability is not
correctness: an over-powered value clears every obstacle and still looks wrong.
`solvePlatformerMotion`/`validatePlatformerMotion` and
`solveCombatFrameData`/`validateCombatFrameData` are the reference pair.

## 6. Report invariants; do not silently correct

**Defect it prevents:** the racing kit pulled an off-track car back toward the
centreline, which reads as the car being dragged rather than driving, and hid the fact
that it had left the road.

**Rule:** when a system detects a violated constraint, publish it as a machine-checkable
check with a measured detail string. Correct silently only where the correction is the
documented physical behaviour — ground contact clamping in the vehicle chassis is a
constraint, not a fix. `checkSpatialInvariants`, `FocusInvariantReport`,
`PlatformerMotionReport` and `CombatFrameReport` share one shape:
`{ id, description, passes, detail }`.

## 7. Fail loudly on inputs that cannot produce valid output

**Defect it prevents:** a route passed a nonexistent `routeGeometry.length`, the driver
computed a NaN look-ahead, and the failure surfaced as
`Cannot read properties of undefined (reading 'x')` deep inside the renderer.

**Rule:** validate at construction and throw with the fix in the message. Substituting a
plausible default hides the caller's bug behind plausible-looking behaviour.
`createVehicleDriverAi` refuses a non-positive route length and names the remedy.

## 8. Expose the inverse of every coordinate transform

**Defect it prevents:** the vehicle chassis needed scene-XZ-to-game-plane conversion.
`racingSceneBinding` exposed only the forward direction, so the route began
reconstructing the transform from a `transform` object plus an offset the binding did not
publish — a second, slightly different copy of the engine's own coordinate mapping.

**Rule:** if an API converts between coordinate spaces, publish both directions.
`toScenePoint` now has `toGamePoint`.

## 9. Consistent lifecycle and naming

Observed inconsistencies to converge on:

| Concern | Convention | Currently violated by |
| --- | --- | --- |
| Creation | `createX(options)` returning a `kind`-tagged object | Some subsystems export classes, some builders, some plain factories |
| Derivation | `solveX(context, request)` | New in this pass |
| Validation | `validateX(subject, limits)` returning `{ checks, passes }` | New in this pass |
| Resolution | `resolveX(...)` for pure computation | Consistent |
| Measurement | `measureX(...)` for reading facts off data | Consistent |
| Disposal | `dispose()` on anything holding GPU or DOM resources | Consistent within the agent API |
| Reset | `reset(...)` returning the fresh snapshot | Consistent within game kits |
| State reading | `snapshot()` for a value copy, `telemetry()` for derived diagnostics | New in this pass |
| Reports | `{ schema, checks, passes }` with a versioned schema string | New in this pass |

**Rule for new APIs:** use the table. **Rule for existing APIs:** do not churn them for
consistency alone; document the migration and converge when the surface is next changed
for a functional reason.

## 10. An unused public export is not a capability

**Defect it prevents:** `@aura3d/engine-runtime` publishes 322 exports with no tests and
no consumers, duplicating eight workflow factories, `GLTFLoader`, `Engine` and
`createA3DApp` from the packages that own them.
`apps/aura-clash-showcase/src/fighters/HitboxSystem.ts` implements a complete
hit-resolution model that nothing calls.

**Rule:** every public export needs a consumer — an example, a route, or another package.
An export with none is incomplete, misleading or dead, and must be completed, made
internal, or removed. The parity generator enforces the same standard: a capability with
no production consumer cannot claim parity.
