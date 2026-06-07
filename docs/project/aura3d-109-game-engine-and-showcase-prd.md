# Aura3D 1.0.9 Corrective Runtime Release PRD

Version: 1.0.9
Date: 2026-06-06
Status: Corrective patch release for the 1.0.6 runtime-foundation track
Historical parent: the 1.0.6 game-engine/showcase planning content has been folded into `docs/project/aura3d-110-release-gates.md`, `docs/project/game-runtime-release.md`, and `docs/project/aura-clash-showcase.md`.
Release gates: `docs/project/aura3d-109-release-gates.md`

Aura3D 1.0.9 is not a new attempt to claim mature game-engine parity. It is a corrective patch release created because the published `@aura3d/engine@1.0.6` tarball did not contain the new `dist/engine/production-runtime/TypedGLBActor.*` runtime files even though the local source and deployed Aura Clash route depended on that runtime path.

## Required Outcome

1.0.9 must make the npm registry, GitHub source, docs, marketing site, deployed Aura Clash route, and release gates agree on the same scoped runtime-foundation claim.

The release is successful only when:

- `@aura3d/engine@1.0.9` is published and its tarball contains `TypedGLBActor.js`, `TypedGLBActor.d.ts`, `GameAppRuntime.js`, and `GameAppRuntime.d.ts`.
- `@aura3d/cli@1.0.9`, `@aura3d/asset-index@1.0.9`, and `create-aura3d@1.0.9` are published or verified unchanged as compatible current packages.
- `npx @aura3d/cli@latest` proves `--profile fighting-character` search/resolve/validation behavior.
- `https://aura3d.auraone.ai/playable` and `https://aura3d.auraone.ai/apps/aura-clash` load the current route, current GLBs, current JS/CSS, and current proof object.
- The homepage, README, `llms.txt`, and docs say `1.0.9`, not `1.0.6`, for the current package release.
- Public claims remain scoped to runtime foundation and development showcase. No Unity, Unreal, Babylon.js parity, mature commercial engine, or flagship-quality game claim is allowed.

## Files To Modify Or Create

| File | Action | Acceptance criteria |
| --- | --- | --- |
| `package.json` | Bump root `@aura3d/engine` version to `1.0.9`; add `aura3d109:*` scripts. | `pnpm build:raw` produces `dist` with `TypedGLBActor.*`. |
| `packages/engine/package.json` | Bump internal runtime package to `1.0.9`. | Workspace versions align. |
| `packages/aura3d-cli/package.json` | Bump CLI package to `1.0.9`; point workspace asset-index dependency at `1.0.9`. | CLI package packs without stale `workspace:` dependency leaks. |
| `packages/asset-index/package.json` | Bump asset index to `1.0.9`. | Published CLI can consume the current profile logic. |
| `packages/create-aura3d/package.json` | Bump scaffold package to `1.0.9`. | `npx create-aura3d@latest` resolves to current package metadata. |
| `marketing/package.json` | Depend on `@aura3d/engine@1.0.9`. | Marketing build succeeds. |
| `tools/aura3d109-published-engine-proof/index.ts` | Create npm tarball proof. | Fails if the published engine tarball is missing `TypedGLBActor.*` or `GameAppRuntime.*`. |
| `tools/aura3d106-release-readiness/index.ts` | Add 1.0.9 published engine package gate and use 1.0.9 report paths. | `pnpm aura3d109:readiness` fails until npm package proof passes. |
| `tools/aura3d106-docs-claims/index.ts` | Validate `1.0.9` current-release wording. | `pnpm verify:aura3d109-docs-claims` passes. |
| `README.md` | Update current release to `1.0.9`. | README does not point users at a stale `1.0.6` package. |
| `llms.txt` | Update agent-facing current-release guidance to `1.0.9`. | Agents do not copy stale version claims. |
| `docs/project/current-state.md` | Update current package state to `1.0.9`. | Current state matches npm registry. |
| `docs/project/release-tracks.md` | Add 1.0.9 corrective release note. | Release track explains why 1.0.9 exists. |
| `docs/project/aura3d-109-release-gates.md` | Create/update scoped gates. | Gates include npm engine tarball proof. |
| `marketing/index.html` | Update visible version, JSON-LD, footer, and package callouts to `1.0.9`. | Deployed homepage shows `v1.0.9`. |

## Verification Checklist

- [ ] `pnpm typecheck`
- [ ] `pnpm build:raw`
- [ ] `pnpm verify:aura3d109-docs-claims`
- [ ] `pnpm --dir apps/aura-clash-showcase assets:check`
- [ ] `pnpm --dir apps/aura-clash-showcase test:flagship`
- [ ] `pnpm --dir apps/aura-clash-showcase test:playable`
- [ ] `pnpm --dir marketing build`
- [ ] Publish `@aura3d/engine@1.0.9`
- [ ] Publish `@aura3d/asset-index@1.0.9`
- [ ] Publish `@aura3d/cli@1.0.9`
- [ ] Publish `create-aura3d@1.0.9`
- [ ] `pnpm verify:aura3d109-published-engine`
- [ ] `pnpm verify:aura3d109-published-cli`
- [ ] Deploy marketing and alias `aura3d.auraone.ai`
- [ ] `pnpm verify:aura3d109-deployed-visual`
- [ ] `pnpm aura3d109:readiness`

## Explicit Non-Goals

1.0.9 does not claim:

- Unity replacement.
- Unreal competitor.
- Babylon.js parity.
- Mature commercial game engine.
- Flagship-quality Aura Clash game.
- Guaranteed production-ready game assets from every prompt.

The current package, game-runtime, showcase, and cartoon-production gates are tracked in `docs/project/aura3d-110-release-gates.md`.
