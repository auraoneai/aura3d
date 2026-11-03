# API stability and versioning

This policy describes the compatibility target for the supported Aura3D release
line. The exact available exports, peer ranges and module conditions are the
ones in each installed package's manifest and declarations. A generated API
reference is an inventory, not evidence that every renderer feature works on
every device. See the [support policy](../project/support-policy.md) for release
status and [claim boundaries](../agents/claims-and-boundaries.md) for evidence
requirements.

## What is public

A public API consists of documented, non-experimental values, types, subpaths,
CLI interfaces and module conditions explicitly exported by a published
package. A type-only export does not imply a runtime value; `import`, `browser`,
`types` and `require` are separate conditions. The existence of an ESM entry
does not promise CommonJS support. Undocumented filesystem paths, source
internals, test utilities and files excluded by `exports` are not stable API.
An explicitly experimental API or package is labeled as such and may change
in a minor release with a migration note.

## Release rules

- **Patch:** preserve stable source and runtime compatibility. Fixes may correct
  documented defects or reject inputs that were explicitly unsupported; release
  notes identify observable changes.
- **Minor:** add compatible public capabilities and deprecation notices while
  preserving existing stable consumers. Do not remove a stable value, type,
  subpath or declared module condition, add a required parameter, narrow accepted
  input, or change a lifecycle guarantee incompatibly.
- **Major:** incompatible changes are permitted only with the migration record
  below. The next planned major is 5.0.0; the existing documented deprecated root
  names and legacy subpaths remain available through the 4.x line.

Compatibility is assessed across declarations and behavior: overloads, generic
constraints, union members, optional fields, return types, supported module
resolution and peer ranges can break a consumer even if the exported name remains.
Adding an output union member, for example, can break an exhaustive consumer.
Likewise an unchanged signature does not excuse a change in documented defaults,
ownership or error behavior. The release check must compare the packed candidate
with verified declarations and export conditions from the immediately preceding
supported release, then exercise representative untouched consumers. Missing
inputs, skipped required checks or an unverified archive do not count as a pass.

JavaScript packages do not promise a native binary ABI. Here runtime compatibility
means the previously supported import condition resolves and the documented
JavaScript behavior remains compatible; source compatibility means supported
TypeScript consumers still compile against the shipped declarations. Device
support, browser features, peer packages, workers and codecs remain bounded by
their declared conditions and tested environments, not by the version number
alone.

## Deprecation window

A stable API deprecation identifies its first deprecated release, replacement
or reason no replacement exists, and earliest removal major in release notes or
reference documentation. Removal in a major requires a deprecation in a
published release of a prior major; a notice introduced in 5.x cannot justify
removal in 5.0.0. The API remains available through the major in which it was
deprecated. Existing 4.x root names and legacy subpaths already announced for
removal in 5.0.0 keep that target. Scaffolder
aliases have a narrower, explicit one-minor window and issue a warning with the
new template name. Experimental APIs may change in a minor release, but their
status and changes must be documented; patch releases should not silently break
them.

## Lifecycle and ownership

The documented lifetime, cleanup, cancellation, retry, readiness and error
behavior of a stable public API is part of its compatibility contract. A
consumer should release resources through the owning handle, call `app.dispose()`
when a mounted app is no longer needed, and unsubscribe callbacks whose API
returns an unsubscribe function. APIs that allocate optional or asynchronous
resources must document which owner releases them and what cancellation and
failure mean. Do not assume that a settled promise means a renderer drew a
frame: the existing non-strict `app.ready()` can settle after a failed mount;
inspect diagnostics. `strict: true` makes a mount failure reject that operation.
A new success/failure readiness contract must preserve or explicitly migrate
that existing behavior.

## Major migration record

Before a major release, publish a per-change list identifying the old package,
subpath and symbol, the deprecation notice and earliest removal version, the
replacement and behavioral or type differences, and a before/after migration
example where one exists. Explain changed defaults, lifecycle and ownership,
module conditions, peer requirements and supported environment limits. Record
intentional removals without replacements and provide actionable diagnostics
where runtime migration is possible. Record other incompatible major changes
and their migrations even when no symbol is removed. The candidate comparison
and prior-consumer results must identify the exact previous and candidate
archives; a major label is not permission to hide unreviewed breaks or bypass
checks.
