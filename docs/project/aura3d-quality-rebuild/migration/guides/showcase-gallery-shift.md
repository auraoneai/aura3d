# Migration guide — showcase-gallery-shift

Patch set: `migration/patches/showcase-gallery-shift/` (steps 2–4, 8, 10, 11
of §10). Generated against `main@5f5d6088`. Filenames encode apply order.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-gallery-shift/*.patch
```

## Before numbers (main)

- capture branches: **5 ART / 2 FRAMING / 0 TRANSIENT / 10 UNKNOWN** —
  `visualReviewCapture` (`?capture=review`) in `main.ts` (11 refs: review guard
  tableau, light/point swaps, overhead review lens fov 38, mine/sightline
  hiding, review-ready gate).
- globals: `__AURA3D_COMPOSITION_PROBE__` (deleted);
  `__AURA3D_SHOWCASE_GALLERY_SHIFT__`/`__GALLERY_SHIFT_EVIDENCE__` (→ lazy
  sections, `__GALLERY_SHIFT_EVIDENCE__` still written); test hooks kept:
  `__GS_SHOT__`/`__GS_PUMP__`/`__GS_RESET_CAPTURE__`/`__GS_TELEPORT__`.
- HUD: the "Backend rapier / LOS rays / Sensors / Steps" `.evidence-strip`
  section + its `gs-ev-*` writes are deleted (PRD wave-3 text removal).
- route-composition (main): 1,794 evidence / 2,043 presentation / 3,886 gameplay LOC
- route-composition (after): 1,688 evidence / 2,023 presentation / 4,071 gameplay LOC

## Step notes

| Patch | What it does | Kept play values |
|---|---|---|
| `02-create-game-capture-cleanup-hud-removal-evidence` | `createGameApp` → `createGame({id:"showcase-gallery-shift", target:"#app", diagnostics, physics, input, loop:{fixedDt:1/60,maxSubSteps:2}, scene:buildScene(), qualityRebuild:{flags:["game"]}, evidence:{sections.gallery,legacyGlobals}, scenarios})`; `app = galleryGame.runtime`, `input = galleryGame.input` + `galleryGame.start()`; 11 `visualReviewCapture` refs → play arm (play ambient .38/moon 1.05/rim .58/flashlights 1.55, play lens [0,16.8,17.2] fov 43, mine + LOS sightlines visible, 90-frame ready gate); `.evidence-strip` HUD section + `gs-ev-*` writes removed; `__AURA3D_COMPOSITION_PROBE__` deleted; `paused` → `galleryGame.session.paused`; `publishEvidence`→`collectGalleryEvidence()` (still writes `__GALLERY_SHIFT_EVIDENCE__`) bound via `src/evidence.ts`; `src/scenario-drive.ts` (`pumpFrames`/`teleport`→`__GS_TELEPORT__`); `src/scenarios/` `play` + `mid-heist` (teleport hall + 120 steps) | los/sensor/footstep counters still feed evidence; all `__GS_*` hooks; gamepad/touch input config |
| `06-juice` | `createJuice` over 8 events: `guard-alert`/`alert-rise` vignette+flash, `lift` pickup+punch, `drop` debris, `win` ring+flash, `caught` flash+vignette+hitStop .06, `camera-whir` spark, `artifact` spark (laser trip); `galleryTween.tick(dt)` in onFrame; `@aura3d/game` dep | `pushCue`/`audio.cue` calls untouched |

## No step 5/7/9/12

- **05-sound**: `heist-audio` already `createGameAudio` — no-op.
- **07/09/12**: DOM HUD buttons (`gs-*-button`) + `input.touch` stay route-owned.

## Spec-migration handoffs (Q-14-1 → filed)

- Specs asserting `#gs-ev-backend`/`#gs-ev-rays`/`#gs-ev-occluded`/`#gs-ev-sensors`/`#gs-ev-steps`
  → those DOM nodes are gone; read `__GALLERY_SHIFT_EVIDENCE__` (kept) or
  `__AURA3D_GAME_EVIDENCE__.sections.gallery` instead.
- `__AURA3D_COMPOSITION_PROBE__` consumers → `?capture=scenario&scenario=mid-heist`.
- Evidence: `__GALLERY_SHIFT_EVIDENCE__` still published;
  `__AURA3D_SHOWCASE_GALLERY_SHIFT__` → `__AURA3D_GAME_EVIDENCE__.sections.gallery`.
- Parity on shadow tree: **0/0/0/0**.
