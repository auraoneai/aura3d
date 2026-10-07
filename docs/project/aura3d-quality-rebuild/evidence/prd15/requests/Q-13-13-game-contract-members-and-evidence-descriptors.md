# Q-13-13 — game templates rely on `Game.juice`/`Game.sound` and literal evidence descriptors the contracts dropped

Found by `pnpm pack:check` (T1.6 packed-consumer gate, T8.2 evidence) — five game templates failed the packed-consumer `tsc --noEmit` step:

- `character-controller`, `mini-game`: `game.juice.fire(...)`, `game.sound?.cue(...)` — `Game<TCue,TEvent>` in `packages/engine/src/contracts/game.ts` had no such members even though the real `createGame` (Prd09Game) returns them. Restored on the contract as `readonly juice: GameJuice<TEvent>` + `readonly sound?: GameAudio<TCue>` (new `GameJuice` facade type mirrors `Juice.fire`); stub `createGame` got the matching inert members.
- `falling-blocks-starter`, `racing-starter`, `fighting-game`: `app.evidence({ hud: [...] })` descriptor literals missing `interactive`/`debugOnly` and widening `kind` to `string`. `GameRuntimeEvidenceOptions.hud` now takes `GameHudBindingDescriptor` (canonical binding minus the fields `createGameHudBinding` defaults to false). Templates got `as const` on `hudBindings`/`accessibilitySources` so `kind`/`binding`/`feature` literals survive; one `source: "app"` corrected to `"app-state"`.

## Suggestion for lane 13

Document the descriptor-literal convention in `docs/agents/templates.md` (or the template AGENTS files): evidence descriptors are `as const` arrays and omit `debugOnly`/`interactive` unless non-default. Consider generating the arrays from a typed helper if more templates add evidence bindings.

Files: `packages/engine/src/contracts/game.ts`, `contracts/stubs/game.ts`, `agent-api/GameEvidence.ts`, `templates/{character-controller,mini-game,falling-blocks-starter,racing-starter,fighting-game}/src/main.ts`.
