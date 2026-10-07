# Q-13-7 — create-aura3d / shipped template manifest gaps (owner 13)

Surfaced by the PRD-15 pack-check lane (`qr-prd15-pack-check.yml`). The
consumer harness patches around both so the gate stays green; the template
manifests themselves still need owner attention.

## 1. `@types/node` undeclared

Every template under `packages/create-aura3d/templates/` and the six shipped
`templates/*` dirs ship playwright specs (`tests/route-health.spec.ts`,
`tests/screenshot.spec.ts`, ...) importing `node:fs` / `node:path`, but no
template declares `@types/node`. A consumer that runs `tsc --noEmit`
(TS2307 `node:fs`, `node:path`) fails unless its own dep tree happens to pull
the types in transitively. The pack-check consumer now injects
`"@types/node": "^22.15.30"` into its devDeps so the gate measures the
packed surface rather than this manifest gap.

Ask: add `"@types/node": "^22.15.30"` to each affected template's
`devDependencies` (it is already the version other templates pin).

## 2. Dead `@aura3d/navigation-recast@3.0.1` dep

`packages/create-aura3d/templates/cinematic-scene/package.json` declares
`"@aura3d/navigation-recast": "3.0.1"` but no file in the template imports
it. It is published on npm so it resolves, but it is dead weight in the
scaffold and it confused a stale-lockfile failure during triage.

Ask: drop the dep (or add the intended usage).

## Worked around in-lane

`tools/packed-consumer-check/index.ts`:

- consumer dest dirs are now `consumer-<repo-relative-path>` instead of
  `consumer-<basename>` — `templates/<name>` and
  `packages/create-aura3d/templates/<name>` shared basenames and the second
  copy inherited the first's generated `pnpm-lock.yaml`;
- `prepareConsumerCopy` injects `@types/node` (item 1) and clears any prior
  dest contents before copying.
