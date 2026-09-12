<!-- orchestrate handoff
task: bootstrap-fps-bar
branch: `orch/neon-corridor-strike/bootstrap-fps-bar` (pushed to origin, commit `d4cee3a6`)
agentId: bc-6687b6d1-4e10-40fc-9f42-5df508c28e51
runId: run-1b60ef01-5984-4bfa-af64-e48d87ee14a1
resultStatus: finished
finishedAt: 2026-08-17T10:32:06.816Z
-->

All acceptance criteria met. Writing my handoff.

## Status
success

## Branch
`orch/neon-corridor-strike/bootstrap-fps-bar` (pushed to origin, commit `d4cee3a6`)

## What I did
- Read every required doc: `llms.txt`, `docs/agents/claims-and-boundaries.md`, `docs/agents/game-example-standards.md`, `docs/agents/no-hackjob-rules.md`, `docs/agents/asset-workflow.md`, `docs/guides/build-a-browser-game.md`.
- Read two game examples for grounding: the public `templates/mini-game` (positive: `@aura3d/lean/game`, typed player model, primitives only for set dressing, WebGL2 `readPixels` color-bucket screenshot proof) and `examples/game-slice` (confirmed it is an internal test *fixture* that imports package internals and is explicitly NOT a public example — a negative reference).
- Verified `examples/neon-corridor-strike` is absent both on `origin/main` (`git ls-tree -r origin/main | grep -i neon-corridor` → empty) and in the working tree.
- Wrote and committed `.orchestrate/neon-corridor-strike/reference/fps-bar.md` (241 lines) as binding law: allowed public APIs, mandatory `prototype` claim label, typed-asset + provenance rules, screenshot/runtime proof rules, 9 explicit fail conditions, and recommended CLI search/resolve queries for rifle, corridor, and humanoid/creature enemies.

## Measurements
- `files committed(.orchestrate/neon-corridor-strike/reference/fps-bar.md): 0 → 1`
- `neon-corridor-strike on origin/main: absent == absent`
- `required docs read: 6/6 == 6/6`

## Verification
not-verified

Documentation/reference-only deliverable; no code path to run. The file's constraints are transcribed directly from the canonical source docs I read, so a verifier can diff it against them. No behavioral target exists for this task.

## Notes, concerns, deviations, findings, thoughts, feedback
- **Public game entry surprise for descendants**: the current public game template (`templates/mini-game`) mounts through `@aura3d/lean/game`, not root `@aura3d/engine`. I listed both as allowed. Whoever builds the route should pick one isolated entry and keep it consistent; do not mix.
- **`examples/game-slice` is a trap**: its README states it was *removed* from public examples because "the player is not visually readable" and it imports `@aura3d/physics`/`@aura3d/rendering`/`@aura3d/animation` internals + `GLTFLoader`. Descendants must NOT copy its import style. I encoded this as a fail condition and a negative reference.
- **Deletion is explicitly on the table**: the overall goal authorizes deleting the game rather than shipping. My reference bar's fail-condition #9 ("shown before 10/10 → omit/delete") reflects that. If asset resolution for a *readable* rifle + corridor + animated enemies fails the `--require-license`/`--no-placeholders` gate, the honest outcome is prototype-or-delete, not a primitive fake.
- **Asset queries are unverified against the live index**: I did not run the CLI (no need for this scoped task, and network/catalog availability is unknown here). The queries are best-guess descriptive phrases per the asset-workflow rules; the builder must confirm real, redistributable matches come back and use the exact generated typed keys.
- No UI/interactive changes were made, so there is no screen recording artifact for this task.

## Suggested follow-ups
- Publish a build task: resolve typed rifle/corridor/enemy assets via the §6 queries, confirm keys land in `src/aura-assets.ts` + provenance in `aura.assets.json`, and gate with `assets validate-game --profile fighting-character`.
- Publish a route task: implement `examples/neon-corridor-strike` per §7 build order (one `createAuraApp`, real `particles/effects` gunfire, animated typed enemies, pointer-look + fire, objective/score/fail/reset, ≥60s).
- Publish a verifier task: enforce the §5 fail conditions with a Playwright pixel-bucket + runtime-state spec (mirror `templates/mini-game/tests/screenshot.spec.ts`), plus a source scan for `three`/`GLTFLoader`/raw URLs/`unsafeModelUrl`/string-id `model(...)`.
- Consider whether the planner wants a shared `.orchestrate/neon-corridor-strike/reference/` index if multiple reference files accrue.