# Aura3D 1.4.5 Release Notes

Aura3D 1.4.5 is a maintenance release for the public game runtime, curated production showcase, and release infrastructure on top of the 1.4.4 game-geometry baseline.

## What Changed

- Added a bounded `paceMultiplier` to certified racing routes without changing their geometry or authored evidence duration.
- Grounded platformer checkpoint respawns on valid supporting surfaces and included finish surfaces in public playable-surface validation.
- Corrected Skyline Runner hazard placement, checkpoint safety, character scale, facing, animation-event handling, and generated geometry evidence.
- Corrected Turbo Drift Circuit gameplay pace and exposed a readable km/h speed display while retaining the certified route-speed baseline in evidence.
- Curated the promoted showcase to seven distinct route-library candidates plus Aura Clash. Superseded racing/platformer proofs and the duplicate headphone inspector remain accessible but are no longer promoted.
- Added complete production preview imagery and responsive showcase presentation, and corrected Aura Clash links for the nested production route.
- Aligned GitHub Actions with Node 22, pnpm 11.1.3, and current artifact actions; source package tests replace the obsolete coverage job.
- Prepared the package, template, API, governance, and marketing version set in lockstep at 1.4.5 for publication.

## Public Scope

The promoted route-library candidates are Product Configurator, Smart City Control, Cinematic Architecture, Digital Twin Operations, Blockfall Reactor, Skyline Runner, and Turbo Drift Circuit. Aura Clash is promoted separately as the flagship game experience. Retained diagnostics and superseded proofs are not counted as public release candidates.

The named racing and platformer routes remain bounded stylized presentations using certified asset pairs and retained evidence. This release does not prove arbitrary GLB-to-game conversion, general collision or vehicle physics, AI opponents, netcode, production game-engine parity, or root-wide renderer parity.

## Verification

```bash
pnpm verify:api-docs -- --write
pnpm verify:docs-version
pnpm verify:versioned-source-names
pnpm typecheck:raw
pnpm exec vitest run tests/unit/apps/showcase-gameplay-regressions.test.ts tests/unit/create-aura3d/showcase-platformer-spec.test.ts tests/unit/game-runtime/public-game-geometry.test.ts tests/unit/tools/showcase-route-gates.test.ts tests/unit/tools/verify-tools.test.ts --reporter=dot
pnpm --dir marketing build
pnpm verify:package-install-smoke:fresh
node tools/release/publish-all.mjs --dry-run
```

Publication uses the tag-triggered GitHub Actions release workflow, which validates and packs all 26 public packages before npm publication and GitHub release creation.
