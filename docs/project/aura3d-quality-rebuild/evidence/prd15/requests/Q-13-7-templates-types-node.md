# Q-13-7 — add `@types/node` to scaffold templates whose tsconfig typechecks `node:` imports

**GitHub issue:** #702

**Lane:** 13 (owns `packages/create-aura3d/` and `templates/`)
**Requested by:** lane 15 (PRD-15 T1.6 packed-consumer check)
**Status:** OPEN
**Filed:** 2026-10-06

## What

`tsc --noEmit` fails in a real packed-consumer install for 12 of 19
`create-aura3d` templates and for `templates/mini-game`, because their
`tsconfig.json` `include` covers files that import `node:*` builtins while
`@types/node` is absent from `devDependencies`. The failure reproduces with
the template's own `typecheck` script (`tsc --noEmit`), so every scaffolded
consumer hits it on `pnpm build` (`"build": "npm run typecheck && vite build"`).

Concrete repro (verbatim from `tools/packed-consumer-check` on a
`file:`-packed `@aura3d/engine` consumer copy):

```
templates/mini-game:
ts(1,30): error TS2307: Cannot find module 'node:fs' or its corresponding type declarations.
tests/certified-rig.spec.ts(2,31): error TS2307: Cannot find module 'node:path' ...
tests/certified-rig.spec.ts(3,31): error TS2307: Cannot find module 'node:url' ...
tests/route-health.spec.ts(1,42): error TS2307: Cannot find module 'node:fs' ...
tests/route-health.spec.ts(2,25): error TS2307: Cannot find module 'node:path' ...
tests/screenshot.spec.ts(1,42): error TS2307: Cannot find module 'node:fs' ...
tests/screenshot.spec.ts(2,25): error TS2307: Cannot find module 'node:path' ...
```

## Affected templates (static audit: tsconfig `include` covers a `node:*`-importing file, no `@types/node` declared)

`packages/create-aura3d/templates/`:
cinematic-scene (2 files), fighting-game (3), mini-game (3), product-viewer (2),
three-compat-architecture-interior (2), three-compat-asset-inspector (2),
three-compat-character-viewer (2), three-compat-custom-threejs-migration (2),
three-compat-large-scene (2), three-compat-material-authoring (2),
three-compat-postprocess-scene (2), three-compat-premium-product-viewer (2)

`templates/` (root `files` set): mini-game (tests/*.spec.ts + playwright.config.ts),
cinematic-scene, product-viewer (both ship a tsconfig covering `node:*`-importing
files with no `@types/node` — same class, first seen on the qr-prd15-pack-check
macos-14 run)

## Requested change

Add `"@types/node": "^24"` (or the repo's current pin) to `devDependencies` in
each affected template's `package.json`. No source changes needed — the specs
already import `node:` builtins; only the types are missing.

## Why lane 15 can't do it

Single-writer rule: `templates/` and `packages/create-aura3d/` are 13-owned in
`.github/QR_OWNERSHIP.json`. The packed-consumer workflow lands warn-visible on
this PR; the T1.6 check will report these templates FAIL until the fix lands.
