# Aura3D 1.0.5 Release Gates

Version: 1.0.5
Status: Active release gate
Replaces: `Aura3D105ReleasePRD.md`

Aura3D 1.0.5 is the runtime-animation, editor, visual-scripting, CLI, catalog, template, docs, and package-release gate after the 1.0.4 game-runtime foundation.

## Release Objective

The release must prove that a developer or AI coding agent can build normal TypeScript/JavaScript Aura3D projects that:

1. use `@aura3d/engine` public APIs;
2. use typed assets from `./src/aura-assets`;
3. do not import Three.js or GLTFLoader;
4. search or register real assets through the Aura3D CLI;
5. run interactive frame-loop routes;
6. play, restart, blend, and evidence animation state;
7. connect animation events to gameplay, effects, camera, HUD, captions, or visual scripting;
8. produce browser screenshots, JSON evidence, package smoke proof, and deployment proof.

## Current Gate Status

Green from the latest local audit:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm aura3d105:readiness` passed.
- `pnpm aura3d105:release` passed.
- `pnpm verify:package-install-smoke:fresh` passed for `@aura3d/engine@1.0.5`.
- `apps/aura-clash-showcase` build passed.
- `apps/aura-clash-showcase` playable smoke tests passed.
- Packed local `@aura3d/cli` plus packed local `@aura3d/asset-index` can run `assets search "animated fighter" --animated --json` from `/tmp`.
- Packed local `create-aura3d` scaffolds a fighting-game project whose dependency is `@aura3d/engine@1.0.5`.

Public publish status:

- npm `latest` points `@aura3d/engine` at `1.0.5`.
- npm `latest` points `@aura3d/asset-index` at `1.0.5`.
- npm `latest` points `@aura3d/cli` at `1.0.5`.
- npm `latest` points `create-aura3d` at `1.0.5`.
- `docs/project/release-artifacts.json` records the 1.0.5 tarball entry and checksum.
- `pnpm verify:versioned-release` passes against the 1.0.5 artifact manifest.
- Aura Clash `assets validate-game` runs against the active shipping-asset profile.
- GitHub publication is tracked through the 1.0.5 release PR.

## Required Package Publish Order

Minimum public fix:

1. `@aura3d/engine@1.0.5`
2. `@aura3d/asset-index@1.0.5`
3. `@aura3d/cli@1.0.5`
4. `create-aura3d@1.0.5`

If publishing the split runtime packages publicly, publish dependency order first:

1. `@aura3d/math`
2. `@aura3d/core`
3. `@aura3d/scene`
4. `@aura3d/animation`
5. `@aura3d/rendering`
6. `@aura3d/assets`
7. dependent packages after their graph is satisfied

## CLI/Catalog Release Gate

The AI prompt CLI/catalog issue is a hard release blocker.

Before launch, this must work outside the monorepo:

```bash
npx @aura3d/cli@latest assets search "animated fighter" --animated --json
```

Expected:

- command exits 0;
- JSON parses;
- `ok` is true;
- at least one candidate is returned;
- candidates include license/source/access fields;
- no monorepo workspace dependency is required.

Also verify:

```bash
npx create-aura3d@latest my-fighter --template fighting-game
cd my-fighter
npm install
npm run build
```

Expected:

- generated `package.json` depends on `@aura3d/engine@1.0.5`;
- no template depends on 1.0.0, 1.0.3, or 1.0.4;
- no template imports `three` or `GLTFLoader`.

## Animation Runtime Gate

1.0.5 should not claim full game-engine animation maturity unless evidence proves:

- visible named GLB clip playback;
- restart from frame zero;
- idle/walk/attack blending;
- animation events dispatching once at clip-local time;
- animation event to hitbox/effect/camera/HUD bridge;
- deterministic snapshots;
- browser screenshots.

If the route only proves source-level controller state or renderer-side pose approximations, the claim must say so.

## Editor And Visual Scripting Gate

Editor and visual scripting source exists, but release claims need:

- browser editor shell evidence;
- inspector/selection screenshots;
- timeline scrub/play evidence;
- project save/load round-trip;
- visual graph authoring evidence;
- graph execution through `app.step` and `app.onFrame`;
- JSON reports and screenshots.

Do not claim Unity/Unreal editor parity.

## Asset And License Gate

For every release-facing template/showcase asset, evidence must include:

- local path or source URL;
- license;
- author/source where available;
- checksum;
- typed asset name;
- bounds;
- animation clip list;
- skeleton/humanoid diagnostics where relevant;
- morph target list where relevant;
- validation timestamp.

Blocking failures:

- missing license;
- placeholder asset used as release proof;
- unsafe string asset id in safe API docs;
- missing required clip for a claimed animation behavior;
- missing required morph target for viseme proof;
- absent provenance in release evidence.

## Required Commands

Run before publish:

```bash
pnpm typecheck
pnpm build
pnpm aura3d105:readiness
pnpm aura3d105:release
pnpm verify:docs-version
pnpm verify:package-install-smoke:fresh
pnpm verify:versioned-release
```

Run package dry-runs:

```bash
npm pack --dry-run --json
npm publish --dry-run --json
cd packages/asset-index && npm publish --dry-run --json
cd ../aura3d-cli && npm publish --dry-run --json
cd ../create-aura3d && npm publish --dry-run --json
```

Run external tarball smoke before npm auth/publish:

```bash
pnpm --filter @aura3d/asset-index pack --pack-destination /tmp/aura3d-pack-audit
pnpm --filter @aura3d/cli pack --pack-destination /tmp/aura3d-pack-audit
pnpm --filter create-aura3d pack --pack-destination /tmp/aura3d-pack-audit
npm exec --package /tmp/aura3d-pack-audit/aura3d-asset-index-1.0.5.tgz --package /tmp/aura3d-pack-audit/aura3d-cli-1.0.5.tgz -- cli assets search "animated fighter" --animated --json
npm exec --package /tmp/aura3d-pack-audit/create-aura3d-1.0.5.tgz -- create-aura3d my-fighter --template fighting-game
```

## Definition Of Done

1.0.5 is publishable only when:

- all package manifests and templates depend on 1.0.5 where they consume Aura3D;
- README, `llms.txt`, marketing, and docs do not advertise stale current-package baselines;
- CLI/catalog search works from published npm, not only local workspace;
- create-aura3d works from published npm;
- root engine package installs and builds in a fresh external app;
- release artifact manifest matches the 1.0.5 tarball;
- GitHub commit/tag/release are ready;
- npm auth is available;
- post-publish `npm view` and `npx` verification pass.
