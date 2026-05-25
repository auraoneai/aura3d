# Current Gallery Recovery Status

Date: 2026-05-25

Scope: current `master` checkout only. This file records the current gallery recovery state after the latest full evidence pass. It replaces earlier Product/Data loop notes that treated Product or Data as failed.

## Current Checkout

- Repository: `/Users/gurbakshchahal/G3D`
- Branch: `master`
- Current HEAD during the latest pass: `29ffd53 feat: major rendering pipeline enhancements and car material stability module`
- Process check: matching Playwright processes were from `/Users/gurbakshchahal/OneFoundry`, not this repo.
- Worktree: current recovery work remains uncommitted and must not be reset or cleaned without a separate backup/commit decision.

## Current Gallery State

Current accepted route set:

1. `product-configurator`
2. `data-galaxy`
3. `reactor-post`
4. `digital-twin`
5. `robotics-lab`
6. `smart-city`
7. `fog-cathedral`
8. `physics-playground`
9. `water-lab`
10. `ocean-observatory`

Latest visual review summary:

```json
{
  "pass": true,
  "releaseGate": "accepted",
  "acceptedCount": 10,
  "candidateCount": 0,
  "failedCount": 0,
  "blockedCount": 0,
  "imageQualityPassingCount": 10,
  "knownVisualArtifactRiskCount": 0
}
```

Latest report audit summary:

```text
V9 advanced gallery report disclosure audit: 10/10 expected route reports present
Reusable systems: 10/10
Unsupported disclosures: 10/10
Measured performance evidence: 10/10
Screenshot hashes: 10/10
Current screenshot artifacts: 10/10
Image stats: 10/10
Visual review: gate=accepted, accepted=10/10, imageQuality=10/10
Blockers: 0
Warnings: 0
```

## Product Configurator

Current status: accepted by current evidence.

Acceptance is valid only while these remain current:

- `tests/reports/v9/advanced-examples-gallery/product-configurator.png`
- `tests/reports/v9/advanced-examples-gallery/product-configurator-viewport.png`
- `tests/reports/v9/advanced-examples-gallery/product-configurator-hero.png`
- `tests/reports/v9/advanced-examples-gallery/product-configurator.json`
- `tests/reports/v9/advanced-examples-gallery/visual-review-report.json`
- `tests/reports/v9/advanced-examples-gallery/reusable-systems-disclosure-audit.json`

Important preserved learning:

- The old white HDR/frosted outline was a real source issue caused by unsafe imported material/render-state and HDR/physical-material energy interactions.
- Product acceptance must not be preserved by changing metadata or review wording. If the PNG regresses, return to source owners: `packages/assets/src/CarConceptMaterialStability.ts`, `apps/v9-advanced-examples-gallery/src/authoredLayer.ts`, `apps/v9-advanced-examples-gallery/src/productConfiguratorPolicy.ts`, `apps/v9-advanced-examples-gallery/src/productConfiguratorScene.ts`, `apps/v9-advanced-examples-gallery/src/galleryRoutePolicies.ts`, and `packages/rendering/src/ShaderLibrary.ts`.

## Data Galaxy

Current status: accepted by current evidence.

Acceptance is valid only while these remain current:

- `tests/reports/v9/advanced-examples-gallery/data-galaxy.png`
- `tests/reports/v9/advanced-examples-gallery/data-galaxy-viewport.png`
- `tests/reports/v9/advanced-examples-gallery/data-galaxy-hero.png`
- `tests/reports/v9/advanced-examples-gallery/data-galaxy.json`
- `tests/reports/v9/advanced-examples-gallery/visual-review-report.json`
- `tests/reports/v9/advanced-examples-gallery/reusable-systems-disclosure-audit.json`

Important preserved learning:

- The generated Data Galaxy GLB is cataloged but inactive in hero mode.
- The accepted hero comes from route-owned CPU/static data visualization geometry: luminous core, clustered nodes, orbit arcs, curved streams, layered point batches, and explicit budget/evidence notes.
- Do not use generated GLB content, cuboid scaffold, semantic filler, object-count padding, fog sphere, particle carpet, or debug lines as focal proof in future regressions.

## Final Evidence Commands

The latest completion pass ran:

```bash
git diff --check
pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false
G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm v9:advanced-gallery
pnpm v9:advanced-gallery:review
pnpm v9:advanced-gallery:audit
pnpm v10
```

Current result:

- `git diff --check`: passed.
- Typecheck: passed.
- Full v9 gallery capture: passed, `11 passed`.
- Visual review: `Release gate: accepted (10/10 accepted)`.
- Report audit: passed with zero blockers and zero warnings.
- `pnpm v10`: passed all aggregate gates.

## Regression Rule

If any gallery source, rendering source, asset source, metadata, review tooling, audit tooling, screenshots, or route JSON changes, acceptance must be reproved from current evidence. Do not carry forward an accepted label from stale reports.
