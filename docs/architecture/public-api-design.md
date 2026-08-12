# Aura3D 2.0 public API design rules

Status: current for Aura3D 2.0.0

These rules were derived from visible product defects. They govern new public
APIs and functional changes to existing surfaces.

## Publish local-axis and coordinate conventions

Any primitive, node, or transform with a non-obvious local orientation must
publish that convention as an exported constant. `AURA_PRIMITIVE_AXES` is the
reference. If callers need an axis convention to use an API correctly, it is
part of the API.

## A declared capability must work in every claimed render path

An exported factory must not produce a node that a claimed renderer silently
drops. A path-specific capability must be supported in each advertised path or
fail loudly where it cannot be honored. Implementation in one internal backend
does not establish a root-public capability.

## Evidence measures rendered output

Evidence must observe what was drawn, where it appeared, and whether it was
visible—not merely count authored descriptors. `AuraDiagnostics.labels`, for
example, reports projected pixel positions and visibility.

## Derive layout from asset facts

APIs that position or scale content relative to an asset take the asset or its
measured bounds. Routes do not freeze dimensions from an earlier asset.
Literal world coordinates are valid authored level-design decisions only when
documented as such.

## Validate tuning against its geometry

Systems accepting motion or timing values provide both a solver and a validator
that test those values in context. A merely solvable platform jump or combat
move can still be visibly wrong. `solvePlatformerMotion` with
`validatePlatformerMotion`, and `solveCombatFrameData` with
`validateCombatFrameData`, are the reference pairs.

## Report invariant violations

When a runtime detects an invalid spatial or state constraint, it reports a
machine-readable check with measured detail. Silent correction is reserved for
documented physical constraints such as contact clamping. Reports use the
shared `{ id, description, passes, detail }` shape.

## Fail at invalid input boundaries

Constructors and factories reject inputs that cannot produce valid output and
name the remedy. A plausible fallback that hides a caller bug is not acceptable.

## Publish both directions of a coordinate transform

An API converting coordinate spaces exposes forward and inverse transforms.
Callers must not reconstruct the inverse from private offsets or partially
published state.

## Lifecycle and naming conventions

| Concern | Convention |
| --- | --- |
| creation | `createX(options)` returning a `kind`-tagged object |
| derivation | `solveX(context, request)` |
| validation | `validateX(subject, limits)` returning `{ checks, passes }` |
| pure computation | `resolveX(...)` |
| measurement | `measureX(...)` |
| disposal | `dispose()` for GPU, worker, audio, or DOM ownership |
| reset | `reset(...)` returning a fresh snapshot |
| state | `snapshot()` for values; `telemetry()` for derived diagnostics |
| reports | `{ schema, checks, passes }` with a versioned schema |

New APIs follow this table. Existing surfaces converge when changed for a
functional reason; cosmetic naming churn alone is not a migration justification.

## Every public export needs a production consumer

An unused export is not a capability. Every public export requires a package,
example, template, or application consumer plus evidence at the capability
layer being claimed. Otherwise it is completed, made internal, deprecated with
a tested migration, or removed in the next eligible major version.
