# Aura3D 3.0.1 candidate release notes

Status: implementation and verification in progress; unpublished candidate.

This patch addresses the uncovered requirements recorded in the
[3.0.1 remediation PRD](../../muse3jsparity-3.0.1-PRD.md). The PRD is the
completion ledger; these notes do not certify completion or publication.

## Candidate change areas

| Surface | Work under verification | Required release evidence |
| --- | --- | --- |
| `createAuraApp` root safe API | Awaitable frames and disposal; temporal postprocess bindings; typed extension maps; label placement | Root-only browser pixels, negative controls, resource lifecycle and context recovery |
| `rendering` package / `production-runtime` | Native WebGPU TAA, reflection pass execution, concrete framegraph stages | Backend-specific rendered outputs, resource ownership and disabled-stage controls |
| `createAuraApp` root safe API and animation packages | Translated root-motion consumption, physics/navigation authority and foot planting | Real translated clip, per-rig pose/slip measurements and browser integration |
| Controls package and root route integration | Orbit/Map damping, cursor zoom, gesture cancellation and disposal | Actual input across projection types and frame rates |
| Product routes | Crowd GLB instancing/LOD, camera and spotlight adoption, hero framing | Actual route health, desktop/mobile captures, gameplay tests and independent review |
| CLI asset pipeline and package decoders | Decoder alignment and retained typed fixture provenance | Installed-version alignment plus real decode/fixture results |
| Release tooling | Complete requirement coverage, fail-closed gates, immutable receipts and exact package lineage | Fresh full aggregate run and exact-installed package/scaffold lifecycles |

## Measured outcomes

These are the measured comparisons the candidate currently holds, reported with
both directions rather than wins alone. Each number is the retained receipt's
value, not a summary or a projection.

Measured win: the `@aura3d/lean` core primitive critical path compresses to `77458` gzip bytes against its 80,000-byte budget, from `tests/reports/bundle-size.json`.

Measured loss: the compatibility-root observation bundle is over budget at `575343` gzip bytes against the same 80,000-byte budget, from `tests/reports/bundle-size.json`.

Both figures are measured on the exact 3.0.1 packages and bound by SHA-256 to the L01 package receipt `tests/reports/muse3jsparity/l01/f4049f235500c8a98f7bc0a86ecf9f1a9d8cbe68/l01.receipt.json`; they establish bundle-size facts only, not a universal performance ranking.

The separate 15-workload Three.js comparison records one win, three parity
results and 39 disclosed losses, and reports comparisonComplete false, so it
establishes no universal performance ranking.

## Acceptance still required

Sustained reference-hardware particle performance, rendered shadow-stability
measurements, per-feature Three.js r185 comparisons, and actual engine workload
performance must pass their specified contracts before related claims are
promoted. Historical reports and successful unit tests do not replace these
measurements. Report both measured wins and losses.

The complete changed-route/template/docs boundary sweep must retain typed asset
provenance and identify primitive-only named heroes, unsafe loaders or asset
access, and DOM-faked rendering. Source checks do not substitute for visual
inspection of the final desktop/mobile artifacts.

Publication requires the exact 3.0.1 package manifest, tarball integrity,
installed-consumer/scaffold results, fresh requirement receipts, and independent
human review bound to those same artifacts. No approval is implied by these
candidate notes. The 3.0.0 PRD archive and prior release records remain historical.

Original non-goals remain: no universal Three.js ecosystem replacement claim,
no automatic arbitrary-rig retargeting claim, and no Unity/Unreal replacement
claim. See [known limits](status/known-limits.md) and
[claims and boundaries](../agents/claims-and-boundaries.md).
