# Round 5 Process Smoke

Date: 2026-05-30
Base commit: `42f5433`
Status: diagnostic passed

This file records a diagnostic smoke only. It is not benchmark evidence and
does not count as a Phase B partial rerun.

## Purpose

Round 4 was aborted because Claude/Aura repeated the prior process failure:
large custom implementations, long-running work, and timeouts before valid
capture/scoring. After `PRD-AMENDMENT: establish Round 5 finite benchmark
standard`, a single Claude/Aura prompt smoke was run to check whether the new
generic prompt-delivery rules can make Claude terminate normally.

## Smoke Setup

- Prompt: `benchmark/prompts/01-physics-playground.md`
- Context: `benchmark/context/aura3d/files`
- Source directory: `/tmp/aura3d-round5-smoke-p01/source`
- Agent: Claude Code
- Agent cap: 240000 ms
- Instruction included:
  - read `./context/llms.txt` first;
  - use `./context/docs/agents/benchmark-recipes.md`;
  - do not build custom engines when helpers exist;
  - do not run `npm run dev`, Playwright, browser screenshots, or manual visual
    verification inside the agent process;
  - stop after `npm run build`.

## Result

- Exit code: 0
- Duration: 111939 ms
- Timed out: false
- Agent output stated that it copied recipe `01 Physics Playground`.
- Agent output stated that `npm install` and `npm run build` completed.
- Agent output stated that it did not run a dev server, preview, or visual
  capture inside the agent process.

Generated source stayed on the intended short path:

- `source/src/main.ts`: 34 lines
- `source/src/style.css`: 39 lines
- Used `prefabs.physicsPlayground({ cubes: 50 })`
- Added a small DOM reset/contact HUD
- Did not create a custom `physics.ts`

Independent verification:

- `npm run build` in `/tmp/aura3d-round5-smoke-p01/source` passed.
- Screenshot captured outside the agent process:
  `/tmp/aura3d-round5-smoke-p01.png`
- Screenshot route evidence: one 1440 x 960 canvas and HUD text
  `reset contacts: 25`.

## Decision

The finite-process repair is strong enough to justify a full Round 5 run from
scratch. This smoke does not prove benchmark pass/fail; it only proves that the
specific Claude timeout/overbuild loop can be reduced by the amended standard.
