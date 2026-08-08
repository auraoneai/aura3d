# Documentation Index

Date: 2026-08-08
Status: Aura3D 1.6.0 documentation index

## Directory Taxonomy

Canonical project documents use lowercase, hyphen-separated filenames and are
grouped by purpose:

| Directory | Purpose |
| --- | --- |
| `docs/project/plans/` | Active and historical execution plans and PRDs. |
| `docs/project/audits/` | Evidence-backed gap and implementation audits. |
| `docs/project/status/` | Current state, product boundaries, and known limits. |
| `docs/project/roadmaps/` | Durable future-work roadmaps. |
| `docs/project/showcase/` | Showcase classification, quality gates, and route plans. |
| `docs/project/release/` | Release checklists and operational release procedures. |
| `docs/project/parity/threejs/` | Three.js parity status, inventory, matrix, backlog, boundary, and execution plan. |
| `docs/project/architecture/` | Architecture decisions and integration designs. |
| `docs/api/contracts/` | Generated or maintained public API contracts. |

Conventional repository, package, app, fixture, report, and evidence entrypoints
retain `README.md` where tools and users expect a colocated entrypoint. Root
`README.md`, `CHANGELOG.md`, and `GoLiveCheckList.md` also remain at repository
root.

## Deliberately Colocated Entry Points

These requested documents stay beside the code or evidence they explain:

- Showcase app entry points:
  `apps/showcase-turbo-drift-circuit/README.md`,
  `apps/showcase-skyline-runner/README.md`,
  `apps/world-war-x-showcase/README.md`,
  `apps/aura-clash-showcase/README.md`,
  `apps/animation-studio-web/README.md`, and
  `apps/advanced-examples-gallery/README.md`.
- Agent simulation report entry point:
  `tests/reports/agent-simulation-app/README.md`.
- Aura Clash review evidence:
  `apps/aura-clash-showcase/launch-evidence/review-package.md` and
  `apps/aura-clash-showcase/launch-evidence/readiness.md`.
- External-engine baseline instructions:
  `fixtures/external-engine-baselines/external-parity/unreal/README.md`,
  `fixtures/external-engine-baselines/external-parity/unity/README.md`, and
  `fixtures/external-engine-baselines/external-parity/RUNBOOK.md`.
- Dated production evidence overview:
  `docs/project/production-evidence/2026-07-23/overview.md`.

## Canonical Project Docs

- Current state: `docs/project/status/current-state.md`
- Product boundaries: `docs/project/status/product-boundaries.md`
- Known limits: `docs/project/status/known-limits.md`
- Claim guidelines: `docs/project/claim-guidelines.md`
- Launch positioning: `docs/project/launch-positioning.md`
- Library gap roadmap: `docs/project/roadmaps/library-gap-roadmap.md`
- `createAuraApp` production bridge architecture: `docs/project/architecture/create-aura-app-production-bridge.md`
- Showcase quality gates: `docs/project/showcase/quality-gates.md`
- Docs matrix tracking: `docs/project/docs-matrix-tracking.md`
- Frozen benchmark release gates: `docs/project/frozen-benchmark-release-gates.md`
- Superiority evidence workflow: `docs/project/superiority-evidence-workflow.md`
- Marketing site: `docs/project/marketing-site.md`
- Game layer rebuild plan: `docs/project/aura3d-game-layer-rebuild-plan.md`

## Active Plans And Audits

- Aura3D 1.6 governing PRD: `Aura3D-1.6-Replatform-PRD.md`
- Aura3D 1.6 migration and version decision: `MIGRATION-1.6.md`
- Engine parity gap audit: `docs/project/audits/engine-parity-gap-audit.md`
- Three.js comparison status: `docs/project/threejs-superiority-status.md`

The final remaining-work, recovery remediation, engine/game parity, and Three.js
execution plans are retained as implementation history. Their completed or
superseded tasks are not current release requirements; the 1.6 PRD and canonical
release checklist own the current gate state.

## Release Docs

- Release tracks: `docs/project/release-tracks.md`
- Release checklist: `docs/project/release/release-checklist.md`
- Release process: `docs/project/release-process.md`
- Aura3D 1.4.0 release candidate: `docs/project/aura3d-140-release-candidate.md`
- Aura3D 1.4.0 release notes draft: `docs/project/aura3d-140-release-notes.md`
- Aura3D 1.4.1 release notes: `docs/project/aura3d-141-release-notes.md`
- Aura3D 1.4.2 release notes: `docs/project/aura3d-142-release-notes.md`
- Aura3D 1.4.3 release notes: `docs/project/aura3d-143-release-notes.md`
- Aura3D 1.4.4 release notes: `docs/project/aura3d-144-release-notes.md`
- Aura3D 1.4.5 release notes: `docs/project/aura3d-145-release-notes.md`
- Aura3D 1.6.0 release notes: `docs/project/aura3d-160-release-notes.md`
- Verification evidence: `docs/project/verification-evidence.md`
- Requirements trace: `docs/project/requirements-trace.md`
- Completion audit: `docs/project/completion-audit.md`
- Site map: `docs/project/site-map.md`
- Deployment rollback: `docs/project/release/deployment-rollback.md`
- Support policy: `docs/project/support-policy.md`
- Security policy: `docs/project/security-policy.md`

## Showcase Docs

- Showcase app plan: `docs/project/showcase-application-plan.md`
- App classification: `docs/project/showcase/apps-classification.md`
- Showcase copy review: `docs/project/showcase-copy-review.md`
- Showcase launch evidence JSON: `docs/project/showcase-launch-evidence.json`
- Showcase visual review JSON: `docs/project/showcase-visual-review.json`
- Aura Clash showcase: `docs/project/showcase/aura-clash-showcase-plan.md`

## API And Agent Docs Covered By The Claim-Boundary Pass

These docs must stay aligned with the canonical project docs before public
release:

- `llms.txt`
- `AGENTS.md`
- `.github/copilot-instructions.md`
- `README.md`
- `docs/agents/claims-and-boundaries.md`
- `docs/agents/no-hackjob-rules.md`
- `docs/agents/asset-selection.md`
- `docs/agents/game-example-standards.md`
- `docs/agents/rendering-proof-required.md`
- `docs/agents/prompt-to-3d-workflow.md`
- `docs/agents/asset-workflow.md`
- `docs/api/assets.md`
- `docs/api/game-runtime.md`
- `docs/guides/build-a-browser-game.md`
- `docs/concepts/rendering.md`
- `docs/rendering/material-matrix.md`
- `docs/rendering/postprocess.md`
- `docs/rendering/skinning-and-morphs.md`
- `docs/animation/runtime-support.md`
- `docs/templates/create-aura3d-templates.md`

## Index Policy

Do not add a file to a public index unless it exists and its claims match
`docs/project/claim-guidelines.md`. Deleted PRDs and historical planning files
should not be used as current release standards.
