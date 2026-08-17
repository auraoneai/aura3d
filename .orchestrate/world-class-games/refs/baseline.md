# World-class showcase games — planner baseline

Internal player-experience target only. Do **not** write world-class, flagship,
AAA, photoreal, Celeste-quality, Street Fighter-quality, Gran Turismo, or
Unity/Unreal replacement in README, route-health, marketing, or public copy.

Classification stays honest:

| Game | Class | Claim label |
| --- | --- | --- |
| Turbo Drift Circuit | `prototype-blocked` | `createAuraApp` root arcade racer |
| Skyline Runner | `prototype-blocked` | `createAuraApp` root platformer |
| Aura Clash Arena | `development showcase` | `production-runtime` fighter |

A named human reviewer flips classification. Workers do not.

## Shared hard rules

1. Turbo and Skyline: public imports from `@aura3d/engine` + generated `assets` only. No `three`, no `GLTFLoader`, no hand-wired render loops.
2. Clash may keep `@aura3d/engine/production-runtime`, `advanced-runtime`, `rendering`, `scene`, `animation`. Label Clash visual claims `production-runtime`.
3. Typed assets only. This wave: do **not** run `assets add` / edit root `src/aura-assets.ts` / `aura.assets.json` / `public/aura-assets/**`. Leave an audio cue wishlist in the handoff.
4. Do not hand-edit `src/generated/game-geometry.ts` or generated `src/aura-assets.ts`.
5. DOM/CSS is UI only. No fake bloom, trails, explosions, scanlines, or particles in CSS.
6. Do not silently promote classification or hand-author `tests/reports/**` / `route-health.json`.
7. Do not break existing tests to hide a gap. Add new unit tests under `tests/unit/apps/` (Turbo/Skyline) or app-local tests (Clash). Do **not** edit shared Playwright specs `tests/browser/showcase-gameplay-proof.spec.ts` or `tests/browser/showcase-touch-controls.spec.ts` in this wave.
8. Pause must freeze simulation, AI, and combat. Reset must restore the full baseline.
9. `game.accessibility.reducedMotion` disables camera shake / hit-stop punch / heavy flashes.
10. Session length stays at or above current bars: Turbo four laps, Skyline 70–115s, Clash a full round to KO.

## Public helpers already exported

Use these when the route already can import them:

- `game.cameraDirector(...)`
- `game.effects(...)`
- `game.hud.bindings([...])`
- `game.accessibility.reducedMotion(...)`
- `effects.fog(...)`, `effects.ambientOcclusion(...)`, `effects.neonBloom(...)` (do not advertise a production post stack)
- `environments.studio(...)` (Turbo already uses this; do not overclaim IBL)
- `bindGameTouchControls` / `game.touchControls`

If a public API cannot do a requested juice moment, put it in a short `KNOWN-LIMITS` note on the route as **route-local / not proven**. Do not hack it with forbidden imports.

## Evidence globals to preserve

- Turbo: `window.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__` and `window.__AURA3D_COMPOSITION_PROBE__`
- Skyline: `window.__AURA3D_SHOWCASE_SKYLINE_RUNNER__` and `window.__AURA3D_COMPOSITION_PROBE__` including `settleSubjectPose()`
- Clash: `window.__AURA_CLASH_ARENA_PROOF__` (`aura-clash-arena-proof/v1`) including `controls.*` and `camera.*`

Do not set `visualReviewPass: true` or self-approve release.

## Wave split

This wave is HUD + feel + AI/juice + ceremony + pause/reset + tests.
Audio CLI registration is a later wave. Clash may reuse its existing typed SFX manifest.
