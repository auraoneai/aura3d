# Three.js Superiority Evidence Workflow

Version: 1.0.0

The superiority workflow is the generated-evidence layer behind A3D's strongest Three.js comparison language. It came out of the final superiority PRD and now lives in package scripts, `tools/superiority-*`, generated reports, and claim-governance docs.

## Current Source Owners

| Area | Source |
|---|---|
| Shared report helpers | `tools/superiority-common/index.ts` |
| Feature coverage | `tools/superiority-feature-parity/index.ts` |
| Visual quality | `tools/superiority-visual-quality/index.ts` |
| Performance | `tools/superiority-performance/index.ts` |
| Animation fidelity | `tools/superiority-animation-fidelity/index.ts` |
| Physics fidelity | `tools/superiority-physics-fidelity/index.ts` |
| Resource lifecycle | `tools/superiority-resource-lifecycle/index.ts` |
| Memory lifecycle | `tools/superiority-memory-lifecycle/index.ts` |
| Developer workflow | `tools/superiority-developer-workflow/index.ts` |
| Claim defense | `tools/superiority-claim-defense/index.ts` |
| Aggregate audit | `tools/superiority-audit/index.ts` |

The public claim boundary is documented in `docs/project/claim-guidelines.md` and the current status page is `docs/project/threejs-superiority-status.md`.

## Report Layout

Generated reports are written under:

```text
tests/reports/superiority/
```

Expected report names include:

- `feature-parity.json`
- `visual-quality.json`
- `performance.json`
- `animation-fidelity.json`
- `physics-fidelity.json`
- `physics-comparison-baseline.json`
- `resource-lifecycle-100-reloads.json`
- `memory-lifecycle.json`
- `developer-workflow.json`
- `claim-defense.json`
- `superiority-audit.json`

`tests/reports/` is ignored by git. Do not treat checked-in docs as proof that a clean checkout has current generated evidence.

## Commands

Run category gates directly when working on one area:

```sh
pnpm superiority:feature-parity
pnpm superiority:visual-quality
pnpm superiority:performance
pnpm superiority:animation-fidelity
pnpm superiority:physics-fidelity
pnpm superiority:resource-lifecycle
pnpm superiority:memory-lifecycle
pnpm superiority:developer-workflow
pnpm superiority:claim-defense
pnpm superiority:audit
```

Run the full public-claim gate with:

```sh
pnpm superiority
```

## Claim Rules

Use evidence-scoped wording only. A public claim may cite the superiority reports only when the relevant report exists, is current for the workspace or release job, and passes.

Allowed shape:

```text
A3D matches or exceeds Three.js in the measured categories covered by the current generated superiority audit.
```

Blocked shape:

```text
A3D is better than Three.js in every sense.
```

If any category is missing, stale, or failing, narrow the wording to the passing category reports. If docs and generated reports disagree, use the narrower claim.

## Evidence Dependencies

The superiority tools consume lower-level evidence from:

- `tests/reports/threejs-parity/`
- browser route reports;
- package smoke reports;
- resource and memory lifecycle reports;
- physics and animation focused reports;
- `docs/project/threejs-superiority-status.md`;
- public docs listed by `tools/superiority-common/index.ts`.

Regenerate upstream reports before rerunning the aggregate superiority audit if renderer, route, package API, docs, or report code changed.

## Maintenance Checklist

- Keep `docs/project/current-state.md`, `docs/project/claim-guidelines.md`, and `docs/project/threejs-superiority-status.md` aligned with generated report state.
- Keep broad claims out of README and GTM docs unless `pnpm superiority` passed in the current evidence run.
- Do not commit generated report output unless a release policy explicitly requires it.
- Keep category reports explicit about blockers and unsupported areas.
- Use `--report-only` only for diagnostics, not for public claim promotion.
