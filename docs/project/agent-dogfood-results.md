# Agent Dogfood Results

Generated: 2026-05-29T09:30:47.378Z

## Codex Self-Test

| Agent | Compiles | Runs | API Hallucinations | Asset Path Errors | Turns | Notes |
|---|---:|---:|---:|---:|---:|---|
| Codex | yes | yes | 0 | 0 | 1 | Generated app uses the public prompt-plan engine surface and typed assets emitted by aura assets add. Verification used the local repo toolchain; Claude Code, Cursor, and Copilot remain separate external runs. |
| Codex five-task eval | yes | yes | 0 | 0 | 1 | 5/5 requested tasks passed product-quality or deploy-bundle verification. This strengthens the Codex-local baseline only; Claude Code, Cursor, and Copilot remain separate external runs. |

## Codex Five-Task Eval

Asset source: Khronos glTF Sample Assets: MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb; license: CC-BY-4.0; downloaded at test time with SHA-256 verification and written as `sneaker.glb` plus `shoe2.glb` inside the temporary workspace.

| Task | Prompt | Compiles | Runs | Visual/Bundle Pass | Product-Quality Pass | API Hallucinations | Asset Path Errors | Turns | Manual Corrections | Notes |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `product-viewer` | Build a product viewer for sneaker.glb with orbiting and studio lighting. | yes | yes | yes | yes | 0 | 0 | 1 | 0 | Verified from the generated app route health, screenshot profile, or click-swap report. |
| `camera-rain` | Add a slow camera dolly and rain effect. | yes | yes | yes | yes | 0 | 0 | 1 | 0 | Verified from the generated app route health, screenshot profile, or click-swap report. |
| `reflective-floor` | Make the floor reflective. | yes | yes | yes | yes | 0 | 0 | 1 | 0 | Verified from the generated app route health, screenshot profile, or click-swap report. |
| `click-swap` | Add a click handler that changes the model to shoe2.glb. | yes | yes | yes | yes | 0 | 0 | 1 | 0 | Verified from the generated app route health, screenshot profile, or click-swap report. |
| `static-deploy-bundle` | Deploy the app to a static host or produce a valid static deployment bundle. | yes | yes | yes | yes | 0 | 0 | 1 | 0 | Verified against vite preview from the production dist bundle. |

## Codex Repair Eval

Source prompt: Repair a failed rainy product reveal that currently looks like one model with symbolic rain marks.

| Initial Label | Repaired Label | Repair Turns | Applied Repair Hints |
|---:|---:|---:|---|
| `fail` | `product-quality-pass` | 1 | Add foreground, midground, and background structure before promoting the scene. Replace symbolic rain marks with a cinematic recipe that includes layered rain, wet reflections, fog, bloom, and practical lights. Use a tighter dolly camera and record the compiled prompt-plan repair hints in the route report. |

## Context Input

- `llms.txt`
- `AGENTS.md`
- `.claude/CLAUDE.md`
- `.cursor/rules/aura3d.mdc`
- `.github/copilot-instructions.md`
- `docs/agents/agent-context.md`
- `docs/agents/build-playbook.md`
- `docs/agents/launch-positioning.md`
- `docs/agents/codebase-map.md`
- `docs/agents/verification.md`

## Checks

| Check | Result | Detail |
|---|---:|---|
| `agent-context-files-present` | pass | 10 context files copied |
| `codex-generated-app-uses-typed-assets` | pass | src/main.ts imports assets from ./aura-assets and uses assets.agentProduct as the prompt-plan subject |
| `codex-generated-app-uses-prompt-plan` | pass | src/main.ts defines a prompt plan, compiles its report, and renders through promptPlanToScene |
| `codex-generated-asset-manifest-validates` | pass | 2 typed asset validates |
| `codex-generated-app-no-api-hallucinations` | pass | no invented @aura3d/engine imports |
| `codex-generated-app-no-asset-path-errors` | pass | no raw model URL or missing typed asset dependency |
| `codex-generated-app-builds` | pass | vite build passed |
| `codex-generated-app-route-health` | pass | ready=true, backend=webgl2, drawCalls=40 |
| `codex-generated-app-screenshot-profile` | pass | screenshot bytes=433773, profile={"yellowPixels":4840,"rainPixels":4867,"centerObjectPixels":11457,"uniqueBuckets":164} |
| `codex-five-task-context-files-copied` | pass | 10 context files copied |
| `codex-five-task-assets-validate` | pass | 2 typed assets validate |
| `codex-five-task-no-api-hallucinations` | pass | no invented @aura3d/engine imports |
| `codex-five-task-no-asset-path-errors` | pass | uses assets.sneaker and assets.shoe2 typed refs; no raw GLB URLs |
| `codex-five-task-builds` | pass | vite build passed |
| `codex-five-task-static-preview-runs` | pass | ready=true, backend=webgl2, staticPreview=true |
| `codex-five-task-screenshot-product-quality` | pass | screenshot bytes=418472, profile={"subjectPixels":10306,"softboxPixels":10255,"rainPixels":9998,"reflectionPixels":5438,"uniqueBuckets":92} |
| `codex-five-task-click-swap` | pass | before=sneaker, after=shoe2 |
| `codex-five-task-completes-at-least-four-of-five` | pass | 5/5 tasks passed |
| `codex-repair-context-files-copied` | pass | 10 context files copied |
| `codex-repair-asset-validates` | pass | 1 typed asset validates |
| `codex-repair-initial-screenshot-fails-quality` | pass | initial label=fail, profile={"subjectPixels":786,"rainPixels":204,"reflectionPixels":49,"environmentPixels":0,"uniqueBuckets":36} |
| `codex-repair-no-api-hallucinations` | pass | no invented @aura3d/engine imports |
| `codex-repair-no-asset-path-errors` | pass | uses assets.repairProduct typed ref with no raw GLB URLs |
| `codex-repair-repaired-app-builds-and-runs` | pass | ready=true, backend=webgl2 |
| `codex-repair-applies-prompt-plan-repair-hints` | pass | 6 compiled repair hints recorded |
| `codex-repair-screenshot-improves-to-product-quality` | pass | initial={"subjectPixels":786,"rainPixels":204,"reflectionPixels":49,"environmentPixels":0,"uniqueBuckets":36}; repaired={"subjectPixels":10423,"rainPixels":2883,"reflectionPixels":3210,"environmentPixels":12559,"uniqueBuckets":112} |
| `codex-repair-turn-count-recorded` | pass | 1 repair turn recorded |

## Remaining Agent Runs

- Claude Code: not run in this automated self-test.
- Cursor: not run in this automated self-test.
- Copilot: not run in this automated self-test.
