# Q-13-13 — game templates rely on `Game.juice`/`Game.sound` and literal evidence descriptors the contracts dropped

**GitHub issue:** #701

Found by `pnpm pack:check` (T1.6 packed-consumer gate, T8.2 evidence) — five game templates failed the packed-consumer `tsc --noEmit` step:

- `character-controller`, `mini-game`: `game.juice.fire(...)`, `game.sound?.cue(...)` — `Game<TCue,TEvent>` in `packages/engine/src/contracts/game.ts` had no such members even though the real `createGame` (Prd09Game) returns them. Restored on the contract as `readonly juice: GameJuice<TEvent>` + `readonly sound?: GameAudio<TCue>` (new `GameJuice` facade type mirrors `Juice.fire`); stub `createGame` got the matching inert members.
- `falling-blocks-starter`, `racing-starter`, `fighting-game`: `app.evidence({ hud: [...] })` descriptor literals missing `interactive`/`debugOnly` and widening `kind` to `string`. `GameRuntimeEvidenceOptions.hud` now takes `GameHudBindingDescriptor` (canonical binding minus the fields `createGameHudBinding` defaults to false). Templates got `as const` on `hudBindings`/`accessibilitySources` so `kind`/`binding`/`feature` literals survive; one `source: "app"` corrected to `"app-state"`.

## Suggestion for lane 13

Document the descriptor-literal convention in `docs/agents/templates.md` (or the template AGENTS files): evidence descriptors are `as const` arrays and omit `debugOnly`/`interactive` unless non-default. Consider generating the arrays from a typed helper if more templates add evidence bindings.

Files: `packages/engine/src/contracts/game.ts`, `contracts/stubs/game.ts`, `agent-api/GameEvidence.ts`, `templates/{character-controller,mini-game,falling-blocks-starter,racing-starter,fighting-game}/src/main.ts`.

## Follow-ups from pack:check iterations (2026-10-07)

- `createGame` public wrapper re-typed to the impl surface
  (`Prd09CreateGameOptions` → `Prd09Game`): the contract `CreateGameOptions`
  is narrower than what every shipped template passes (`target: "#app"`
  selector, `input`, `autoStart`, `diagnostics`, `evidence`). The C-24 slot
  keeps the contract-shaped signature for the flag-off stub.
- `EvidenceChannelContract.sections` widened to also accept a synchronous
  `Record<string, EvidenceSectionCollect>` (per-section lazy getters) —
  normalized to a promise loader in `createGame`.
- `format: "seconds"` → `"clock"` in fighting-game + racing-starter
  hudBindings (`GameHudValueFormat` has no "seconds"; `clock` renders the
  intended `m:ss`).
- fighting-game specs re-aligned to the createGame lifecycle surface:
  `route-health.spec.ts` expected `{kind: "aura-game-app-runtime",
  usesCreateGameApp: true, runtimeEvidenceGlobal}` and
  `gameplay-smoke.spec.ts` expected `runtime.kind ===
  "aura-game-app-runtime-evidence"` + status/startCount/inputControllers —
  all pre-PRD-09 GameAppRuntime evidence. After the template's createGame
  migration the emitted surface is `{kind: "createGame", usesCreateGameApp:
  false, usesCreateGame: true, beaconGlobal, evidenceGlobal}` and
  `__AURA3D_GAME_RUNTIME__ = {kind: "createGame", beacon, frame}`. Specs now
  assert the createGame surface; all `evidence.systems.*`, `replay.hitCount`
  and `source.readiness.*` assertions preserved verbatim.
