# Skyline Runner incorporation constraints (SR-01)

Read before touching this route again. Derived from `CurrentGames-PRD/05-Skyline-Runner.md`
§1 and from a re-read of the owning sources on 2026-08-17.

## Hard contracts (nothing may break these)

1. **The 70–115s completion window.** `src/level-proof.ts` drives the public
   `game.platformer` kit over the route's own asset-bound level with a deterministic
   input policy (`run right`, jump near edges/rising steps/hazards) and records the
   exact physical finish frame. `tests/unit/apps/skyline-sixty-second-level.test.ts`
   asserts `finishFrame/60 ∈ [70, 115]` plus traversal ≥ 148 units and six relay
   activations. The proof runs twice and must stay deterministic.
   - Never edit platform/hazard/checkpoint/collectible positions in
     `generated/game-geometry.ts` or the derived arrays in `src/level.ts`.
   - Never touch motion constants fed by `skylineMotion` (`gravity`,
     `jumpVelocity`, `moveSpeed`, coyote/buffer, jump-release scale).
   - Ghost playback (SR-A1) is a **separate** kit instance; it can never feed state,
     events, or timing back into the live run.
2. **`src/generated/game-geometry.ts` stays byte-identical.** It is generated from
   the certified world GLB surface map. No hand edits, no regeneration as part of
   polish work.
3. **`createSkylineLevel()` is the single level owner.** `main.ts` and
   `level-proof.ts` both consume it. Additive exports are allowed; gameplay fields
   are not.
4. **Existing checkpoint assertions are authoritative and unedited.** The ceremony
   spec (`tests/browser/skyline-ceremony-evidence.spec.ts`) and traversal/motion
   specs keep their assertions; sensor work (SR-A5) only adds coverage evidence.
5. **Existing audio cue set (10 typed stems) and manifest stay.** Extend only:
   new cues join `skyline-audio-manifest.ts`; existing cue→asset bindings do not
   move. All audio enters through the CLI (`aura3d assets add`) so provenance and
   hashes land in `aura.assets.json` / `src/aura-assets.ts`.
6. **Label discipline.** The route stays `createAuraApp` /
   `prototype-blocked` until independent human review. New systems publish honest,
   observed-only evidence fields on `window.__AURA3D_SHOWCASE_SKYLINE_RUNNER__`.
7. **Renderer-owned visuals only.** No DOM/CSS stand-ins for scene content: ghost
   echo, foliage, backdrop bands, and act glyphs are scene nodes; HUD text/buttons
   are UI.

## Incorporation map (what touches what)

| ID | Feature | Owns | May modify |
|---|---|---|---|
| SR-A1 | Speedrun ghost | new `src/ghost.ts` | `src/main.ts` wiring, `src/hud.ts` toggle/badge |
| SR-A2 | Instanced foliage + sparkle consolidation | new `src/foliage.ts` | `src/level.ts` additive exports only |
| SR-A3 | distanceLod backdrop bands | new `src/backdrop.ts` | `src/level.ts` additive exports only |
| SR-A4 | text3D act gates | `src/level.ts` additive transition list | ceremony spec screenshots |
| SR-A5 | Relay overlap sensors | `src/level.ts` additive sensor export | new unit test only |
| SR-A6 | Ambience bus + stems | `src/skyline-audio*.ts`, `scripts/build-sfx.mjs` | CLI registration for 3 new stems |
| SR-A7 | Moving platforms | decision memo only — default NOT in scope | docs |

## Verification ladder (per change)

1. `pnpm --filter @aura3d/showcase-skyline-runner typecheck`
2. `pnpm vitest run tests/unit/apps/skyline-sixty-second-level.test.ts` (window intact)
3. New + neighboring unit suites (`skyline-*`).
4. Playwright: `tests/browser/skyline-ceremony-evidence.spec.ts` and
   `tests/browser/skyline-platformer-motion.spec.ts` (mounted finish + feel).
5. Deploy gate per `showcase-evidence-checklist.json` after a fresh app build.
