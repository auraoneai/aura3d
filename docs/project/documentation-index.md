# Aura3D 2.0 documentation index

Date: 2026-08-11
Status: current for Aura3D 2.0.0

The current tree contains product documentation, executable evidence inputs,
required package/app entry points, and the 2.0 release record. Superseded PRDs,
prompts, handoffs, duplicate per-version release notes, and archive Markdown are
removed after their still-valid decisions are consolidated here. Git history is
the archive.

## Start here

- Product overview: [`README.md`](../../README.md)
- Agent context: [`llms.txt`](../../llms.txt)
- Safe claim boundary: [`docs/agents/claims-and-boundaries.md`](../agents/claims-and-boundaries.md)
- Current product state: [`status/current-state.md`](./status/current-state.md)
- Known limits: [`status/known-limits.md`](./status/known-limits.md)
- Public API: [`docs/api/public-api.md`](../api/public-api.md)
- Migration to 2.0: [`MIGRATION-2.0.md`](../../MIGRATION-2.0.md)
- 2.0 release notes: [`aura3d-200-release-notes.md`](./aura3d-200-release-notes.md)

## Architecture

- 2.0 platform boundary: [`docs/architecture/2.0-platform.md`](../architecture/2.0-platform.md)
- Package ownership: [`docs/architecture/package-ownership.md`](../architecture/package-ownership.md)
- Exact generated subsystem ledger: [`docs/architecture/final-subsystem-ownership.md`](../architecture/final-subsystem-ownership.md)
- Public API design: [`docs/architecture/public-api-design.md`](../architecture/public-api-design.md)
- Extension points: [`docs/architecture/extension-points.md`](../architecture/extension-points.md)
- Claim lineage: [`docs/architecture/claim-lineage.md`](../architecture/claim-lineage.md)
- 2.0 removals and retrieval: [`docs/architecture/2.0-removals.md`](../architecture/2.0-removals.md)
- Architecture decisions: [`docs/architecture/adr/README.md`](../architecture/adr/README.md)

## Authoring and API documentation

- Agent workflows: [`docs/agents/README.md`](../agents/README.md)
- Asset workflow: [`docs/agents/asset-workflow.md`](../agents/asset-workflow.md)
- Game example standards: [`docs/agents/game-example-standards.md`](../agents/game-example-standards.md)
- Rendering proof rules: [`docs/agents/rendering-proof-required.md`](../agents/rendering-proof-required.md)
- API index: [`docs/api/readme.md`](../api/readme.md)
- Rendering: [`docs/concepts/rendering.md`](../concepts/rendering.md)
- Animation: [`docs/animation/runtime-support.md`](../animation/runtime-support.md)
- Game runtime: [`docs/api/game-runtime.md`](../api/game-runtime.md)
- Templates: [`docs/templates/create-aura3d-templates.md`](../templates/create-aura3d-templates.md)

## Current comparison documentation

- Comparison status: [`threejs-superiority-status.md`](./threejs-superiority-status.md)
- Claim boundary: [`parity/threejs/claim-boundary.md`](./parity/threejs/claim-boundary.md)
- Current inventory: [`parity/threejs/inventory.md`](./parity/threejs/inventory.md)
- Per-row matrix: [`parity/threejs/parity-matrix.md`](./parity/threejs/parity-matrix.md)
- Scope decisions: [`parity/threejs/scope-decisions.md`](./parity/threejs/scope-decisions.md)
- Generated capability lineage: [`parity/threejs/capability-lineage.md`](./parity/threejs/capability-lineage.md)
- Reproduction workflow: [`superiority-evidence-workflow.md`](./superiority-evidence-workflow.md)

Frozen historical benchmark inputs or results may remain only when a current
reproduction tool consumes them. They are data, not current public claims.

## Showcases and examples

- Showcase classifications: [`showcase/apps-classification.md`](./showcase/apps-classification.md)
- Quality gates: [`showcase/quality-gates.md`](./showcase/quality-gates.md)
- Visual quality standard: [`showcase/visual-quality-standard.md`](./showcase/visual-quality-standard.md)
- Flagship visual audit: [`status/2.0-flagship-visual-audit.md`](./status/2.0-flagship-visual-audit.md)
- Installed visual audit: [`status/2.0-installed-visual-audit.md`](./status/2.0-installed-visual-audit.md)
- Each package, template, app, example, fixture, or evidence bundle retains a
  colocated `README.md` only when users or tools need that entry point.

## Release and operations

- Release process: [`release-process.md`](./release-process.md)
- Release checklist: [`release/release-checklist.md`](./release/release-checklist.md)
- Release tracks: [`release-tracks.md`](./release-tracks.md)
- Rollback: [`release/deployment-rollback.md`](./release/deployment-rollback.md)
- Verification evidence: [`verification-evidence.md`](./verification-evidence.md)
- Requirements trace: [`requirements-trace.md`](./requirements-trace.md)
- Documentation audit ledger: [`docs-matrix-tracking.md`](./docs-matrix-tracking.md)
- Website: [`marketing-site.md`](./marketing-site.md)
- Security: [`security-policy.md`](./security-policy.md)
- Support: [`support-policy.md`](./support-policy.md)

`CHANGELOG.md` is the single retained release-history document. Separate 1.x
release-note drafts and obsolete migration/handoff files are not part of the
2.0 documentation surface.

## Retention rules

A Markdown file remains only when it is one of:

1. current 2.0 product/API/architecture/migration/release documentation;
2. a required colocated README, agent instruction, legal/license file, or ADR;
3. an executable benchmark specification or frozen evidence input consumed by
   a current command;
4. generated current evidence whose producer and claim boundary are named.

Scratch prompts, PRDs, handoffs, stale status snapshots, superseded plans,
duplicate release notes, and archive-only explanations belong in Git history.
No retained historical datum can override a current generated report or expand
a 2.0 public claim.
