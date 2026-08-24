# AC-01 — Audit: rival AI path + animation-event metadata readiness

Status: complete · Phase P0 · Scope: `apps/aura-clash-showcase/` only.
This note is the audit deliverable for task **AC-01** of `CurrentGames-PRD/02-Aura-Clash-Arena.md`.
It decides what AC-A7 (createCombatAi presets) must change and confirms AC-A1's starting state.
Nothing here changes frame data; `auraClashMoveData.ts` stays byte-identical.

## 1. Rival AI path audit (decides AC-A7)

Where rival decisions actually live today:

| Concern | Location | Mechanism |
| --- | --- | --- |
| Role selection | `src/playable/combat/clashFeel.ts` → `resolveRivalAiRole` | hand-authored distance/window thresholds returning `approach / space / punish-whiff / meaty-wakeup / neutral` |
| Strike weighting | `clashFeel.ts` → `rivalAiStrikeBias` | per-role literal `{light, heavy, special}` biases |
| Dash wants | `clashFeel.ts` → `rivalAiWantsDash` | per-role threshold table |
| Decision application | `src/playable/AuraClashArenaApp.ts` → `updateRivalAi` | consumes the three helpers plus a seeded `mulberry32` stream (`RIVAL_AI_RNG_SEED`) to gate light/heavy/special/dash/guard intents |
| Low-health escalation | `updateRivalAi` | inline `rival.health < START_HEALTH * 0.35 ? 0.65 : 1.0` aggression multiplier |

Findings:

1. The role layer is **ad-hoc**, not routed through `@aura3d/engine`'s `createCombatAi`
   (`packages/engine/src/agent-api/CombatFrameData.ts`). No `CombatAi` instance exists on this route.
2. It is already **seeded and deterministic** (fixed seed reset per round), so replay tests hold —
   but determinism comes from a route-local PRNG rather than from `createCombatAi`'s own seeded
   xorshift, and there is no named aggression preset surface at all.
3. `AuraClashFighterController.ts` is a boundary declaration only (no decisions);
   `AuraBurstDirector.ts` builds Aura Burst showpiece beats (no rival decisions).
   **Neither file owns the AI**, so per the PRD's "audit decides" clause the preset work lands in
   the combat folder beside the existing decision helpers instead of in either of those files.

Decision for AC-A7: **not equivalent → implement.** Add `src/playable/combat/clashAiRoles.ts`
wrapping `createCombatAi` with three named, seeded presets — `rushdown 0.8`, `balanced 0.55`,
`keep-away 0.35` — built from the route's solved frame data (`auraClashAttackFrames`). The live
`updateRivalAi` keeps its role names (combat-feel.spec asserts them) but sources strike aggression,
punish appetite and block tendency from the active preset so role differences are measurable.
Covered by `tests/unit/apps/clash-ai-roles.test.ts`.

## 2. Animation-event metadata readiness (AC-A1 baseline)

What already exists (ready):

- Authored per-move event tracks live in `auraClashMoveData.ts` → `auraClashMoveEventTracks`,
  with lanes `hitbox` (active-frame window — combat authority, untouched), `footstep`, `vfx`.
- The app samples cosmetic lanes with `sampleClipEvents` from `@aura3d/animation`
  (`fireAttackClipEvents`) and publishes fired-event counters on `window.__AURA_CLASH_EVENT_TRACKS_PROOF__`.

What is missing (gaps AC-A1 closes):

1. There is no **`sfx` lane** — attack swings carry no authored sound frame; hit/block cues fire
   from combat events (correct) but swing cues have no event source.
2. There is no **`camera.impulse` lane** — camera response derives only from decaying hit-stop.
3. Cosmetic dispatch is inline in `fireAttackClipEvents` rather than behind an `onEvent`
   subscription surface, so presentation consumers cannot be added without editing sim-adjacent code.
4. Event *metadata* is not declaratively available next to the clip maps for evidence/tests to
   assert "cue fires on the authored frame".

Plan (additive only): declare per-move presentation metadata (`sfx`, `vfx`, `camera.impulse`)
beside the clip maps in `auraClashClipMaps.ts`, add a new
`src/playable/combat/clipEventBridge.ts` that samples that metadata through
`@aura3d/animation`'s clip-event machinery and dispatches via an `onEvent` emitter, and move the
app's cosmetic dispatch onto bridge subscriptions. Combat timing untouched: the `hitbox` lane and
`auraClashHitWindowFromTracks` remain the sole hit-window authority. Covered by
`tests/unit/apps/clash-clip-events.test.ts`; `tests/audio.spec.ts` gains a cue-on-event assertion.

## 3. Constraints honored

- Frame data byte-identical: no numbers in `auraClashMoveData.ts` change in this pass.
- Presentation-only clock separation preserved (`clashFeel.ts` remains the feel clock).
- Proof object: additive fields only.
- No roster/stage expansion; no production-runtime imports copied outside this app.
