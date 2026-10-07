# prd07 CI fixes — evidence

Post-merge hardening of the lane workflow on main (PR #338, merge `9c1f755e`).

## Failures observed on main (run 37520768023 @ 2747b302)

| Job | Symptom | Root cause |
|-----|---------|------------|
| grep-gate | `mapfile: command not found`, exit 127 | macos-14 ships bash 3.2; `mapfile` is bash 4+ |
| unit | ENOENT on `tests/qr/prd07/fixtures/clear-fx.ts` + `game-effects-nodes-85aafcd0.json` | bare `fixtures/` rule in `.gitignore` (~line 319) left the dir untracked |
| browser | 16/17 specs `TimeoutError` waiting `window.__QR_PRD07_*__` | unmapped bare specifiers in `packageEntryPoints` (`@aura3d/rendering/contracts` + `/flags.state`, `@aura3d/rendering/world`, `@aura3d/engine/contracts`, `@aura3d/engine-runtime` + `/contracts`) kill the whole module graph before the harness runs |

capture / games / bake / typecheck stayed green throughout.

## Fixes

- `fixtures/` renamed to `corpus/` (gitignore-safe); refs updated in `vfx-pools-codemod.test.ts` + `game-effects-automount.test.ts`.
- `grep-gate.sh` `mapfile` → portable `while read` loop (bash 3.2-safe).
- `tests/browser/example-dev-server.ts`: 6 `packageEntryPoints` aliases added (owner-15 file; qr-request #339 filed for the record — the file's own comment requires every published `@aura3d/rendering` subpath be aliased there).

## Local verification

- `bash tests/qr/prd07/grep-gate.sh` — pass (9 hits, all allowlisted)
- `npx vitest run --config tests/qr/prd07/vitest.config.ts` — 44 files / 189 tests green
- Specifier sweep over the reachable browser graph: all `@aura3d/*` imports resolve to mapped files (two residual hits are `Symbol.for` / doc strings, not imports)

## CI

- `workflow_dispatch` run 37561125962 on `main` @ `9c1f755e` — dispatched; fleet queue is saturated (prior runs took 160–370 min).
- C-40 rows F-07-01…09 flipped to `verified` in CONTRACTS.md.
