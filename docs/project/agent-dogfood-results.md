# Agent Dogfood Results

Generated: 2026-05-29T02:28:24.912Z

## Codex Self-Test

| Agent | Compiles | Runs | API Hallucinations | Asset Path Errors | Turns | Notes |
|---|---:|---:|---:|---:|---:|---|
| Codex | yes | yes | 0 | 0 | 1 | Generated app uses the public prompt-plan engine surface and typed assets emitted by aura assets add. Verification used the local repo toolchain; Claude Code, Cursor, and Copilot remain separate external runs. |

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
| `codex-generated-app-screenshot-profile` | pass | screenshot bytes=303523, profile={"yellowPixels":5799,"rainPixels":1761,"centerObjectPixels":10690,"uniqueBuckets":148} |

## Remaining Agent Runs

- Claude Code: not run in this automated self-test.
- Cursor: not run in this automated self-test.
- Copilot: not run in this automated self-test.
