# Aura Clash Showcase

Version: 1.0.5
Status: Active showcase documentation
Replaces: `GameShowCasePRD.md`

Aura Clash is the flagship browser-game showcase for Aura3D. It exists to prove the public Aura3D SDK can support a typed-asset, browser-native fighting-game route with runtime nodes, input, movement, combat, animation state, HUD updates, evidence, screenshots, and static deployment checks.

This document is the maintained product and evidence source for the showcase. Historical implementation logs from the former root PRD were summarized here and should not be reintroduced as root planning files.

## Product Target

- Working title: `Aura Clash`
- Route target: `/playable` during development and `/showcase/aura-clash/playable/` for marketing-linked deployment.
- App target: `apps/aura-clash-showcase/`
- Package baseline: `@aura3d/engine@1.0.5`
- Asset rule: all runtime models must be typed assets from `src/aura-assets.ts`; do not use string model ids, invented GLB URLs, raw loaders, or direct Three.js imports.

## Pivot Decision

The previous World War X/public-figure fighter concept is not the active launch target.

Reasons:

- Public-figure GLBs were inconsistent in scale, rig quality, pose, material quality, licensing friction, and animation readiness.
- A flagship SDK demo needs a coherent art direction and repeatable asset pipeline.
- Quaternius CC0-style packs and validated typed assets are a better foundation than assorted likeness downloads.
- Aura Clash should prove Aura3D systems, not custom route-only hacks.

World War X remains legacy archive/context only. Aura Clash is the active showcase.

## Creative Direction

Aura Clash should read as a premium stylized neon arcade arena fighter:

- Side-view 2.5D fighting composition.
- Deep void/teal/violet/amber arena identity.
- Coherent humanoid fighters with readable silhouettes.
- Arena depth from skybox, skyline, fog, rim lighting, floor grid, portal/core energy, banners, and reflective platform treatment.
- HUD with clear health, timer, state, controls, and evidence status.
- Debug/hitbox visuals hidden by default and available only through evidence/debug modes.

The target is not a Unity/Unreal-quality commercial fighter yet. The target is a credible browser SDK showcase that is visually intentional, playable, and honest about remaining limits.

## Required Gameplay

The playable route must support:

- Left/right movement.
- Jump and downward/crouch/fast-fall input.
- Dash.
- Guard.
- Light, heavy, and special attacks with visibly distinct animation states.
- Hit detection and damage.
- Hit stun, knockback, and recovery.
- Opponent AI with spacing and attacks.
- Round reset after KO.
- Pause and accessibility controls.
- HUD health/timer/state updates from real game state.

Known game-feel requirements from recent reviews:

- Jump height must be high enough to read.
- Down input must do something visible and useful.
- `Q` guard and `L` special must not pause or crash the route.
- `J`, `K`, and `L` attacks must look different, not only nudge a character.
- KO must stop repeat-hit loops; the defeated fighter should stay in KO until reset.
- Hit VFX should not show debug boxes or random line/box artifacts in normal play.
- Damage should not KO the opponent in one or two accidental hits unless the move is explicitly a super.

## Asset Pipeline

Use the Aura3D CLI and typed asset flow:

```bash
npx @aura3d/cli@latest assets search "animated stylized humanoid fighter" --animated --json
npx @aura3d/cli@latest assets resolve "animated stylized humanoid fighter" --name fighter
npx @aura3d/cli@latest assets add ./assets/source/fighter.glb --name fighter
npx @aura3d/cli@latest assets validate-game --output launch-evidence/assets-validate-game.json
```

The CLI/catalog path is a release blocker. If `npx @aura3d/cli@latest` is not published and externally usable, the public agent instructions are broken.

Current reality from the 1.0.5 audit:

- Local workspace CLI catalog search works.
- Packed CLI tarball plus `@aura3d/asset-index` tarball can search the hosted catalog from a temp directory.
- npm registry does not yet expose `@aura3d/cli`.
- The final V6 route uses a validated local animation-ready asset instance, not a fresh prompt-resolved fighter from npm.
- The catalog returned candidates, but the resolved candidate used during development was not good enough as a shipping fighter.

Release rule: do not claim the AI prompt asset workflow is fixed until `@aura3d/asset-index@1.0.5` and `@aura3d/cli@1.0.5` are published and this command works outside the monorepo:

```bash
npx @aura3d/cli@latest assets search "animated fighter" --animated --json
```

## Evidence Checklist

Before the route is called launch-ready:

- `pnpm typecheck` passes.
- `pnpm build` passes.
- `apps/aura-clash-showcase` build passes.
- `apps/aura-clash-showcase` playable smoke tests pass.
- `/playable` loads locally.
- No browser console errors during boot.
- No failed JS, CSS, GLB, glTF, texture, or image requests.
- Canvas is not blank.
- Aura3D evidence object is present.
- Frame count advances.
- At least two fighter runtime nodes exist.
- Player input changes player position.
- Jump, down/crouch, dash, guard, light, heavy, and special change state.
- Visible animation/pose changes on attack.
- Hitbox/hurtbox collision reduces opponent health.
- HUD reflects real health, timer, and state.
- Reset round works after KO.
- Pause works and resumes without corrupting input.
- Accessibility toggles work.
- Screenshots show a readable, non-broken game scene.
- Deployed route behaves the same as local.

## Deployment Proof

Deployment proof must include:

- page returns 200;
- JS chunks return 200;
- GLBs return 200;
- textures/images return 200;
- no blank canvas;
- no console errors;
- controls still work;
- screenshot matches the local route.

Recommended Playwright smoke tests:

```ts
test("AuraClash boots Aura3D runtime", async ({ page }) => {});
test("AuraClash advances frames", async ({ page }) => {});
test("AuraClash loads GLB fighters", async ({ page }) => {});
test("AuraClash responds to movement input", async ({ page }) => {});
test("AuraClash plays attack animation", async ({ page }) => {});
test("AuraClash resolves a hit", async ({ page }) => {});
test("AuraClash updates HUD health", async ({ page }) => {});
test("AuraClash supports pause and accessibility toggles", async ({ page }) => {});
test("AuraClash captures visual proof screenshots", async ({ page }) => {});
```

The active test file should live at:

```text
apps/aura-clash-showcase/tests/playable-smoke.spec.ts
```

## Current 1.0.5 Status

What is real:

- Aura Clash now has a V6 route using Aura3D runtime APIs and typed assets.
- Local build and smoke tests have passed during the release audit.
- The arena design was improved from the primitive/flat V5 route.
- The route proves basic movement, animation state, damage, HUD updates, and evidence hooks.

What is still not good enough:

- The game is not visually or mechanically strong enough to claim “world-class.”
- Catalog/AI prompt asset resolution did not deliver final usable fighter assets.
- Some combat states and KO/reset behavior need polish.
- Normal play must not show box/line artifacts for hit effects.
- `Q`, `L`, jump/down, KO loop, and damage tuning need focused regression tests after fixes.
- Aura Clash should not be used as proof that Aura3D is comparable to Unity or Unreal.

## Definition Of Done

Aura Clash is done when:

- The shipped route is visibly playable, not just technically interactive.
- The active fighters are typed assets with usable animation metadata or a documented, visually acceptable runtime animation layer.
- All controls visibly do something distinct.
- Combat resolves without debug artifacts in normal mode.
- KO and reset behavior are stable.
- Local and deployed smoke tests pass.
- Screenshots are visually approved.
- Evidence JSON proves Aura3D owns the runtime systems being claimed.

