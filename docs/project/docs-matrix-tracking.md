# Docs Matrix Tracking

Status: active prevention ledger  
Source: `Fixed-Needed-PRD.md` docs matrix

Every Markdown file listed in the PRD matrix is either fixed in the current
claim-boundary pass or tracked here as blocked by a named library/workstream
task. This file is not release evidence by itself; it records ownership and the
next required action so future agents do not paper over missing capabilities.

## Fixed In Current Pass

| File | Priority | Owner area | Status |
| --- | --- | --- | --- |
| `AGENTS.md` | P0 | agent rules | Fixed with typed-asset, CLI, renderer-boundary, and no-hackjob rules. |
| `llms.txt` | P0 | agent rules | Fixed as first-read canonical boundary. |
| `.github/copilot-instructions.md` | P0 | agent rules | Fixed with compact hard rules. |
| `README.md` | P0 | root docs | Fixed with public claim boundary. |
| `QuickFixes.md` | P1 | root docs | Fixed as historical triage, not workaround permission. |
| `CONTRIBUTING.md` | P1 | contributor workflow | Fixed with showcase integrity requirements. |
| `BUNDLE_SIZES.md` | P2 | release workflow | Fixed with production bridge bundle-watch note. |
| `docs/agents/claims-and-boundaries.md` | P0 | agent docs | Fixed as canonical claim boundary. |
| `docs/agents/prompt-to-3d-workflow.md` | P0 | agent docs | Fixed with CLI typed-asset and screenshot verification flow. |
| `docs/agents/asset-workflow.md` | P0 | asset workflow | Fixed with source/release validation and typed-usage report. |
| `docs/agents/asset-selection.md` | P0 | asset workflow | Created as Phase 7 guardrail; release completion still blocked on full CLI quality/probe evidence. |
| `docs/agents/no-hackjob-rules.md` | P0 | agent rules | Created as Phase 7 guardrail for raw assets, CSS particles, primitive primary visuals, and example churn. |
| `docs/agents/game-example-standards.md` | P0 | game examples | Created as Phase 7 guardrail; game-route promotion remains blocked on 60-second meaningful play evidence. |
| `docs/agents/rendering-proof-required.md` | P0 | rendering proof | Created as Phase 7 guardrail; root PBR/HDR/shadow/postprocess completion remains blocked on root-only browser proof. |
| `docs/agents/agent-quickstart.md` | P1 | agent docs | Fixed with asset-first entry path. |
| `docs/agents/api-surface.md` | P1 | API docs | Fixed with public/internal/experimental labels. |
| `docs/agents/templates.md` | P1 | templates | Fixed with mini-game playable-starter status and template evidence rules. |
| `docs/agents/codebase-map.md` | P1 | agent docs | Fixed with root API to production-runtime map. |
| `docs/agents/README.md` | P1 | agent docs | Fixed with no primitive workaround warning. |
| `docs/api/game-runtime.md` | P0 | game runtime docs | Fixed to match current exports and avoid invented APIs. |
| `docs/guides/build-a-browser-game.md` | P0 | game guide | Fixed with honest starter limits. |
| `docs/api/assets.md` | P0 | asset docs | Fixed with source/release gates and usage metadata. |
| `docs/api/app-api.md` | P1 | app API | Fixed with renderer/fallback language. |
| `docs/api/readme.md` | P1 | API index | Fixed with capability labels. |
| `docs/api/animation-runtime-events.md` | P1 | animation docs | Fixed with actual support boundaries. |
| `docs/project/public-api-contract.md` | P1 | API contract | Fixed as export proof plus current capability labels. |
| `docs/concepts/rendering.md` | P0 | rendering docs | Fixed with root/production boundary. |
| `docs/rendering/skinning-and-morphs.md` | P0 | rendering docs | Fixed with current support and proof criteria. |
| `docs/rendering/material-matrix.md` | P0 | rendering docs | Fixed with root/production support matrix. |
| `docs/rendering/postprocess.md` | P0 | rendering docs | Fixed with screenshot-proof requirements. |
| `docs/animation/runtime-support.md` | P0 | animation docs | Fixed with implemented/public/render-backed labels. |
| `docs/rendering/animation-render-preset.md` | P1 | rendering docs | Fixed with renderer-mode/test ties. |
| `docs/concepts/engine-lifecycle.md` | P1 | lifecycle docs | Fixed with frame-loop and fallback language. |
| `docs/project/current-state.md` | P0 | project status | Fixed with honest capability state. |
| `docs/project/claim-guidelines.md` | P0 | claims | Fixed with proven/partial/prototype/internal/planned labels. |
| `docs/project/release-tracks.md` | P0 | release | Fixed with package/runtime versus showcase split. |
| `docs/project/release-checklist.md` | P0 | release | Fixed with asset, screenshot, route-health, claim, and input gates. |
| `docs/project/release-process.md` | P0 | release | Fixed with docs/showcase evidence gates. |
| `docs/project/verification-evidence.md` | P0 | verification | Fixed with current screenshot and route-health requirements. |
| `docs/project/showcase-application-plan.md` | P0 | showcase | Fixed with Aura Clash exclusion and app rebuild gates. |
| `docs/project/known-limits.md` | P0 | project status | Fixed as canonical limitations doc. |
| `docs/project/product-boundaries.md` | P0 | claims | Fixed with strengthened boundaries. |
| `docs/project/game-runtime-release.md` | P1 | game runtime | Fixed with source-level game kits and remaining browser-starter gates. |
| `docs/project/aura3d-109-release-gates.md` | P1 | release | Fixed as historical/scoped gate, not current showcase waiver. |
| `docs/project/documentation-index.md` | P1 | docs index | Fixed with missing docs and links. |
| `docs/project/requirements-trace.md` | P1 | traceability | Fixed with current test/doc mapping. |
| `docs/project/apps-classification.md` | P1 | showcase | Fixed with honest classifications. |
| `docs/project/site-map.md` | P1 | docs index | Fixed with status/capability pages. |
| `docs/project/completion-audit.md` | P1 | audit | Fixed with gate-by-gate status. |
| `docs/project/getting-started.md` | P2 | onboarding | Fixed with public safe-API first path. |
| `docs/project/frozen-benchmark-release-gates.md` | P0 | release | Created. |
| `docs/project/launch-positioning.md` | P0 | claims | Created. |
| `docs/project/showcase-quality-gates.md` | P0 | showcase | Created. |
| `docs/project/library-gap-roadmap.md` | P0 | roadmap | Created. |
| `docs/project/marketing-site.md` | P1 | marketing | Created. |
| `docs/project/superiority-evidence-workflow.md` | P1 | evidence | Created. |
| `docs/templates/create-aura3d-templates.md` | P0 | templates | Fixed with mini-game playable-starter status and typed-asset starter rules. |
| `docs/examples/animation-studio.md` | P1 | examples | Fixed as planned target, not runnable/current API. |
| `apps/*/README.md` | P1 | showcase apps | Fixed by per-app README pass against source, route-health, and typed assets. |

## Tracked Remaining Items

| File or pattern | Priority | Owner area | Blocking task |
| --- | --- | --- | --- |
| `prompt.md` | P0 | recovery prompt | Keep current with authoritative audit status. It is a workflow authority, not release evidence by itself. |
| `.claude/CLAUDE.md` | P0 | agent rules | Audit against `llms.txt`, `AGENTS.md`, and `docs/agents/claims-and-boundaries.md`; remove or demote unsupported claims. |
| `docs/agents/anti-hallucination-rules.md`, `docs/agents/benchmark-recipes.md`, `docs/agents/build-playbook.md`, `docs/agents/cinematic-scene-quality.md`, `docs/agents/deployment.md`, `docs/agents/game-showcase-build.md`, `docs/agents/troubleshooting.md`, `docs/agents/verification.md` | P0/P1 | agent docs | Audit for current asset, renderer, particle, game, screenshot, and claim-boundary rules. |
| `docs/api/*.md` not listed above | P1 | API docs | Audit remaining public API docs for root-safe versus internal/runtime/prototype boundaries. |
| `docs/rendering/*.md` not listed above | P1 | rendering docs | Audit remaining rendering docs for root-only proof requirements and WebGPU/PBR/HDR claim labels. |
| `docs/animation-studio/*.md`, `docs/examples/*.md`, and app-specific evidence READMEs | P1 | examples | Audit for public-readiness claims, route-health agreement, and screenshot/evidence freshness. |
| `templates/*/README.md` | P0 | templates | Audit generated-user-facing templates for typed assets, no raw model strings, no primitive-primary shortcuts, and honest starter status. |
| `packages/create-aura3d/templates/**/README.md` and nested template docs | P0 | generated templates | Audit generated outputs; these are public docs because `create-aura3d` emits them. |
| `packages/*/README.md` | P1 | package docs | Audit package-level claims against actual public exports and evidence labels. |
| `benchmark/**/*.md` | P1 | benchmarks | Audit benchmark prompts/rubrics so benchmark mode cannot be cited as production showcase evidence. |
| `examples/*/README.md` | P1 | examples | No matching example README files exist in the current checkout. If example READMEs return, they must pass the same typed-asset/source/route-health rules before public use. |
| Public root racing/falling-block starter examples | P0 | game runtime | Add browser-tested racing and falling-block starters after their public kit routes have keyboard/checkpoint/lap and movement/line-clear proof. |
| Public root animation examples | P0 | animation/runtime | Replace planned animation-studio target text with runnable code only after root skinned animation and screenshot pixel proofs exist. |
| Public root production-renderer examples | P0 | renderer bridge | Add runnable docs only after `createAuraApp` production bridge architecture and browser acceptance tests land. |

## Review Rule

When a future agent edits a listed file, it must keep the status aligned with
current tests. If implementation is missing, write `planned`, `prototype`, or
`blocked`; do not add runnable-looking pseudo-APIs.
