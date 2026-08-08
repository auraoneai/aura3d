# ADR 0009: Runtime descriptors cannot claim capabilities

- **Date:** 2026-08-08
- **Status:** accepted
- **Workstream:** WS-2.6

## Decision

Public runtime packages may contain implemented runtime behavior, public data
contracts consumed by implemented behavior, or typed evidence derived from
mounted behavior. Deterministic sample objects whose boolean fields merely say
a capability exists are test fixtures, not runtime features. They must move to
tests or be deleted after R8 proof. If a `*Fixtures` module contains a useful
algorithm, extract only that algorithm under an honest runtime name.

The first applied case removes `InputActionBindingFixtures`: the real
`processInputValue` algorithm moves to `InputValueProcessors`, while the sample
object that asserted action/rebinding parity is deleted.

The asset batch removes `AssetBundleCacheFixtures` and `SceneAnalysisFixtures`.
The asset viewer now reports only behavior it actually mounts: glTF loading,
dependency resolution, inspection, render-resource creation, texture decoding,
material variants, morph targets, animation controls, and captured WebGL pixels.
It no longer turns deterministic metadata into cache, computer-vision,
segmentation, detection, tracking, or pose capability claims.

## Evidence

`tests/reports/public-runtime-descriptor-inventory/report.json` is the complete
classification and migration queue. Per-file deletion reports are retained for
each cleared batch.
