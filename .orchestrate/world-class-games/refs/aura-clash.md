# Aura Clash Arena — worker brief

**App:** `apps/aura-clash-showcase/`
**Route:** `/showcase/aura-clash/playable/`
**Class:** `development showcase` (`production-runtime`)

## Keep

- Both typed Quaternius rigs, current arena, move table, clip maps, audio manifest
- `window.__AURA_CLASH_ARENA_PROOF__` (`aura-clash-arena-proof/v1`)
- KO lock, rematch, accessibility routes
- Package import boundary: production-runtime is OK **here only**
- `AuraClashFighterController` must not calculate hits/damage
- Frame data stays solver-shaped: short active, real recovery. Read comments in `auraClashMoveData.ts` before touching numbers. Do **not** restore the inverted table (light 4/12/4 etc.)
- Hitboxes hidden in normal play (`debugVolumesEnabled: false`)
- Existing SFX manifest — extend mappings, do not discard
- Do not add a third fighter or a new stage
- Do not recreate deleted attempt-number directories
- Do not mark Clash flagship

## Controls (implementation + tests win over stale docs)

`docs/agents/game-showcase-build.md` says Space = jump. **Live code and tests use Space = dash, W = jump.** Do not invert that.

| Key | Action |
| --- | --- |
| A / Left | move left |
| D / Right | move right |
| S / Down | crouch / fast-fall |
| Space | dash |
| W / Up | jump |
| Shift / Q | guard |
| J / K / L | light / heavy / special |
| P / Esc | pause |
| R | reset / rematch |

Special spends meter (`SPECIAL_METER_COST = 20`). `controls.specialRequiresMeter` must stay `true`.

## Already present (strengthen, do not rip out)

- Hit-stop: light 0.052s, heavy 0.075s, special 0.13s (presentation-only)
- Camera punch-in from decaying hit-stop; KO framing ignores residual hit-stop
- Hit sparks via `createSparkItems()`
- Pause already freezes gameplay tick
- AI in `updateRivalAi()` with seed `0x41435241`; `setRivalGuardSuppressed` must keep working

## Target

### Visual

- First frame is a fight poster: two silhouettes, neon practicals, grounded floor, no debug volumes
- Fighter HUD: names, HP bars, meter, timer, combo count, round marks. Training numbers and proof JSON stay on `/evidence/` or `?debug=1`
- Hits change the picture: hit-stop 2–8 frames by strength, camera punch, renderer-owned spark/impact, brief victim flash that is not a CSS overlay pretending to be light
- Special (L) is the showpiece: readable startup, distinct silhouette, screen freeze, existing unique SFX
- KO: inert hitboxes, camera push-in, loser down clip once, winner idle, result card. No looping combat
- `#combo-flash` exists but is unused — safe to wire as combo count

### Gameplay

- Light can cancel into heavy on hit if `canCancelCombo` says so; heavy does not combo into itself for free
- Guard looks and sounds different from getting hit (existing SFX + renderer flash, not CSS fake light)
- AI roles **inside the current rival**: approach, space, punish whiff, respect meaty wakeup. Keep deterministic. Preserve passive/test-driver paths
- Input buffer should feel like a fighter (6–8f), not a 120ms platformer buffer
- Pause freezes both fighters, AI, timer, and hitboxes
- Reset restores HP, meter, positions, clips, combo, and audio state

## Tests (required)

```bash
pnpm --dir apps/aura-clash-showcase typecheck
pnpm --dir apps/aura-clash-showcase test:playable
pnpm --dir apps/aura-clash-showcase test:flagship
```

`test:playable` must stay `--workers=1`.
Flagship fails if the playable body contains “hitbox”, “hurtbox”, “debug”, or “primitive fighter” in normal play.
Extend playable/flagship/camera-feedback tests for: hit-stop + camera punch on a real hit, special spends meter, debug volumes hidden, AI role still deterministic.

## Do not

- Import `three` or write a second renderer
- Call it a reusable fighting kit or Street Fighter clone
- Invert startup/active/recovery
- Enable hitbox overlay in normal play
- Change `window.__AURA_CLASH_ARENA_PROOF__` field names
