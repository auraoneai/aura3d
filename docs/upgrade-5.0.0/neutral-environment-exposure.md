# W-4 analysis: which games depend on the regenerated neutral environment

Status: analysis only (no source changed, nothing captured). 5.0 regenerated `public/aura-environments/{neutral,indoor}.*` (`S5-WP04-05`), so any game lit by the neutral room probe can shift in pixels with no code change. This file lists each exposed game and what to pin. The pin decision is taken after the parent's single baseline drift capture (W-3): if a game did not move, do nothing.

Evidence method: `rg 'environments\.(neutral|capture)'` over the 25 games' source, plus a scan of the look presets whose procedural fill is `preset: "neutral"` (`packages/engine/src/agent-api/looks/lookPresets.ts`: `night-city` 0.85, `polar-night` 0.85, `space` 1.0, `underwater` 0.65, `neon-arcade` 0.85) and which games name them. `apps/showcase-*/src` of the apps that mount a port reuse the example folder code, so the example folder is the file to look at.

## A. Games that author `environments.neutral` / `environments.capture` directly (7)

| Game (slug) | Where | Default path | What to pin if the capture shows drift |
|---|---|---|---|
| Craterline GP (`strange-orbit-port`) | `examples/strange-orbit-port/world.ts:278-281` (`fill-environment`); `art/look.ts:113` default `environment: { kind: "neutral", intensity: 0.9 }`; `?env=neutral` forces it, `capture` rows use `environments.capture` (128 px probe, `update: "once"`) | neutral for the original look, capture for rows that ask for it | Keep `capture` rows as they are (they do not read the shipped neutral file). For the neutral rows pin an explicit HDRI via `environments.hdri` at the same `intensity` (`ENVIRONMENT_INTENSITY` / `row.environment.intensity`), or re-bake the old neutral probe as a game-local asset. Gouache `HEMI_GAIN` is calibrated to this fill: pin first for this game. |
| Chroma Roll (`splat-rush-port`) | `examples/splat-rush-port/backdrop.ts:105` (`backdrop-environment`); `look.ts:140` `environment: { kind: "neutral", intensity: 0.8 }` | neutral 0.8 (also a `hdri` branch in `backdrop.ts` for rows that name one) | Pin `environments.hdri` with the same intensity 0.8, or the legacy neutral asset. Bespoke GLSL reads the fill, so compare the 25 s static band. |
| Serpentine Sky Run (`serpentine-sky-run-port`, folder `examples/saiyan-snake-way-port`) | `world.ts:347-348`: `environments.preset("sunset", ...)` for the scripted dusk probe, otherwise `environments.neutral({ intensity: script && !envOverride() ? first.environmentIntensity : environmentIntensity() })` | neutral unless the colour script supplies the sunset probe | Pin neutral rows (non-script path). The sunset preset path is not a neutral-file consumer. |
| Gridlock Courier (`drift-and-deliver-port`) | `examples/drift-and-deliver-port/look.ts:356,388` (`env-room`, only when `neutral > 0`; `main.ts:92` `?neutral=` override) | depends on the look row's `neutral` value; `hdri` is used in the same file | For rows with `neutral > 0` replace with the row's existing HDRI at the same intensity, or leave as is when the row's `neutral` is 0. |
| Ion Circuit (`heatsink-port`) | `examples/heatsink-port/world.ts:178-179`: `environments.neutral` when `look.environment.kind === "neutral"` (default `art/look.ts:151`, intensity 1.0), `environments.capture` for `?env=capture` | neutral 1.0 | Pin an HDRI (or legacy neutral asset) at intensity 1.0; the capture path is unaffected. |
| Lamplight Line (`last-train-port`) | `examples/last-train-port/world.ts:306,349`: neutral only with the `nohdri` FX flag; default is `environments.hdri` (`BAND_HDRI[row.hdri]`, `ASSETS.skyHdr`) | hdri | Nothing to pin for the default path. Only the `nohdri` debug flag reads neutral. Lowest exposure of the seven. |
| Duneglide (`silt-and-signal-port`) | `examples/silt-and-signal-port/world.ts:300` (`look.environmentIntensity`) and `:462` (`rig.night ? 0.4 : 0.95`); comment at `:383` says the hemisphere adds to `environments.neutral` | neutral (both day and night rigs) | Pin an HDRI per rig at 0.95 / 0.4, or the legacy neutral asset; the hemisphere light was calibrated against this fill. |

## B. Games exposed through a look preset whose fill is `neutral` (implicit, 5 games)

The fill is added as a `lookFill` environment node and is dropped when the scene authors its own ambient light (`lookFill.ts`), so a game with its own ambient light is not exposed even if it names the preset.

| Game | Preset use | Notes |
|---|---|---|
| Thermal Drift (`heatsink`) | `looks.preset("night-city", ...)` at `apps/showcase-heatsink/src/original/scene.ts:90-91` | `night-city` fill neutral 0.85. The look also carries a city HDRI per plan 5.3; verify whether the fill is the only environment light. Check for an authored `lights.ambient` in the scene first. |
| Aura Hoops 3D (`aura-hoops-3d`) | `look: "interior-warm"`, `"night-city"`, `"neon-arcade"` in `src/courtRigs.ts:302,334,373`; `courtRigs.ts:303` also names `hdri: "indoor-workshop"` | `night-city` and `neon-arcade` fills are neutral 0.85; `interior-warm` is not listed with a neutral fill. |
| Aura Diamond 3D (`aura-diamond-3d`) | `src/rules.ts:73-77`: Midtown `night-city`, Dome `interior-industrial`, Lunar `polar-night` | `night-city` and `polar-night` (neutral 0.85). |
| Aura FC 3D (`aura-fc-3d`) | `src/game/look.ts:85-146`: Munich, Kyoto, Favela on `night-city`, Glacier on `polar-night` | four of the venues use a neutral fill preset. |
| Slingshot Siege (`slingshot-siege`) | `src/game/look.ts:334` `preset: "polar-night"`; `stageOriginal.ts:79` `looks.preset("outdoor-day")` | one of its stages is on `polar-night`. |

To pin a preset-based look: pass the look an explicit HDRI (`environments.hdri` with a catalogue HDRI the game already ships) and keep the preset's intensity, or set the look's `fill` override to a game-local asset. Prefer doing nothing when W-3 shows the static bands within the `luma-band` tolerance.

## C. Games with no neutral dependency found (13)

`top-tennis`, `roadster-rush` (hand-built rig; its `golden-hour` preset has no neutral fill), `teleoperator`, `iron-crown`, `pips-big-leap`, `bunker-zero`, `dot-dash-3d` (explicit `indoor-workshop` HDRI), `aura-links-3d`, `cross-hop`, `ninja-runner-port`, `roadster-hours-port`, `where-the-wind-wanders-port`, `cloud-runner-port`. Caveat: `looks.*` usages in `aura-links-3d`, `pips-big-leap`, `cross-hop` pass computed preset ids that a plain `rg` cannot resolve; confirm against the W-3 capture rather than by grep.

## Notes and boundaries

- The plan (section 8, W-4) lists six neutral ports plus `heatsink-port` and `strange-orbit` for capture. The scan above confirms seven direct consumers and corrects two details: `last-train-port` uses neutral only behind the `nohdri` flag, and `strange-orbit-port` uses both neutral (default) and capture (row dependent).
- Section B (look-preset fills) is new: five games can shift without ever naming `environments.neutral`.
- `indoor.*` was regenerated too; the only game that names `indoor` is a catalogue HDRI id (`indoor-workshop`, a different asset), so no game was found reading `public/aura-environments/indoor.*`.
