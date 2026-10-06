# Migration guide — showcase-pulse-tunnel

Patch set: `migration/patches/showcase-pulse-tunnel/` (steps 2–4, 8, 10, 11
of §10 plus the art-review probe removal). Generated against `main@5f5d6088`.
Patch filenames are numbered by **apply order**, not §10 step number — the
step mapping is in the table below (the shadow commits were authored in the
order git-am must replay them).

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-pulse-tunnel/*.patch
```

## Before numbers (main)

- capture branches: **24 ART / 4 FRAMING / 7 TRANSIENT / 49 UNKNOWN** —
  `visualReviewCapture` (`?capture=review`) in `main.ts`: 17 review builder
  arrays, 15 review node handles, review-only materials/lights, and the
  `reviewAnchor`/`latestReviewEventAnchor` anchor plumbing.
- globals: `__AURA3D_SHOWCASE_PULSE_TUNNEL__`, `__PULSE_TUNNEL_EVIDENCE__`,
  `__PULSE_TUNNEL_TEST__` (test hook kept — see notes).
- route-composition (main): 7,189 evidence / 610 presentation / 2,228 gameplay LOC
- route-composition (after): 4,722 evidence / 640 presentation / 2,442 gameplay LOC
- art-review probe entries: **11 html+ts pairs** in
  `apps/showcase-pulse-tunnel/art-review/` deleted (PRD names "15"; the
  directory only ever contained 11 entry pairs — the remaining files are
  PROVENANCE docs, `assets/`, `external-source/`, `output/`).

## Step notes

| Patch | What it does | Kept play values |
|---|---|---|
| `02-create-game` | `createAuraApp("#app", …, autoStart: true)` → `createGame({ id, target: "#app", scene: () => pulseScene, physics:{ seed:20260912, continuousCollision:{mode:"adaptive-substeps",maxSubSteps:4} }, qualityRebuild:{flags:["game"]} })` + `const app = pulseGame.app; pulseGame.start();` | scene fn, physics seed + CCD config, camera/HUD panel wiring |
| `03-delete-capture-branches` | deletes `visualReviewCapture` decl + `dataset.capture`; 17 `review*Builders` arrays wholesale; `...review*Builders` spreads; 15 review handle consts; all `? :`/if-arm resolutions to the play arm; 9 zero-intensity review-only lights; 20 review-only materials; dangling hide loops (`for (const x of review*) setVisible`); `reviewAnchor`/`latestReviewEventAnchor` anchor plumbing → `eventLaneBias/eventKindOffset` constants 0, `impactY` 0.96 | every play arm verbatim: finale presentation (`finaleActive`, `finaleProjectiles`, `reviewCombatPulse` event-object driving still live — renamed usages kept), runner cyan fill light (1.15 play value), all materials used by play builders |
| `04-session-pause` (§10.8) | `let paused` → `pulseGame.session.paused`; `input.pressed("pause")` toggles `session.pause("user")`/`resume()` + `tunnelAudio.suspend()/resume()`; restart calls `session.resume()` | `runState` machine unchanged; `evidence.paused` still reports session state; `KeyP` binding kept |
| `05-evidence-sections` (§10.10) | `__PULSE_TUNNEL_EVIDENCE__` + `__AURA3D_SHOWCASE_PULSE_TUNNEL__` `defineProperty` blocks deleted → `evidence:{ schema:1, sections: async () => (await import("./evidence")).sections, legacyGlobals:[...] }`; new `src/evidence.ts` (`bindPulseEvidence`, `sections.pulse` → live `evidence` object) | every evidence key preserved (controls, systems, claimBoundary, player, audio, stats, latestCombatEvent, diagnostics) |
| `06b-game-dependency` | adds `@aura3d/game: workspace:*` to `apps/showcase-pulse-tunnel/package.json` | |
| `06-juice` (§10.11) | `createJuice` over 8 events: `lane-switch` (streak+shake .03), `jump`/`slide` (dust), `graze` (spark+shake .05), `shield-hit` (flash .14+shake .16), `shield-break` (flash .24+shake .3+hitStop .055+vignette), `section-rise` (punch 2.2°+ring), `run-over` (flash .18+vignette); `pulseTween.tick(dt)` in frame loop | `hitFlashRemaining`/styleSystem/graze spark pool still drive scene-owned effects alongside |
| `07-delete-art-review-probes` (§10.3 ext.) | removes the 11 `art-review/pulse-*.{html,ts}` candidate/probe entry pairs | `assets/`, `external-source/`, `output/`, PROVENANCE docs stay |
| `08-scenarios` + `08b-scenarios-fix` (§10.4) | new `src/scenario-drive.ts` (`PulseDrive`: beginRun/applySection/seekAhead/endRun, bound once from main); new `src/scenarios/index.ts` with `play` + `finale` (begin run → `applySection("finale")` → `seekAhead(88)`) scenarios; `scenarios:` option wired on `createGame` | `seekAhead` clamps to `PULSE_RUN_SECONDS - PULSE_CAPTURE_HEADROOM_SECONDS` exactly like the `__PULSE_TUNNEL_TEST__` seam (which is unchanged for the sync spec) |

## No step 5/7/9/12

- **05-sound**: `tunnel-audio.ts` already `createGameAudio` + typed manifest
  (4 stem buses + sfx cues) — no-op like blockfall.
- **07-hud / 09-touch / 12-shell**: DOM HUD (`setupPulseHud` on `#panel`)
  stays route-owned this wave — the shell/touch migration lands with the
  wave-3 shell pass (same posture as blockfall/rooftop).

## Spec-migration handoffs (Q-14-1 → filed)

- `pulse-tunnel-playable.spec.ts` + `pulse-tunnel-sync.spec.ts` read
  `window.__PULSE_TUNNEL_EVIDENCE__` and hit `?capture=review` — migrate to
  `?capture=scenario` + `__AURA3D_GAME_EVIDENCE__.sections.pulse` once the
  patch set lands (legacyGlobals keeps the old globals live one release).
- `__PULSE_TUNNEL_TEST__` (`injectDrift`, `seekAhead`) stays — it's a test
  hook for the measured-clock flip path, not a capture global.
- `?arena=candidate` (`pulseArenaCandidateEnabled`) is a separate feature
  flag, not a capture branch — kept.
- `?capture=review` parity was **0/0/0/0** on the shadow tree (no arm kept).
- Thumbnails spec entry `showcase-game-thumbnails.spec.ts` for pulse uses
  the default capture — verify against `?capture=scenario&scenario=finale`
  when PRD-14 picks the thumbnail frame up.
