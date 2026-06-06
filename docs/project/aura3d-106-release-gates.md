# Aura3D 1.0.6 Release Gates

Version: 1.0.6 target
Status: Draft release gate, release-blocking
Current published baseline: `@aura3d/engine@1.0.5`
Related PRD: `docs/project/aura3d-106-game-engine-and-showcase-prd.md`

Aura3D 1.0.6 must not be published or marketed as a mature game engine until the gates in this document pass with current, reproducible evidence.

This document is intentionally stricter than the 1.0.5 release notes. Aura3D 1.0.5 proves a browser runtime foundation and an Aura Clash development showcase. It does not prove Unity, Unreal, Babylon.js, or full game-engine parity.

## Current Release Decision

Current decision: `release-blocked`

Reason: the 1.0.6 PRD still has open P0 blockers for runtime unification, reusable GLB actor animation, engine-owned combat simulation, game-asset profile validation, flagship-quality Aura Clash gameplay/art/audio/performance, and deployed proof parity.

Allowed current public wording:

- Aura3D 1.0.5 is an AI-native TypeScript browser 3D SDK.
- Aura3D supports typed GLB/glTF asset workflows, scene kits, runtime helpers, diagnostics, screenshots, and deployment checks.
- Aura Clash Arena is a development showcase and runtime proof target.
- Aura Clash Arena is not yet proof of a mature game engine or a flagship-quality fighting game.

Disallowed current public wording:

- Aura3D is a Unity replacement.
- Aura3D is an Unreal competitor.
- Aura3D has Babylon.js parity.
- Aura3D is a mature commercial game engine.
- Aura Clash is a polished flagship game.
- The AI prompt/catalog CLI always returns production-ready fighter assets.

## P0 Release Gates

Every P0 gate must pass before any 1.0.6 game-engine or flagship-showcase release claim.

| Gate | Required evidence | Blocking if missing |
| --- | --- | --- |
| Runtime lifecycle | Shared public game runtime API used by a clean sample and Aura Clash; tests for start, pause, resume, step, resize, dispose, focus recovery, and duplicate-loop prevention. | Yes |
| Typed GLB actor path | Typed `model(assets.x)` actors animate through public APIs with evidence for skeleton, clips, pose updates, and renderer binding. | Yes |
| Animation/gameplay events | Idle, walk, jump, down/fast-fall, guard, light, heavy, special, hit, KO, and reset states produce visible animation changes and deterministic event evidence. | Yes |
| Engine-owned combat | Hitboxes, hurtboxes, guard, hitstun, recovery, knockback, damage, KO, and reset are driven by reusable engine/game-kit code, not private route-only logic. | Yes |
| CLI game asset profile | External `npx @aura3d/cli@latest assets search ... --profile fighting-character --json` and `assets validate-game` can rank, reject, and prove game-ready candidates or clearly fail with reasons. | Yes |
| Aura Clash asset quality | Two distinct, licensed, typed, rigged fighter assets or a documented owned art path; same-model tinting cannot be used as flagship proof. | Yes |
| Aura Clash gameplay quality | A/D/S/Space/Shift/Q/J/K/L/P/R all work after boot, reset, pause, and KO; J/K/L are visually distinct; Q guards; S/down is visible; L never crashes or pauses unexpectedly. | Yes |
| Aura Clash round integrity | No repeated KO/hit loop, no one/two accidental hit KO, no post-KO damage, reset fully restores state. | Yes |
| Aura Clash normal visuals | No debug boxes, random hit lines, blank canvas, broken scale, offscreen fighters, or homepage image that looks better than the actual playable route. | Yes |
| Audio | Licensed/owned music/SFX, mute, autoplay-safe unlock, event-driven hit/jump/guard/special/KO cues, and proof that files return 200. | Yes |
| Performance | Load, JS, GLB, texture, draw-call/frame-time, memory, and mobile budgets with current reports. | Yes |
| Deployment parity | Local and deployed `/playable` proof for page 200, JS/CSS 200, GLB/texture/audio 200, no console errors, no blank canvas, controls work, screenshots match. | Yes |
| Docs/claims | README, `llms.txt`, docs, marketing pages, npm/GitHub copy, and site metadata use scoped 1.0.5/1.0.6 wording and do not overclaim. | Yes |

## Current Known Blockers

- Published `@aura3d/cli@latest` is still the old public package and fails the fighting-character profile proof: it does not expose profile diagnostics in search results and it accepts a static aircraft as a fighter resolve target.
- The deployed Aura Clash routes are stale. Current live `/playable` and `/apps/aura-clash` still serve attempt-numbered chunks, attempt-named typed assets, and an old attempt proof object instead of the contextual 1.0.6 route proof.
- Local Aura Clash gates, local CLI/profile tests, local packed CLI proof, docs/claims, performance budgets, and versioned-source-name gates have evidence, but they do not clear the release until npm `@latest` and deployed-route proof also pass.
- Any GitHub/npm release must wait until the gates above pass and the current evidence is regenerated.

## Required Commands Before 1.0.6 Publish

Run these from the repository root and keep the generated evidence with the release:

```bash
pnpm verify:docs-version
pnpm verify:docs-consistency
pnpm check:marketing-truth
pnpm check:marketing-links
pnpm verify:versioned-source-names -- --out tests/reports/aura3d106/versioned-source-names.json
pnpm --dir apps/aura-clash-showcase assets:check
pnpm --dir apps/aura-clash-showcase typecheck
pnpm --dir apps/aura-clash-showcase build
pnpm --dir apps/aura-clash-showcase test
pnpm --dir marketing build
pnpm verify:aura3d106-local-cli-pack
pnpm verify:aura3d106-deployed-visual
pnpm check:tarballs
pnpm check:clean-install
pnpm aura3d106:prepublish-readiness
```

Expected state today: local/source/package gates should pass, but `pnpm aura3d106:prepublish-readiness` remains blocked until the public deployment is updated. The final `pnpm aura3d106:readiness` command remains blocked until the corrected packages are also published to npm and `pnpm verify:aura3d106-published-cli` passes against `@latest`.

## Packed CLI Catalog Proof Before Publish

Before any `npm publish`, prove the exact packed local CLI and catalog packages from a clean external npm project. This is separate from `pnpm verify:aura3d106-published-cli`, which intentionally checks the already-published `@latest` package after publication.

```bash
pnpm verify:aura3d106-local-cli-pack
```

This command builds the workspace, packs `packages/asset-index` and `packages/aura3d-cli` with `pnpm pack`, checks that the packed CLI manifest rewrites `workspace:` dependencies to publishable semver, installs both tarballs in a clean npm project, and runs:

```bash
./node_modules/.bin/aura3d assets search "animated humanoid fighting character" --profile fighting-character --json
./node_modules/.bin/aura3d assets resolve "static aircraft" --name badFighter --profile fighting-character --json
```

Accepted search outcomes:

- one or more usable `candidates`, each with `profile.name === "fighting-character"` and `profile.suitable === true`; or
- zero usable `candidates` with non-empty `rejectedCandidates`, `rejectionReasons`, and an explicit "No fighting-character-ready candidate" diagnostic.

Rejected assets such as spiders, aircraft, static props, IP-risk characters, and candidates missing animation metadata may appear only in `rejectedCandidates`, never as usable `candidates`.

## Publish Sequence

Do not run `npm publish`, create a GitHub release, or deploy marketing copy that claims 1.0.6 readiness unless:

- every P0 gate above has current evidence;
- `pnpm aura3d106:prepublish-readiness` exits successfully;
- the packed local CLI/catalog proof above passes from a clean external npm project;
- local and deployed Aura Clash proof match;
- npm package smoke tests pass from a clean external directory using packed local tarballs;
- `README.md`, `llms.txt`, docs, marketing, npm metadata, and GitHub release notes all use the same scoped claims.

After npm publication, run:

```bash
pnpm verify:aura3d106-published-cli
pnpm aura3d106:readiness
```

Both must pass against `@aura3d/cli@latest` before marking the release complete or updating public marketing copy from release-blocked wording to 1.0.6 release wording.
