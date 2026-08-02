# Requirements Trace

Date: 2026-06-18
Status: remediation trace

This trace maps the remediation PRD requirements to durable docs and remaining
work. It replaces prior "all requirements complete" language, which is no longer
accurate under the stricter release gates.

## Trace Summary

| Area | Status | Evidence |
| --- | --- | --- |
| Project docs remediation | implemented in this doc set | Owned project docs rewritten and missing durable docs created. |
| Claim boundary | implemented for project docs | `docs/project/claim-guidelines.md`, `docs/project/status/product-boundaries.md`, `docs/project/launch-positioning.md`. |
| Showcase gates | documented, implementation pending | `docs/project/showcase/quality-gates.md`; code/test gates still need implementation. |
| Library roadmap | documented, implementation pending | `docs/project/roadmaps/library-gap-roadmap.md`; package work remains open. |
| Release track split | documented | `docs/project/release-tracks.md`, `docs/project/release/release-checklist.md`, `docs/project/release-process.md`. |
| Current showcase demotion | documented | `docs/project/showcase-application-plan.md`, `docs/project/showcase/apps-classification.md`. |
| Benchmark/superiority workflow | documented, execution pending | `frozen-benchmark-release-gates.md`, `superiority-evidence-workflow.md`. |
| Marketing site claim policy | documented | `marketing-site.md`. |

## PRD Mapping

| PRD requirement | Status | Project doc evidence | Remaining work |
| --- | --- | --- | --- |
| Root docs tell agents what Aura3D can and cannot prove today. | partially complete | `docs/project/status/current-state.md`, `docs/project/status/known-limits.md`, `docs/project/status/product-boundaries.md` | Root `README.md`, `AGENTS.md`, `llms.txt`, and agent/API docs still need matching updates outside this owned scope. |
| Every public claim names its path and evidence. | documented | `claim-guidelines.md`, `verification-evidence.md` | Enforce through lint/source checks and copy review tooling. |
| Package/runtime release is separate from showcase/marketing release. | complete for project docs | `docs/project/release-tracks.md`, `docs/project/release/release-checklist.md`, `docs/project/release-process.md` | Apply same policy to release scripts and public docs. |
| Showcase routes cannot pass with primitive-only scenes or weak screenshots. | documented | `docs/project/showcase/quality-gates.md`, `docs/project/showcase-application-plan.md` | Implement static source scans, route-health validation, primitive budgets, and screenshot readability checks. |
| Public examples classified honestly. | complete for project docs | `docs/project/showcase/apps-classification.md` | Update each app README/source evidence outside this owned scope. |
| Durable library gap roadmap exists. | complete for docs | `docs/project/roadmaps/library-gap-roadmap.md` | Implement renderer bridge, animation/skinning/morph, asset validation, game kits, materials/effects/WebGPU, and diagnostics. |
| Frozen benchmark release gates exist. | complete for docs | `frozen-benchmark-release-gates.md` | Run benchmark protocol before any superiority claim. |
| Launch positioning exists. | complete for docs | `launch-positioning.md` | Mirror allowed copy into README/marketing site. |
| Marketing site claim policy exists. | complete for docs | `marketing-site.md` | Update website pages and generated docs. |
| Superiority workflow exists. | complete for docs | `superiority-evidence-workflow.md` | Execute neutral comparison and commit artifacts before external claims. |

## Verification Notes

This trace is a documentation remediation artifact. It does not prove package,
renderer, game, or showcase implementation completion. Claims remain blocked
until the gates named in the relevant docs pass.
