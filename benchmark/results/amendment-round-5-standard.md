# PRD Amendment: Round 5 Standard

Date: 2026-05-30
Amendment commit: pending
User authorization: `gchahal1982` standing instruction to complete all tasks without further permission.
Status: approved for the next full rerun after commit

## Reason

Round 4 was started from commit `c34f2e8` but was aborted before capture and
scoring. It is not a valid benchmark round. The partial Claude/Aura run already
showed the same process failure that invalidated earlier progress: Claude
wrote large custom implementations despite matching Aura3D public helpers and
timed out or kept working after source/build activity.

The Round 4 diagnostic evidence was:

- `claude-aura3d` prompt 01 timed out after 600345 ms and produced 489 lines of
  source, including a custom `physics.ts`.
- `claude-aura3d` prompts 03, 04, 05, and 06 also overbuilt custom scenes or
  engines before timeout.
- `claude-aura3d` prompt 08 used `prefabs.cityBlock(...)` but still added a
  custom day/night rebuild flow and did not complete as a valid benchmark
  output.

Continuing full reruns without changing the standard would repeat the same
failure mode. This amendment changes the frozen benchmark standard before the
next valid full round.

## Standard Changes

- `benchmark/runner/README.md` now requires every agent instruction to include
  generic finite benchmark execution rules:
  - read `./context/llms.txt` first;
  - use `./context/docs/agents/benchmark-recipes.md` when a matching recipe
    exists;
  - use public helpers and prefabs before custom primitives;
  - do not run `npm run dev`, `npm run preview`, Playwright, browser
    screenshots, or manual visual verification inside the agent process;
  - stop after `npm run build` completes or fails.
- The Aura3D context bundle now includes
  `docs/agents/benchmark-recipes.md`, a compact recipe file for the 10 frozen
  prompt families.
- The Aura3D context bundle `llms.txt`, `docs/agents/README.md`,
  `docs/agents/agent-context.md`, and `docs/agents/build-playbook.md` now point
  agents to the benchmark recipes and the finite-process rule.
- The root `llms.txt` and root `docs/agents/*` guidance mirror the benchmark
  discipline for local agent work.
- `benchmark/context/aura3d/manifest.sha256` must be regenerated and verified
  in the same amendment commit.

## Prior Results

Round 1, Round 2, and Round 3 remain failed benchmark rounds. Round 4 is an
aborted diagnostic attempt and is not valid benchmark evidence. None of these
rounds may be used to claim Aura3D is a proven Three.js competitor or to ship
1.0.0.

## Verification

Required before commit:

- `cd benchmark/context/aura3d/files && shasum -a 256 -c ../manifest.sha256`
- `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`
- `pnpm run check:agent-docs`
- A finite Claude/Aura one-prompt smoke after commit or in the next diagnostic
  run, proving the amended instruction exits instead of timing out. This smoke
  is diagnostic only and cannot count as benchmark evidence.

## Next Valid Round

Round 5 must be run from scratch from this amended standard. Partial reruns and
the aborted Round 4 artifacts do not count.
