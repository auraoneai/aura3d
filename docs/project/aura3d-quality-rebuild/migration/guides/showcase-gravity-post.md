# Migration guide — showcase-gravity-post

Patch set: `migration/patches/showcase-gravity-post/` (steps 2–4, 8, 10, 11
of §10). Generated against `main@5f5d6088`. Filenames encode apply order.

## Apply

```
git am docs/project/aura3d-quality-rebuild/migration/patches/showcase-gravity-post/*.patch
```

## Before numbers (main)

- capture branches: **9 ART / 4 FRAMING / 0 TRANSIENT / 60 UNKNOWN** —
  `visualReviewCapture` (`?capture=review`) in `main.ts` (75 refs): the
  Rust→Gale corridor review lens, review-only MailPod shuttle + sidecar
  district, `compositionPresentationOverride`, and `?capture` datasets.
- globals: `__AURA3D_COMPOSITION_PROBE__` (deleted), `__GRAVITY_POST_EVIDENCE__`,
  `__AURA3D_SHOWCASE_GRAVITY_POST__` (→ lazy sections), `__GRAVITY_POST_STEP__`/
  `__GRAVITY_POST_SIM_STEP__`/`__GRAVITY_POST_CAPTURE__`/`__GRAVITY_POST_EVIDENCE_SNAPSHOT__`/`__GRAVITY_POST_PHYSICS__` (test hooks — kept).
- route-composition (main): 3,510 evidence / 664 presentation / 2,755 gameplay LOC
- route-composition (after): 2,885 evidence / 944 presentation / 2,928 gameplay LOC

## Step notes

| Patch | What it does | Kept play values |
|---|---|---|
| `02-create-game-and-capture-cleanup` | `createAuraApp` → `createGame({id:"showcase-gravity-post", target:"#app", scene:()=>gpScene, diagnostics:{overlay:false}, physics:{layers pod/dock, zero gravity, seed:20260914, adaptive×4}, qualityRebuild:{flags:["game"]}})` + `gravityGame.start()`; resolves all 75 `visualReviewCapture` refs to play arm: play camera `[0.3,7.25,6.65]`→`[0.28,0.08,-0.55]` fov 41, district dressing (ambient 1.05/key 2.0/rim .72 always), typed freight district + gate hardware mounted for all stations, review-only shuttle/sidecar/beads deleted, `compositionPresentationOverride` + `compositionReviewPose`/`settledReviewPose` folded to false (delivery presentation math keeps live-velocity terms) | collision layers, zero-G config, camera pose, all play-arm scales, station beacon/gate mounts, trail/wake/plume presentation code |
| `04-session-pause` | `let paused` → `gravityGame.session.paused`; `KeyP` + `#gp-pause` button toggle `session.pause("user")`/`resume()`; `resetPod` path calls `session.resume()` | pause semantics identical (update loop still early-returns + publishes when paused) |
| `05-evidence-sections-scenario-drive` | `publishEvidence` → `collectRouteEvidence()` returning `GravityPostEvidence`, bound via `src/evidence.ts` `sections.gravity`; `evidence:{schema:1,sections,legacyGlobals}`; `__AURA3D_COMPOSITION_PROBE__` + `compositionSubjectSuppressed` deleted; `src/scenario-drive.ts` (`stepSim`/`stepRender`/`launch`/`nextContract`/`retryContract`); `src/scenarios/` adds `play` + `coasting` (`launch([0.94,-0.34],3.6)` + 72 sim-steps = mid-corridor) | every evidence key preserved; test hooks `__GRAVITY_POST_STEP__`/`_SIM_STEP__`/`_CAPTURE__`/`_SNAPSHOT__`/`_PHYSICS__` untouched |
| `06-juice` | `createJuice` over 8 events: `launch` streak+punch 2.4°, `assist`/`flyby`/`correction` sparks, `dock` ring+punch, `contract-clear` pickup+flash, `pod-lost` flash+vignette+hitStop .06, `bounce-off` debris+shake; `gravityTween.tick(dt)` in updateGameplay; `@aura3d/game` dep added | `emitPodEvents` audio cues unchanged; `audio.proof()` still in evidence |

## No step 5/7/9/12

- **05-sound**: `post-audio.ts` already `createGameAudio` typed manifest —
  no-op.
- **07-hud / 09-touch / 12-shell**: DOM `#hud` + pointer-drag aim stay
  route-owned this wave.

## Spec-migration handoffs (Q-14-1 → filed)

- `gravity-post-playable.spec.ts` + `gravity-post-scene.spec.ts` +
  `gp-capture.probe.spec.ts` read `__GRAVITY_POST_EVIDENCE__` and drive
  `__GRAVITY_POST_STEP__`/`_SIM_STEP__`/`_CAPTURE__` — hooks stay; evidence
  reads migrate to `__AURA3D_GAME_EVIDENCE__.sections.gravity` (legacyGlobals
  covers one release).
- `?capture=review` consumers → `?capture=scenario&scenario=coasting` for the
  mid-corridor frame.
- `?capture=review` parity was **0/0/0/0** on the shadow tree.
