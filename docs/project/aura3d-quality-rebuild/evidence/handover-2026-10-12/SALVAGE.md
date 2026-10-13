# Salvage Tribunal — Verdicts (Phase 2, 4.0LiveFixPlan)

Wave-1 tribunal 2026-10-13: five parallel inspectors + adversarial critic.
Bar for PORT: separable `src/gameplay/**` logic with zero (or trivially
cut) legacy imports, distinctive loop not duplicated by a genre kit, and
tests proving the loop. Scenes and asset sets are trashed for every game
regardless; PORT salvages design + logic modules only.

Caveat applying to ALL verdicts: tests were inspected, not executed, and no
PORT module has yet been compile-proven against the post-Phase-1 engine.
Each PORT is re-proven at its rebuild PR (compile + green tests) or it
demotes to REBUILD.

## Tally: PORT 11 · REBUILD 8 · DROP 0 (19 judged)

| Game | Verdict | Justification (evidence) |
|---|---|---|
| apps/aura-clash-showcase | REBUILD | Loop lives in 4,293-line `legacy/playable/AuraClashArenaApp.ts` + engine combatWorld; `v2/boot.ts:9,30` already rebuilds on `createFightingGameKit` with zero gameplay imports; no unit test of the match/combo loop. Owner candidate — did not earn PORT. |
| apps/showcase-neon-swarm | PORT | `gameplay/swarm.ts` 628L pure (no DOM/engine), run campaign, 0 legacy imports; steering unit tests + playable browser spec. |
| apps/showcase-pulse-tunnel | PORT | `beat-clock.ts` pure audio-clock/drift-flip, no rhythm template exists; fake-clock unit (461L) + full-90s browser run. |
| apps/showcase-vault-breakers | PORT | `table.ts` 921L Rapier sim via engine physics only, same builder headless+browser, no pinball kit; deterministic-hash/drain units + serve/flip browser. |
| apps/showcase-turbo-drift-circuit | REBUILD (downgraded by critic) | Headline spec proves only `race-proof.ts` (imports trashed `generated/game-geometry`, asserts `provesMountedKitPlayback:false`); narrowed opponent/passing/ghost/boost/feel (~1,144L) survives as rebuild input only. |
| apps/showcase-courier-rush | REBUILD (downgraded by critic) | `dispatch.ts:33` runtime-imports zone data from 920L `legacy/city.ts` — fails zero-legacy bar. |
| apps/showcase-patrol-wing | PORT | flight/patrol/drones/weapons/ghost 1,165L deterministic, no flight kit; single cut: `RING_GATES` data (6 gates) extracted from legacy sky. |
| apps/showcase-skyline-runner | REBUILD | Loop duplicates `game.platformer`; `level.ts` binds trashed GLB geometry; flow-scoring + ghost are salvage fragments only. |
| apps/showcase-blockfall-reactor | REBUILD | Duplicates `game.fallingBlocks` kit; different randomizer, `provesMountedKitPlayback:false`, no playable browser spec. Reactor-meter design carries. |
| apps/showcase-bank-shot | PORT | `rules.ts` pure ShotRecord-fed 3-rack 8-ball; 316L rules + 159L determinism units + 16-ball Rapier browser spec. |
| apps/showcase-rooftop-buckets | PORT | `scoring.ts:88-172` pure five-heat loop, no basketball kit; scoring/heats/hoop units + heat-1 browser. |
| apps/showcase-siege-golf | PORT | course/score/solutions pure + hole-flow state machine, no golf kit; scoring/physics/replay units + all-holes browser. |
| apps/showcase-aurora-lander | PORT | 886L pure deterministic gameplay (lander/touchdown/terrain/sites/prediction/ghost); touchdown test completes all 3 sites in fuel budget + browser campaign. |
| apps/showcase-deep-recovery | PORT (narrowed) | Tether/bank + oxygen + sonar contract loop (727L, 0 legacy) only; the 6-DOF sub claim is unproven (32L forward-only test) and is NOT salvaged as-is. |
| apps/showcase-gravity-post | PORT (core only) | wells/pod/contracts/scoring ~791L pure slingshot + one-correction; freightway/flyby presentation excluded. |
| apps/showcase-orbital-defense | REBUILD | 226L generic pooled shooter duplicated by arena-shooter; integrity floors at 0 with no fail/win state; no playable spec. |
| apps/showcase-gallery-shift | PORT (vision core only) | `vision.ts` + guard/thief with 37 unit cases + full detect/caught/exit browser loop; `floor.ts` GLB-interior construction rejected — layout data extraction only. |
| apps/showcase-mech-hangar | REBUILD (downgraded by critic) | Cited browser proof is invalid (spec reads nonexistent `src/hangar.ts`/`src/arena/feel.ts`); parts catalog binds trashed assets. |
| examples/neon-corridor-strike | REBUILD | Win/reset/fire rules inline in scene orchestrator `main.ts:136,155,298`; no separable modules, no headless fire-kill-win sim. Rebuild lands on the E5 raw-pointer API. |

## Owner checkpoint (required before Phase 3)

- AuraClash: REBUILD (not PORT) — the fighting-kit v2 boot is the rebuild
  seed. Owner to confirm or override with reason.
- Narrowed PORTs (deep-recovery, gravity-post, gallery-shift, patrol-wing)
  salvage only the named cores; small data extractions (ring gates, gallery
  layout) are treated as data, not code salvage. Owner to confirm this
  reading of the zero-legacy bar (courier was downgraded on the same bar).
- DROP is currently empty. Phase 4 can still move games to DROP after two
  failed look-dev iterations; the final count is whatever earns it.
- Out of tribunal scope (no verdict yet): 8 non-game live showcases
  (index, product-configurator, smart-city-control, cinematic-architecture,
  digital-twin-ops, data-galaxy, webgpu-particle-lab, meshy-relic-pilot)
  + 9 evidence routes. They still render through the same engine and are
  covered by Phase 1; their keep/drop call is needed before Phase 5 copy
  is finalized.
