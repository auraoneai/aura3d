# runner-kit

Shared presentation kit for the Splat-sibling runner games (Shape Shift Sprint, Number Surge, Splat Turf,
Polarity Orbs, Beat Hopper). Every module is **copied** from `examples/splat-rush-port/` and stripped of
Splat-specific content; Splat itself is untouched and keeps its own copies. Nothing here imports from
`apps/` or from `examples/splat-rush-port/`.

| Module | Contents | Copied from |
| --- | --- | --- |
| `rng.ts` | `GameRng` — seeded counted stream (`createCountedRng`) | `rng.ts` |
| `look-utils.ts` | `hexSrgb`, `hexToLinear`, `sunDirection`, `Rgb` | `look.ts` colour helpers |
| `shaders.ts` | Toon/flat/sky/shadow GLSL 300 es + `material.custom` spec builders; P-01 shoulder rolloff; `gradientSkyFragment(stops)` for per-game skies | `shaders.ts` original programs, `world.ts` spec builders |
| `batch.ts` | `Batch` (dirty-range attribute uploads), `Slots` (stable pool slots), `mergeMeshes`, `scrollFrameZ` | `world.ts` Batch/Slots, `meshes.ts` merge |
| `popups.ts` | `Popup`, `drainPopups` (seq-based drain past 64 entries), `POPUP_LIMIT` | `presentation.ts` drainPopups, `sim.ts` Popup |
| `screen-fx.ts` | `ScreenFx` (flash/reveal/vignette), `flashStrength`, `vignetteOpacity`, reduced-motion caps | `fx.ts` (event mapping left to each game) |
| `hud-utils.ts` | `luminance`, `contrastRatio`, `letterbox`, `comboTubeFill` (parameterized) | `hud.ts` helpers |
| `audio-kit.ts` | `createGameSound` over `createCueBank`/`createStepSequencer`; `SoundEvent`/`SoundDiff` contracts | `audio.ts` SplatSound |

Sims stay pure (`src/sim.ts`, no engine imports); the kit is presentation-side except `GameRng`, which wraps the
engine's counted RNG for deterministic gameplay draws.