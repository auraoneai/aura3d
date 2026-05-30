# PRD Amendment - Round 7 Nullable Mount Target Repair

Date: 2026-05-30
Amendment commit: this commit
User approval: `gchahal1982`, standing active-goal authorization to complete all `FinalizedPromptPlan.md` tasks without additional permission

## Reason

The clean Round 6 attempt from `87d6663796bd15e08195fb06f3b5ebb38ea5cee5`
exposed a specific Codex/Aura prompt 08 compile blocker. Codex generated a
city scene that mounted a queried canvas through a nested `createCityApp`
helper. The source checked the canvas for null, but TypeScript still treated
the closed-over variable as `HTMLCanvasElement | null` inside the helper and
rejected the public `createAuraApp(canvas, ...)` call.

This is a public API ergonomics gap, not a prompt or scorer issue. Agents
reasonably use `document.querySelector` when mounting nested scene canvases,
and Aura3D should accept nullable query results at the public type boundary
while still throwing a clear runtime error if the target is actually missing.

## Files Changed

- `packages/engine/src/agent-api/index.ts`
- `tests/unit/agent-api/agent-api.test.ts`
- `llms.txt`
- `docs/agents/api-surface.md`
- `docs/agents/build-playbook.md`
- `benchmark/context/aura3d/files/llms.txt`
- `benchmark/context/aura3d/files/docs/agents/api-surface.md`
- `benchmark/context/aura3d/files/docs/agents/build-playbook.md`
- `benchmark/context/aura3d/files/packages/engine/dist/agent-api/index.d.ts`
- `benchmark/context/aura3d/files/packages/engine/dist/index.d.ts`
- `benchmark/context/aura3d/manifest.sha256`
- `benchmark/results/amendment-round-7-nullable-target.md`
- `benchmark/results/round-7-phase-a-signoff.md`
- `benchmark/results/phase-d-progress.md`

## Standard Change

- Add public `AuraAppTarget = string | HTMLElement | HTMLCanvasElement | null | undefined`.
- Change `createAuraApp` to accept `AuraAppTarget`.
- Throw a clear `AuraRuntimeError("missing-canvas", ...)` when the target is
  null or undefined at runtime.
- Document that nullable `document.querySelector(...)` results are accepted by
  `createAuraApp` for type-safe agent-authored mount helpers.
- Regenerate the Aura3D context manifest.

## Prior Result Invalidated

Round 1, Round 2, Round 3, and Round 5 remain valid failed historical results.
The partial Round 6 local attempt is failed diagnostic evidence and cannot be
cited as shipping proof. A new complete round is required from this amended
standard.

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
- Exact failed-source smoke: copied
  `benchmark/runs/round-6/codex-aura3d/prompt-08/source` to
  `/tmp/aura3d-round7-nullable-target-smoke`, installed a fresh packed
  `@aura3d/engine`, and ran `npm run build`.
