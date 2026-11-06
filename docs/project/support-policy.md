# Support policy

Version: 5.0.3

Current release: Aura3D 5.0.3, the major release carrying the
native-capability work ([4.x to 5.0 migration guide](../migration/4-to-5.md)).

This policy applies to the package versions and export maps in a release, not
just to files present in a source checkout. The current source release line is
Aura3D **5.0.3**, as recorded in the package manifests and changelog. The latest
published patch in the current release line is the supported maintenance
release. Older releases are superseded; update to that patch before reporting
an issue when practical. The immediately preceding supported release is retained
as the compatibility baseline for a new candidate, not a promise of backports or
an additional supported release line. An actual registry publication and its
availability must be verified separately from the version in this repository.

Support wording and public-release notes are governed by `docs/project/product-studio-claim-registry.md`.

## Scope and status

- **Stable:** documented, non-experimental public package exports and CLI
  behavior in the supported release, subject to the version and compatibility
  rules in [API stability policy](../api/stability-policy.md). Package root and
  exported subpaths have distinct contracts; source files and internal paths are
  not automatically supported interfaces.
- **Deprecated:** still available for the announced window, with the replacement
  and removal target documented. New consumers should use the replacement. The
  [root export list](../api/root-exports.md) and release notes identify existing
  4.x deprecations planned for removal in 5.0.0.
- **Experimental:** explicitly marked APIs or packages can change across minor
  releases, with migration notes. For example, [`@aura3d/react`](../../packages/react/README.md)
  remains experimental; its declared React 18 and 19 peer ranges do not alone
  prove SSR, hydration or browser lifecycle coverage.
- **Evidence-limited:** browser, hardware, backend, file format, asset and
  template support is limited to the exact combinations and behaviors recorded
  in [compatibility](compatibility.md), [known limits](status/known-limits.md)
  and their linked evidence. A source test, scaffold or software renderer does
  not establish real-device support or a complete ecosystem compatibility claim.

Current support includes package installation and documented public APIs,
templates shipped by `create-aura3d`, and reproducible failures in repository
examples or report tools. A local `apps/` route is a development artifact unless
it is separately deployed and verified. Changes to example artwork or project
internals do not themselves constitute public API compatibility guarantees.

## Deprecation and compatibility window

Stable APIs are deprecated with a notice, replacement or migration path, and
intended removal version. Removal in a major release requires a deprecation in
a published release of a prior major: a notice introduced in 5.x, for example,
cannot justify removal in 5.0.0. APIs remain available through the major in
which they were deprecated. The 4.x root values and legacy subpaths announced
for removal in 5.0.0 were removed in 5.0.0 ([migration guide](../migration/4-to-5.md), B14 and B15).
Other incompatible major changes also require a recorded migration. Renamed
scaffolder template aliases are a separately documented CLI exception: their
warning states removal in the next minor. Experimental surfaces and unsupported
internal imports do not carry the stable API window.

Compatibility is checked against packed declarations, exported conditions and
prior consumers, not merely workspace source. A combination is supported only
when the package condition exists and the applicable tests and evidence cover
it. The [API stability policy](../api/stability-policy.md) defines patch, minor
and major rules and the required major migration record.

## Reporting and ownership

Open a repository issue with a minimal reproduction, installed package and peer
versions, package manager and lockfile, expected and actual behavior, relevant
error or redacted diagnostics, and browser, OS and backend when applicable. For
asset failures include the asset type, provenance and non-secret request details;
for visual behavior include a screenshot or route-health report when available.
Do not include credentials, signed URLs or private headers.

Triage routes the issue to the maintainer of the affected package, CLI/template,
documentation or example, with renderer/backend and asset owners involved when
those boundaries intersect. Security reports follow the
[security policy](security-policy.md) rather than a public issue. A compatibility
baseline or an issue being accepted for triage does not imply a response-time
SLA, device coverage or a backport commitment.
