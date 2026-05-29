# Aura3D Dogfood Rubric

## Purpose

This rubric scores whether Aura3D behaves like a usable product for developers
and AI coding agents, not only whether repository files exist.

## Agent Task Set

Each agent run should start from the same context package:

- `llms.txt`
- `AGENTS.md`
- `.claude/CLAUDE.md`
- `.cursor/rules/aura3d.mdc`
- `.github/copilot-instructions.md`
- `docs/agents/*`

Do not allow source-code browsing during the generation step. Verification may
use the repo toolchain after the generated project exists.

Run these tasks:

1. Build a product viewer for a local product asset with orbit controls and
   studio lighting.
2. Add a slow camera dolly and a rain or fog effect.
3. Add reflective or higher-fidelity material treatment where the public API
   supports it.
4. Add a click handler or simple interaction that swaps to a second typed asset.
5. Prepare the app for static deployment and run the deployment check.

## Scorecard

| Field | Measurement |
|---|---|
| Agent | Codex, Claude Code, Cursor, Copilot, or baseline |
| Compiles | `yes` only if TypeScript or Vite build exits zero |
| Runs | `yes` only if route health reaches ready and draw calls are greater than zero |
| API Hallucinations | Count invented imports, functions, options, or package names |
| Asset Path Errors | Count invented, missing, raw, or untyped asset paths |
| Turns | Count user-agent repair turns after the initial task |
| Notes | Record any hidden assumptions, manual repairs, or missing product features |

## Pass Threshold

A run is acceptable for local confidence when:

- It compiles without manual code edits.
- It runs in a browser route-health check.
- It produces a nonblank screenshot.
- It has zero invented Aura3D APIs.
- It has zero asset path errors.
- It uses typed asset references for model and texture assets.

## Baseline Comparison

Run the same tasks with raw Three.js and the same agent. Aura3D is only proving
product value if it reduces API hallucinations, asset-path mistakes, or repair
turns compared with the raw baseline.

## Current Status

Codex self-test, Codex five-task, Codex repair, fresh Codex context-only,
Claude Code five-task, and raw Three.js baseline evidence are recorded in
`docs/project/agent-dogfood-results.md`,
`docs/project/fresh-codex-agent-context-results.md`,
`docs/project/claude-code-agent-context-results.md`,
`docs/project/agent-baseline-comparison.md`, and the matching JSON reports.

Cursor and Copilot remain optional subscription follow-up runs.
