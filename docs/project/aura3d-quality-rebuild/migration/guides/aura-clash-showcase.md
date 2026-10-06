# Migration guide — aura-clash-showcase

Patch set: `migration/patches/aura-clash-showcase/` (step 5 of §10 so far;
later steps land as their PRD items complete). Generated against
`main@5f5d6088`.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/aura-clash-showcase/*.patch
```

## Before numbers (main)

- capture branches: **0 ART / 0 FRAMING / 0 TRANSIENT / 3 UNKNOWN** — only flag
  reads (`captureMode`/`reviewCapture` decl + dataset tagging); no divergent
  branches — `aura-clash-showcase.parity.json` / `.parity.md`
- route-composition: 16,279 evidence / 3,383 presentation / 42,941 gameplay LOC
  (26% evidence) — `aura-clash-showcase.json`
- audio: `auraClashAudioManifest` + `createAudioRuntime()` already drive
  `createGameAudio` (the C-25 adapter) with **11 Kenney CC0-1.0 typed samples on
  4 buses** (`music` / `sfx` / `voice` / `ui`) — nothing to regenerate or delete

## Step notes

| Patch | What it does | Kept play values |
|---|---|---|
| `05-sound` | keeps the adapter path: extends the manifest with the `round`/`fight`/`ko` announcer trio on `voice` (`creature.announcer.*`) and a `crowd-bed` music-track loop on `music` (`ambience.crowd-arena`) from `game-sfx-core`; `auraClashKoSfx` moves to the new `ko-impact` cue on `sfx` (KO announcer reads over the landing hit); wires `round` at the round ceremony, `fight` when the intro clears, `ko-impact` alongside `ko`, `startBeds()` on first round; adds `packAssetUrls` to the audio proof | all 11 CC0 samples + all 4 bus levels preserved verbatim; KO duck contract (`sfx` → 0.32 for 1.3 s) untouched; `cueCount` 16 → 20 |

## Cue mapping (added)

| Cue | game-sfx-core id | Bus | Fires |
|---|---|---|---|
| `round` | `creature.announcer.round.00` | voice | `ROUND n` ceremony starts |
| `fight` | `creature.announcer.fight.00` | voice | intro countdown clears |
| `ko` | `creature.announcer.ko.00` | voice | round ends (was `auraClashKoSfx`) |
| `ko-impact` | `auraClashKoSfx` (own sample) | sfx | same KO moment, under the line |
| `crowd-bed` | `ambience.crowd-arena` | music | looped, first round ceremony |

## Ordering dependency (step 5)

The pack cue urls use `{format}` (`/packs/game-sfx-core/<id>.{format}`), which
resolves through the C-25 engine path — `qr/prd09-sound` must merge before the
migrated route fetches them. The adapter (`createGameAudio`) surface, bus ids,
and the 11 own-sample urls are unchanged by the patch and compile against
`main`.

## Verification (shadow migration, scratch tree only)

- `git am` applies the patch cleanly on `main@5f5d6088`.
- Scratch vitest on the migrated tree (run inside the shadow, not committed):
  - `auraClashAudioAssets` = 11 entries, all `CC0-1.0` + non-empty hash,
    11 distinct urls
  - `auraClashAudioBusLevels` = exactly `{music, sfx, ui, voice}`
  - all 20 cues satisfy C-25 (`asset.url` present)
  - `round`/`fight`/`ko` resolve to `creature.announcer.*.{format}` on
    `voice`; `crowd-bed` resolves to `ambience.crowd-arena.{format}` on
    `music` with `loop: true`
- `auraClashAudioManifest.ts` and `AuraClashArenaApp.ts` type-check clean
  against `main` (pack refs are `AudioFileAssetLike`-compatible).
- `packAssetUrls` is additive in `AuraClashAudioProof` — `cueCount`,
  `typedAssetCount`, `assetUrls` keep their old shapes and bounds
  (specs assert `>= 10`).
