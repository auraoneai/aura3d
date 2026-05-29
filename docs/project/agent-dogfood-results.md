# Agent Dogfood Results

Generated: 2026-05-29T03:58:13.262Z

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

## Context Input

- `llms.txt`
- `AGENTS.md`
- `.claude/CLAUDE.md`
- `.cursor/rules/aura3d.mdc`
- `.github/copilot-instructions.md`
- `docs/agents/agent-context.md`
- `docs/agents/build-playbook.md`
- `docs/agents/claims-and-boundaries.md`
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
| `codex-generated-app-route-health` | pass | ready=true, backend=webgl2, drawCalls=21 |
| `codex-generated-app-screenshot-profile` | pass | screenshot bytes=302859, profile={"yellowPixels":6430,"rainPixels":1946,"centerObjectPixels":11409,"uniqueBuckets":154} |
| `codex-five-task-context-files-copied` | pass | 10 context files copied |
| `codex-five-task-assets-validate` | pass | 2 typed assets validate |
| `codex-five-task-no-api-hallucinations` | pass | no invented @aura3d/engine imports |
| `codex-five-task-no-asset-path-errors` | pass | uses assets.sneaker and assets.shoe2 typed refs; no raw GLB URLs |
| `codex-five-task-builds` | pass | vite build passed |
| `codex-five-task-static-preview-runs` | pass | ready=true, backend=webgl2, staticPreview=true |
| `codex-five-task-screenshot-product-quality` | pass | screenshot bytes=272360, profile={"subjectPixels":9711,"softboxPixels":9364,"rainPixels":8525,"reflectionPixels":2884,"uniqueBuckets":84} |
| `codex-five-task-click-swap` | pass | before=sneaker, after=shoe2 |
| `codex-five-task-completes-at-least-four-of-five` | pass | 5/5 tasks passed |

## Remaining Agent Runs

- Claude Code: not run in this automated self-test.
- Cursor: not run in this automated self-test.
- Copilot: not run in this automated self-test.
