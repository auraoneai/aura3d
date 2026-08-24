# Neon Corridor Strike — Binding Redesign Laws

This file is the short, non-negotiable companion to `examples/neon-corridor-strike/FPS-BAR.md`. If the two conflict, `FPS-BAR.md` wins. A redesign task that violates one of these laws is rejected even if it looks better in a still.

## Camera and body

1. Runtime look target is driven by mouse-look yaw/pitch every frame; no fixed authored look target may overwrite it.
2. Walk height remains locked to the proven player/camera contract; no bob, recoil, crouch, or collision response may accumulate vertical drift.
3. Weapon framing is authored for desktop and mobile separately; it cannot cover the reticle, target torso, pickup, or forward exit.

## Enemies and shots

4. Enemy collision-body Y and rendered-model Y are separate calibrated values. Never copy one onto the other.
5. Hitscan/query result owns hit truth. Tracers, sparks, decals, sound, and camera response only present that result.
6. The tracer remains a beam leaving the barrel with length encoded through its proven build-time scale path. Do not replace it with a parked blob or DOM/canvas line.
7. Line-of-sight queries use the documented layers/ignore filters and pinned radius. Debug cones or volumes never appear in release captures.

## Level and state

8. Typed arena, rifle, enemies, ammo, and medkit remain the primary subjects. Primitives are corridor dressing, collisions, effects, or debug only.
9. Pickup collection fires once per entry, changes actual ammo/health state, removes or disables the world pickup, and cannot retrigger while overlapping.
10. Pause freezes enemies, shots, timers, physics flavor, and audio progression; reset restores the exact initial gameplay contract without remounting the Aura app.

## Visual constraints

- The corridor must retain a readable dark path, brighter threats, cyan player weapon language, red alarm language, and green/amber pickup distinction that also has shape/icon support.
- Fog, bloom, debris, hanging lamps, instanced greebles, and world text are subordinate to target and exit readability.
- DOM is HUD/menu/accessibility only. It cannot fake muzzle flashes, tracers, impacts, world lighting, signs, or particles.
- Reduced motion disables camera impulse and aggressive secondary movement; reduced flash clamps muzzle/alarm intensity without hiding shot or damage truth.

## Required regression evidence

- Existing playable and shot-visual browser specs stay intact and green.
- A pinned walk test proves camera Y stability.
- A pinned shot test proves barrel origin, traveling beam, hit/miss state, and no parked tracer.
- Unit tests pin debris lane clearance, deterministic settle, pickup once-per-entry behavior, and LOS filtering.
- Desktop/mobile captures cover first load, first enemy, shot, pickup, alarm escalation, and outcome.

No shooter-kit, DOOM-parity, production-rendering, or generic collision claim may be introduced by this redesign.

## Execution ledger

**Status:** Machine-complete; blocked only on independent exact-artifact review  
**Last verified:** 2026-08-23 05:42 PDT  
**Implementation scope:** `examples/neon-corridor-strike/`, binding FPS-law sources, Corridor unit/browser tests, generated artifacts, and this constraint document  
**Authoritative evidence:** `FPS-BAR.md`; camera/body, shot, LOS, pickup, pause/reset fixtures; exact desktop/mobile/reduced-mode captures  
**Remaining blockers:** NCSC-11 independent review of the exact visual matrix; no machine implementation or verification blocker remains

### Requirement checklist

- [x] NCSC-01 Mouse-look yaw/pitch drives the runtime target every frame with no fixed-target overwrite.
- [x] NCSC-02 Player/camera walk height remains pinned with no accumulated vertical drift.
- [x] NCSC-03 Desktop/mobile weapon framing never covers reticle, target torso, pickup, or exit.
- [x] NCSC-04 Enemy collision-body Y and rendered-model Y remain separately calibrated and tested.
- [x] NCSC-05 Hitscan/query result solely owns hit truth; presentation cannot alter it.
- [x] NCSC-06 Tracer leaves the barrel, uses the proven scale path, travels to the resolved end, and is not DOM/canvas or a parked blob.
- [x] NCSC-07 LOS queries preserve documented layers, ignore filters, radius, and release-frame debug-guide absence.
- [x] NCSC-08 Typed arena, rifle, enemies, ammo, and medkit remain primary; primitives stay dressing/collision/effect/debug only.
- [x] NCSC-09 Pickups trigger once per entry, mutate real state, leave/disable the world, and do not retrigger while overlapping.
- [x] NCSC-10 Pause freezes all gameplay/audio progression and reset restores initial state without remounting the Aura app.
- [ ] NCSC-11 Corridor palette, threat/exit readability, shape-supported pickups, subordinate fog/bloom/debris/lamps/text, and DOM boundary pass.
- [x] NCSC-12 Reduced motion/flash preserves shot, damage, alarm, and state truth.
- [x] NCSC-13 Existing playable and shot-visual specs remain intact; walk, shot, debris, pickup, LOS, desktop, mobile, and outcome regressions pass.
- [x] NCSC-14 No shooter-kit, DOOM-parity, production-rendering, or generic collision claim is introduced.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | NCSC baseline | `FPS-BAR.md`, current source, two browser specs, and LOS/props unit suites located | In progress |
| 2026-08-23 | NCSC-02 | Fresh playable browser lifecycle moves the player more than 0.3 units while preserving exact body Y, then proves x/y/z remain identical throughout pause; route typecheck passes | Passed |
| 2026-08-23 | NCSC-06 | Fresh `neon-corridor-strike-shot-visual.spec.ts` proves four Aura scene FX nodes, barrel-origin and forward-travel positions, material frame delta, bounded far-hall delta, and timed removal; no DOM/canvas shot path exists | Passed |
| 2026-08-23 | NCSC-07 | `corridor-los.test.ts` passes 3/3 against production Rapier with positive pinned sphere radius, wall-only query layer, open/blocked lanes, and degenerate-segment behavior; current release captures contain no debug query guide | Passed |
| 2026-08-23 | NCSC-08 | Fresh playable browser evidence mounts typed `arena`, `impA`, `impB`, `pulseRifle`, `ammoCrate`, and `medkit`; source audit retains primitives only for dressing/effects/collision support | Passed |
| 2026-08-23 | NCSC-09 | New `corridor-pickups.test.ts` passes 2/2: ammo/health truth mutates, health clamps, body and model removal hooks fire once, non-pickup sensors are rejected, and a repeated overlap cannot retrigger; playable browser pickup progression also passes | Passed |
| 2026-08-23 | NCSC-14 | README, known-limits, source evidence, and public imports retain the route-local `prototype` boundary and explicitly reject shooter-kit, DOOM/parity, production-rendering, WebGPU/postprocess, and generic-collision claims | Passed |
| 2026-08-23 | NCSC-01 | Fresh playable browser evidence changes both yaw and pitch and publishes the corresponding 3D look target; `lookTargetPoint` now derives every target coordinate from the current yaw/pitch rather than restoring a fixed vertical target | Passed |
| 2026-08-23 | NCSC-03 | Fresh hidden-versus-visible WebGL pixel isolation proves an unclipped real rifle at desktop 1280x800 (`x=817,y=404,w=235,h=269`) and mobile 390x844 (`x=263,y=461,w=93,h=272`), wholly right/below the protected reticle and forward-play lane; HUD bounds and >=44px controls also pass | Passed |
| 2026-08-23 | NCSC-04 | `corridor-hit-authority.test.ts` and fresh browser evidence independently pin collision-body Y `0.72`, rendered-model Y `-0.45`, and all four live body positions | Passed |
| 2026-08-23 | NCSC-05 | `corridor-hit-authority.test.ts` passes 2/2 for query-owned hit/miss transition and presentation-only hooks; the shot browser proof derives barrel/end/impact visibility from the resolved shot pose without a presentation mutation path | Passed |
| 2026-08-23 | NCSC-10 | Fresh pause/reset browser proof freezes exact player/enemy/prop poses, shot age/lifetime, spawn/reload/weapon clocks, audio state, and status; reset restores authored bodies, timers, ammo/health, effects, and audio on the same `mountId` | Passed |
| 2026-08-23 | NCSC-12 | Reduced-mode browser evidence naturally fires, alarms, and takes damage with `reducedMotion=true`, `reducedFlash=true`, zero camera shake, visible shot truth, flash capped at `0.35`, and damage-vignette opacity capped at `0.28` | Passed |
| 2026-08-23 | NCSC-13 | Final consolidated run passes 11/11 focused unit assertions and 8/8 browser scenarios; the package-local gameplay smoke also passes its complete keyboard lifecycle in 3.6 minutes, route typecheck/build pass, strict asset validation reports no failures, and the rebuilt deploy check reports `ok:true` | Passed |
| 2026-08-23 | NCSC-11 | Exact desktop/mobile/touch/reduced/pickup/alarm/win/fail artifacts regenerated; WebGL pixels prove 562 color buckets with cyan/warm/green presence and DOM/accessibility boundaries pass, but independent visual approval is deliberately not self-issued | Pending independent review |
| 2026-08-23 | FPS-BAR §4 | `neon-corridor-strike-endurance.spec.ts` passes a 65.125-second real-input, non-autoplay session with 13.63m movement span, 33 shots, 8 hits, 23 reload inputs, pause/resume, and three natural loss/reset loops; `ui-composition-before-after.webm` is SHA-256 `ed86c7fe242198b63333ee799b0ebf537c5d7749027241aa736b7b7043f8a6aa` | Passed |
