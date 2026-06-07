# Aura3D 1.0.10 Release Gates

Version: 1.0.10
Date: 2026-06-06

This is the current release gate document for the Aura3D 1.0.10 line. It replaces the active planning function of the former 1.0.6 game-engine/showcase PRD and the 1.0.7 cartoon production PRD.

## Current Release Target

The public package set must agree on the same release line:

- `@aura3d/engine@1.0.10`
- `create-aura3d@1.0.10`
- `@aura3d/cli@1.0.10`
- `@aura3d/asset-index@1.0.10`

The release is a scoped browser 3D SDK release. It may claim game-runtime foundations, typed asset workflows, prompt-cartoon scaffolds, cartoon asset profile search, deployment checks, and the live Aura Clash development showcase. It must not claim mature commercial game-engine parity with Unity, Unreal, or Babylon.js.

## Package Gates

Before calling 1.0.10 published:

- `pnpm build` passes and writes current `dist` files.
- `@aura3d/engine@1.0.10` packs with the public engine API, game runtime APIs, production runtime files, templates, README, and license.
- `create-aura3d@1.0.10` packs with product-viewer, cinematic-scene, mini-game, fighting-game, cartoon-channel, prompt-cartoon-channel, cartoon-studio, and episode-builder templates.
- All create-aura3d templates pin `@aura3d/engine` to `1.0.10`.
- `@aura3d/cli@latest` and `@aura3d/asset-index@latest` point to `1.0.10`.
- A clean consumer install can run `npx create-aura3d@latest my-scene --template product-viewer`, install, build, and test.

Required external checks:

```bash
npm view @aura3d/engine version dist-tags --json
npm view create-aura3d version dist-tags --json
npm view @aura3d/cli version dist-tags dependencies --json
npm view @aura3d/asset-index version dist-tags --json
```

## Game Runtime And Aura Clash Gates

Aura Clash Arena is the live Aura3D fighting-game showcase route, not a claim of a finished commercial fighting game. The route may be marketed as a browser-playable vertical slice when the current evidence is fresh.

Required proof:

- `pnpm --dir apps/aura-clash-showcase flagship:gates` passes.
- `AURA_CLASH_ORIGIN=https://aura3d.auraone.ai pnpm --dir apps/aura-clash-showcase launch:evidence` passes.
- `AURA_CLASH_DEPLOYED_ORIGIN=https://aura3d.auraone.ai pnpm --dir apps/aura-clash-showcase test:deployed-playable` passes.
- Production route, metadata, GLB assets, and audio assets return HTTP 200.
- The route publishes proof for controls, fighter assets, animation state, combat, audio, renderer, performance, deterministic replay, and errors.
- Screenshot artifacts exist for first-frame, combat-frame, and KO/reset review.

Visual approval remains separate. A generated screenshot or nonblank canvas is not a human approval record. To close the visual approval gate, run the approval command only after an actual reviewer approves the current screenshots:

```bash
AURA_CLASH_APPROVED_BY="<name>" AURA_CLASH_VISUAL_APPROVAL_CONFIRMED=1 pnpm --dir apps/aura-clash-showcase launch:approve-visual
pnpm --dir apps/aura-clash-showcase launch:update-prd
```

## Cartoon Production And Asset Catalog Gates

The 1.0.10 catalog/profile gate includes the cartoon profile work from the former 1.0.7 planning track:

- `@aura3d/asset-index` exports cartoon profile evaluation, starter pack data, and starter-pack adapter support.
- `@aura3d/cli` accepts `--profile cartoon-character`, `cartoon-prop`, `cartoon-set`, and `cartoon-environment`.
- `npx @aura3d/cli@latest assets search "cartoon character" --profile cartoon-character` returns curated profile-ready results from outside the monorepo.
- `npx @aura3d/cli@latest assets validate-cartoon` remains the validation path before cartoon/prompt-episode assets are called publish-ready.
- Cartoon templates document typed asset registration, AuraVoice bridge packages, shot timelines, captions, visemes, render package metadata, and review evidence.

Known verified result for the cartoon-character search gate:

```text
cartoon-starter:background-kid
cartoon-starter:hero
```

## Documentation And Marketing Gates

Current-release docs and the marketing site must say `1.0.10`, not `1.0.9`, for the active package line. Historical documents may mention older versions only when clearly framed as historical.

Required surfaces:

- `README.md`
- `llms.txt`
- `docs/project/current-state.md`
- `docs/project/release-tracks.md`
- `docs/project/game-runtime-release.md`
- `docs/project/aura-clash-showcase.md`
- `docs/api/assets.md`
- `docs/api/game-runtime.md`
- `docs/api/prompt-animation.md`
- `docs/examples/fighting-game.md`
- `docs/examples/cartoon-channel.md`
- `docs/templates/create-aura3d-templates.md`
- `marketing/index.html`
- generated marketing docs under `marketing/docs/`

The former active planning PRDs are no longer durable docs. Their enduring requirements now live in this gate document, the game runtime contract, the Aura Clash showcase doc, the asset docs, the cartoon-channel docs, and the release tracks/current-state docs.

## Homepage Visual Gate

The Aura Clash homepage visual must be a clean gameplay hero image:

- shows the neon arena and fighters;
- excludes browser chrome;
- excludes the in-game top navigation and bottom controls;
- excludes cropped HUD/header text;
- avoids broken or truncated UI;
- links through to the playable route.

The canonical marketing asset is:

```text
marketing/public/previews/aura-clash-arena.png
```

## Completion Definition

1.0.10 is complete when:

- npm `latest` resolves to 1.0.10 for engine, create-aura3d, CLI, and asset-index;
- docs and marketing current-release claims agree on 1.0.10;
- the two superseded PRD files are deleted;
- the homepage shows a clean Aura Clash fighter/arena hero image;
- production launch evidence passes against `https://aura3d.auraone.ai`;
- deployed playable browser parity passes against `https://aura3d.auraone.ai`;
- remaining visual approval boundaries are honestly represented and not fabricated.
