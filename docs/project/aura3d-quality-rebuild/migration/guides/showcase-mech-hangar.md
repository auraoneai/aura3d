# Migration guide — showcase-mech-hangar

Patch set: `migration/patches/showcase-mech-hangar/` (steps 2–4, 8, 10–11 in
one commit). Generated against `main@5f5d6088`.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-mech-hangar/*.patch
```

## Before numbers (main)

- capture branches: **0 ART / 3 FRAMING / 0 TRANSIENT / 2 UNKNOWN** —
  `visualReviewCapture` (`?capture=review`): follow-camera distance 5.55,
  offset [0,1.82,4.62], fov 52, smoothing 0.
- HUD: **"ASSET PASSPORT" panel deleted** (PRD wave-3 text removal):
  `HangarHudHandles.passport`, `FAMILY_PASSPORT`, the setup/update passport DOM
  + `.mech-passport*` CSS removed. `catalogReady` still gates `lockButton`.
- globals: `__AURA3D_COMPOSITION_PROBE__` (deleted: subject/suppressed/settle +
  `compositionSubjectSuppressed`/`compositionProbeActive` flags across
  hero/weapon/marker/contact visibility); `__MECH_HANGAR_EVIDENCE__` +
  `__AURA3D_SHOWCASE_MECH_HANGAR__` (kept via collect + legacyGlobals);
  test hooks kept: `__MECH_HANGAR_SET_TIME_WARP__`, `__MECH_HANGAR_SIM_TICK__`,
  `__MECH_HANGAR_VALIDATION_PROBE__`.
- route-composition (main): 2,238 evidence / 1,335 presentation / 4,101 gameplay LOC
- route-composition (after): 2,127 evidence / 1,311 presentation / 4,200 gameplay LOC

## Patch `02-06-*`

- `createAuraApp` → `createGame({id:"showcase-mech-hangar", target:"#app",
  diagnostics, renderer:{mode:"production",qualityProfile:"production",
  fallback:"safe-basic"}, physics, scene:<same builder>, qualityRebuild:
  {flags:["game"]}, evidence:{sections.mech,legacyGlobals}, scenarios})`;
  `app=mechGame.runtime`, `mechGame.start()`. Route-owned `game.input` kept.
- `let paused` → `mechGame.session.paused`; toggles via `pause("user")/resume()`.
- `publishEvidence(snapshot)`→`collectMechEvidence(snapshot)` (still writes both
  globals) + `src/evidence.ts` `sections.mech`; `src/scenario-drive.ts`
  (`pumpFrames`, `enterArena`); `src/scenarios/` `play` + `arena-bout`
  (enterArena + 150 pumped frames).
- Juice: `createJuice` 7 events — light/heavy-hit spark+shake+rumble, blocked
  ring, guard-break flash+hitStop, special burst+punch+rumble, ko flash+
  vignette+hitStop .08+shake, lock ring+flash (on `enterArena`);
  `mechTween.tick(dt)` in onFrame; `@aura3d/game` dep.
- Review camera → play values (6.55 / [0,1.66,5.28] / fov rm?53:54 / 0.16).

## Kept play values / no other steps

- `hangar-audio` already `createGameAudio` → no 05. Hangar DOM panel + touch → no 07/09/12.
- All `__MECH_HANGAR_*` hooks, `HANGAR_AUDIO_CUES`, part-catalog pipeline kept.

## Spec-migration handoffs (Q-14-1 → filed)

- `data-testid="passport"` / `modular-family-passport` / `.mech-passport-*` consumers — DOM nodes are gone; provenance data remains in `parts-catalog` records and `__MECH_HANGAR_EVIDENCE__.catalog*`.
- `__AURA3D_COMPOSITION_PROBE__` → `?capture=scenario&scenario=arena-bout`.
- Parity on shadow tree: **0/0/0/0**.
