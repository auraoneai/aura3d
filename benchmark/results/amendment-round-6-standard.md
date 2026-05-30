# PRD Amendment - Round 6 Repair Standard

Date: 2026-05-30
Amendment commit: this commit
User approval: `gchahal1982`, standing active-goal authorization to complete all `FinalizedPromptPlan.md` tasks without additional permission

## Reason

Round 5 failed. The result is recorded in:

- `benchmark/results/round-5.md`
- `benchmark/results/round-5-engine.md`
- `benchmark/results/round-5-decision.md`

The next work must target the specific Round 5 failures instead of running
another full round immediately. This amendment changes the post-Round-5 standard
and context bundle so future agents have a small typed UI helper for HUDs and
toggles, plus clearer material and humanoid defaults.

The immediate Round 5 failures addressed by this amendment are:

- Codex/Aura prompt 06 compile failure from `HTMLStrongElement`.
- Codex/Aura prompt 08 compile failure from untyped `event.currentTarget`.
- Prompt 07 weak material readability.
- Prompt 09 weak humanoid readability.

## Files Changed

- `packages/engine/src/agent-api/index.ts`
- `tests/unit/agent-api/agent-api.test.ts`
- `llms.txt`
- `docs/agents/api-surface.md`
- `docs/agents/benchmark-recipes.md`
- `docs/agents/build-playbook.md`
- `benchmark/context/aura3d/files/llms.txt`
- `benchmark/context/aura3d/files/docs/agents/api-surface.md`
- `benchmark/context/aura3d/files/docs/agents/benchmark-recipes.md`
- `benchmark/context/aura3d/files/docs/agents/build-playbook.md`
- `benchmark/context/aura3d/files/packages/engine/dist/agent-api/index.d.ts`
- `benchmark/context/aura3d/manifest.sha256`
- `docs/project/public-api-contract.md`

## Standard Change

- Add public `ui` helpers: `ui.html`, `ui.setText`, `ui.setPressed`, and
  `ui.onClick`.
- Add a portable `HTMLStrongElement` type guard for agent-authored HUD counter
  code.
- Update benchmark recipes to use `ui` helpers for HUD and toggle code.
- Update agent docs to forbid `HTMLStrongElement` and untyped
  `event.currentTarget` in benchmark TypeScript.
- Improve `prefabs.materialSwatches()` with a brighter material studio floor,
  backdrop, reflection strip, readable dark rubber, visible glass contrast, and
  label plinths.
- Improve `prefabs.primitiveHumanoid()` with shoulder/hip connectors and feet.

## Prior Result Invalidated

Round 5 remains a valid failed historical result, but it is invalid for shipping
or future release claims under this amended standard. A future pass requires a
new full benchmark round from the amended context and library state.

## New Benchmark Round Required

Yes. Partial reruns do not count as release evidence.

## Verification

- `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=default`
- `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`
- `pnpm build`
- `pnpm run check:agent-docs`
- `pnpm run check:agent-api`
- `pnpm run check:public-api`
- `cd benchmark/context/aura3d/files && shasum -a 256 -c ../manifest.sha256`
