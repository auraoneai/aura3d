# Migration guide — showcase-courier-rush

Patch set: `migration/patches/showcase-courier-rush/` (steps 5–6 of §10 so far;
later steps land as their PRD items complete). Generated against
`main@5f5d6088`.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-courier-rush/*.patch
```

## Before numbers (main)

- capture branches: **2 ART / 7 FRAMING / 4 TRANSIENT / 6 UNKNOWN** (19 hits)
  — `showcase-courier-rush.parity.json` / `.parity.md`
- route-composition: 859 evidence / 1,646 presentation / 2,494 gameplay LOC
  (17.2% evidence) — `showcase-courier-rush.json`
- audio pipeline: `src/courier-audio.ts` (217 LOC hand-rolled web-audio),
  `scripts/build-sfx.mjs` + `register-sfx.mjs`, 10 generated
  `assets/sfx/*.wav`, 21 `public/aura-assets/courier*Sfx.*`, `courier*Sfx`
  typed-asset entries in `src/aura-assets.ts`

## Step notes

| Patch | What it does | Kept play values |
|---|---|---|
| `05-sound` | `courier-audio.ts` → `src/sound.ts` cue map over `game-sfx-core` ids + real `createGameSoundEngine`; van engine via `sound.engine(vanEngineSpec)` (`setRpm` from van speed, `setLoad` from throttle every frame); `city-night` ambience bed on first unlock; deletes `courier-audio.ts`, `scripts/build-sfx.mjs` + `register-sfx.mjs`, generated WAVs, `courier*Sfx` typed-asset/public entries, `build-sfx`/`register:sfx` scripts; `write-route-health.mjs` `audioAssetIds` emptied | same cue names + buses folded onto §6.8 ids (sfx/ui/ambience), cue loudness kept as `volumeDb`, `unlock` on first gesture, engine + ambient bed now actually play (main registered them but never called them) |
| `06-juice` | `juice.define({pickup, deliver, combo, strike})` over `createJuice` — `ringShockwave` → `fx.burst("ring")`, `hitSpark` → `fx.burst("spark")`, DOM `pulseStrikeFlash` → strike preset (overlay flash + shake + rumble); `runtimeEffects.update` → `tweenEngine.tick`; `game.effects` pool deleted; `@aura3d/game` dep added | reduced-motion gating kept (`!reducedMotion` still suppresses the deliver/combo ring + contact spark), toast callouts + cue names unchanged, strike flash moved from HUD DOM pulse to C-05 overlay (backend recorded as `dom` until Q-01-1/Q-11-1 land) |

## Cue mapping

| Cue | game-sfx-core ids | Bus | Note |
|---|---|---|---|
| `dispatch` | `ui.confirm.00/01` | ui | order card appears |
| `pickup` | `impact.plastic.medium.00–02` | sfx | parcel collected |
| `drop` | `stinger.checkpoint.00/01` | sfx | delivery made |
| `early-bonus` | `pickup.combo-up.00/01` | sfx | beat the clock |
| `strike` | `impact.metal.medium.00–02` | sfx | collision |
| `horn` | `stinger.alarm.00/01` | ambience | horn |
| `shift-clear` | `stinger.win.00/01` | ui | shift complete |
| `shift-fail` | `stinger.lose.00/01` | ui | shift failed |
| `city-bed` | `ambience.city-night` | ambience | looped bed, started on unlock |

Engine spec (`vanEngineSpec`): `idleRpm 700`, `maxRpm 4800`, bus `sfx`; on-load
anchors `vehicle.van.layer{0,1,2}.on` at 700/2400/4800 rpm with matching
off-load set; `updateEngine(speed, throttle)` maps `|speed|/13` into rpm and
throttle into the equal-power load blend. On main the `engine` cue existed
only as a registration that was never played — the loop is new runtime
behaviour, and `packages/game/fixtures/courier/engine.ts` exercises it for
`audio-live.spec.ts` (live RPM + load-blend assertions in a codec-capable
chromium).

## Ordering dependency (steps 5–6)

`src/sound.ts` imports `createGameSoundEngine` / `EngineLoopSpec` from
`@aura3d/audio` and points every asset at
`/packs/game-sfx-core/<id>.{format}`. Both the engine export and the pack
land with the PRD-09 sound slice (`qr/prd09-sound`): on `main` the audio
package only ships `createGameAudio`, so the migrated route compiles only
after that branch merges. The `{format}` placeholder resolves to the probed
encoding at runtime (`probeFormat` → `opus.webm`/`m4a`).

Step 6 additionally imports `createJuice` / `createFxParticlePass` /
`createOverlayDriver` / `createRumbleDriver` / `createTweenEngine` from
`@aura3d/game`; those exports land with the PRD-09 juice slice
(`qr/prd09-juice`). `app.effects` + `app.camera` exist on `main`, so the
patch needs only the game package to merge — the C-05 overlay stub already
degrades to `dom-fallback`.

## Verification (shadow migration, scratch tree only)

- `git am` applies steps 5+6 cleanly in order on `main@5f5d6088`.
- `src/sound.ts` type-checks against `packages/audio` at `qr/prd09-sound`
  (cue map, `EngineLoopSpec`, `sound.proof()` fields).
- `audio-live.spec.ts` proves the same engine spec live: six decoded
  sources, `playbackRate` follows rpm across all anchors, equal-power
  blend follows `setLoad`.
- `mountedEvidence.audio` keeps the same keys
  (`system:"audio.createGameSoundEngine"`, `cueCount`, `gestureUnlocked`,
  `sfxReady`, `recentCues`, `playedCueCount`, `contextState`, `assetUrls`).
