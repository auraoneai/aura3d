# Aura3D 1.4.4 Release Notes

Aura3D 1.4.4 closes the certified game-presentation and production website gap on top of the 1.4.3 package baseline.

## What Changed

- Added fail-closed CLI certification for racing tracks, racing vehicles, platformer worlds, and platformer characters, bound to current hashes, retained render probes, provenance, and route evidence.
- Added mesh-derived racing topology and platformer surface extraction, pair-level composition checks, scene-scale pacing, reusable contact queries, and compiler-emitted immutable geometry contracts.
- Rebuilt Turbo Drift Circuit and Skyline Runner with release-certified Kenney pairs, accepted desktop/mobile visuals, route-primary and gameplay proof, 30-second category floors, and direct deploy checks.
- Retained independent automated visual-QA reports for the two established public game proofs plus Turbo and Skyline. Manual review remains a downward-only veto.
- Established the release-candidate slate, then retired superseded racing/platformer proofs and the duplicate headphone inspector from promotion. The current marketing slate contains eight distinct experiences: seven route-library candidates plus Aura Clash, while retained diagnostics remain outside the public count.
- Restored the complete Aura3D marketing website at `https://aura3d.auraone.ai`, replacing the accidentally deployed static example registry, and published all accepted showcase routes from the same production build.

## Public Game Scope

The three current public racing/platformer routes are bounded stylized presentations using named certified asset pairs and retained evidence. They do not prove arbitrary GLB-to-game conversion, production physics, AI opponents, netcode, a general collision engine, or production game-engine parity.

## Verification

```bash
pnpm verify:api-docs -- --write
pnpm verify:docs-version
pnpm check:agent-docs
pnpm check:marketing-truth
pnpm check:marketing-links
pnpm typecheck:raw
pnpm exec vitest run tests/unit/create-aura3d tests/unit/game-runtime tests/unit/tools --reporter=dot
pnpm exec vitest run tests/unit/aura3d-cli tests/unit/asset-index --reporter=dot
pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line
pnpm exec playwright test tests/browser/showcase-gameplay-proof.spec.ts --reporter=line
pnpm exec playwright test tests/browser/showcase-release-asset-probes.spec.ts --reporter=line
node tools/showcase-library/build-and-check.mjs
pnpm --dir marketing build
node tools/release/publish-all.mjs --dry-run
```

Publication uses `node tools/release/publish-all.mjs`; deployment uses the linked `marketing` Vercel project and assigns its production deployment to `aura3d.auraone.ai`.
