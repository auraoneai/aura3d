# Q-05-8 — declare `@loaders.gl/*` dependencies used by `@aura3d/assets`

**Lane:** 05 (owns `packages/assets/`)
**Requested by:** lane 15 (PRD-15 T1.6 packed-consumer check)
**Status:** OPEN
**Filed:** 2026-10-06

## What

`@aura3d/assets` dynamically imports `@loaders.gl/core` and
`@loaders.gl/textures` (KTX2 lazy path,
`src/KTX2BasisTextureTranscoder.ts:131-134`), but `packages/assets/package.json`
declares only `@aura3d/animation`, `@aura3d/rendering`, `@aura3d/scene`. The
imports resolve in the monorepo because the root package.json pins
`@loaders.gl/{core,textures}@4.4.1` as devDependencies — nothing ships them to
consumers.

## Impact (real consumer failure, reproduced)

`tools/bundle-size/lit-scene.ts` builds `templates/product-viewer` against the
packed `aura3d-engine` tarball (file: dep + `pnpm install` + `vite build`):

```
[vite]: Rollup failed to resolve import "@loaders.gl/core" from
".../node_modules/@aura3d/assets/dist/KTX2BasisTextureTranscoder.js".
This is most likely unintended because it can break your application at runtime.
```

Every consumer that bundles `@aura3d/engine` and reaches the assets graph hits
this — bundlers fail the build at resolve time even though the import is
dynamic/lazy. (In-repo dev builds never see it because the root devDeps are
present.)

## Requested change

Declare `@loaders.gl/core@4.4.1` and `@loaders.gl/textures@4.4.1` in
`packages/assets/package.json` — `dependencies` is the safe option (an
optional peer still fails rollup resolution when the consumer doesn't install
it). Alternatively mark them `rollupOptions.external` in every consumer
build — worse, so dependencies is preferred.

## Why lane 15 can't do it

Single-writer rule: `packages/assets/` is 05-owned in
`.github/QR_OWNERSHIP.json`. The T1.6 pack-check and T0.3 lit-scene workflows
will keep reporting this template FAIL until the fix lands.
