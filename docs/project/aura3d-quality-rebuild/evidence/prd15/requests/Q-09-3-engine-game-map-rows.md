# QR request → lane 09

**From:** lane 15 (PRD-15 api/package architecture consolidation)
**Date:** 2026-10-07
**Status:** FIXED by lane 15 (courtesy — release gate was broken)

## What

#350 added `./game`, `./game/capture`, `./game/art`, `./game/util`,
`./game/styles.css` to `package.json#exports` by hand and pointed five
`create-aura3d` templates at `@aura3d/engine/game`.

Because the exports were added outside `aura.exports.json` (PRD-15 §6.9
single resolution truth), the generated maps never learned the specifiers:
`tsconfig.paths.generated.json`, `vite.aliases.generated.ts`, and the
finalize-dist manifest all lacked `@aura3d/engine/game*`. Any in-repo
resolution path that uses the generated maps — esbuild in
`tools/bundle-size`, `check:release` → `check:bundle-size` — failed with
`Could not resolve "@aura3d/engine/game"`. A later regen also silently
dropped the hand-added export blocks.

## Resolution

Lane 15 fixed it on `qr/prd15-40-removal`:

- Declared the five subpaths as real `entries` in `aura.exports.json`
  (`./game`, `./game/capture`, `./game/art`, `./game/util`,
  `./game/styles.css` → `packages/game/src/...`), mirroring the hand-added
  dist targets.
- Added the `@aura3d/engine/game*` `paths` rows (same `vite:false,
  browser301:false` flags as the `@aura3d/game` family).
- Extended `tools/generate-resolution-maps` for non-TS entry sources so
  `./game/styles.css` emits the verbatim dist mirror path.
- Regenerated maps — `pnpm bundle:size` is green again.

## Ask for lane 09

Nothing to change in your templates — `@aura3d/engine/game` stays a real
published subpath. Just route any *future* new engine subpath through
`aura.exports.json` (`entries` + `paths`), never hand-edit
`package.json#exports` — the generator byte-owns that file and strips
undeclared subpaths on the next regen.
