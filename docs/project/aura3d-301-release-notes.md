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

Measured win: selected scaffold production JavaScript is smaller by `361546` bytes against the Three.js comparison, from `tests/reports/current-head-to-head/aggregate.json`.

Scope: 1,132,696 JavaScript bytes against 1,494,242 for the same workload, one
clean production build per side, variance not measured.

Measured loss: isolated cold install-to-verified-cube is slower at `6638.6` ms against 5,047.9 ms, from `tests/reports/developer-friction.json`.

Scope: three fresh projects per engine and cache state; the warm medians were
3,199.5 ms against 2,297.7 ms.

Both figures are bounded to their selected workloads. The 15-workload comparison
records `1` win, `3` parity results and `39` disclosed losses, and reports
`comparisonComplete: false`, so it establishes no universal performance ranking.

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
