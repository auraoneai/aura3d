# Neon Corridor Strike — Hostile Utility Deck Redesign

**Route:** `examples/neon-corridor-strike/`  
**Claim boundary:** root-safe route with route-local prototype FPS logic; no reusable shooter kit claim  
**Binding companion:** `CurrentGames-PRD/03-Neon-Corridor-Strike-CONSTRAINTS.md` and the route's `FPS-BAR.md`

## Player promise

Push through a claustrophobic service deck, manage a small rifle magazine, read enemy lines of sight, use pickups under pressure, and breach the final lock. It should feel like a short authored combat run with escalating space and sound—not a raycast demonstration in a neon hallway.

## Redesign direction

### Spatial arc

- **Airlock:** safe three-second orientation with rifle, reticle, objective, and first door readable.
- **Service spine:** first enemy at medium range teaches hit/miss/cover and silhouette language.
- **Generator bay:** wider fight with dynamic debris and hanging fixtures reacting outside the navigation lane.
- **Alarm corridor:** tighter sight lines, red state lighting, ammunition pressure, and a meaningful pickup decision.
- **Final lock:** two-angle encounter followed by a visible breach outcome and clean result/reset state.

Reuse the current arena only where its geometry supports this arc. Do not bury play behind added greebles. Instancing supplies repeated pipes, brackets, and distant machinery; hero landmarks and combat cover stay intentionally placed.

### Visual grammar

- Base values: charcoal/steel surfaces with sodium pools. Player weapon and friendly interaction use cyan; enemies/alarm use red; health uses green plus cross silhouette; ammo uses amber plus crate silhouette.
- The weapon occupies the lower-right frame with breathing room around the barrel and reticle. Muzzle effects are short and directional.
- Enemy material/value contrast must survive fog and alarm mode. A visible enemy cannot merge into an emissive wall strip.
- Damage response uses directional UI plus restrained scene/camera response; never a full opaque red screen.
- Sector names may use supported `text3D` on walls but cannot be the only navigation cue.

### Combat feel

Shot truth remains query-owned. Presentation sequence: trigger → muzzle spark → beam from barrel to resolved end → hit/miss effect → audio → small recoil return. Enemy LOS uses filtered sphere casts; reaction state must be apparent through pose/motion, light/icon support, and audio rather than invisible telemetry.

Pickups use once-per-entry sensors/overlap logic and visibly leave the world. Debris and spring lamps add consequence to firefights but never block the required route or affect hit truth.

## Implementation seams

| System | Direction |
| --- | --- |
| player/look | preserve proven mouse-look and walk-height laws |
| firing | preserve hitscan authority; rebuild only the state-driven presentation layer |
| enemy perception | route-local filtered query with deterministic test fixtures |
| pickups | typed models plus sensor/overlap state transition |
| environment | typed arena primary; instanced dressing, LOD where useful, dynamic debris outside path |
| effects/audio | Aura3D-rendered effects and typed registered cues; separate ambient/weapon/enemy/UI lanes |
| HUD | ammo, health, objective, threat direction, pause/result; compact and accessible |

## Delivery slices

1. Lock constraints and pin six acceptance states before altering visuals.
2. Repair first-person composition, enemy contrast, lighting zones, reticle, and HUD.
3. Rebuild shot, hit, damage, pickup, alarm, and breach feedback from actual state events.
4. Add spatial density, debris, lamp reaction, LOS behavior, and sector identity without narrowing play.
5. Re-run all FPS regressions, mobile framing, reduced-motion/flash, deploy, evidence, and human review.

## Definition of done

- [x] Every law in the constraints companion and `FPS-BAR.md` has direct evidence.
- [x] Keyboard/mouse and promised touch inputs prove movement, look, fire, reload, pickup, pause, win/fail, and reset.
- [x] Shot visual leaves the barrel, travels toward the resolved endpoint, and differs for hit/miss.
- [x] Enemy bodies/models remain calibrated; LOS filtering and reaction are deterministic.
- [x] Pickups trigger exactly once per entry and visibly change both scene and game state.
- [x] Debris/lamps cannot block the route; debug geometry is absent from final captures.
- [ ] First-load, shot, pickup, alarm, breach, outcome, mobile, and reduced-mode captures pass independent review.
- [x] Route stays labeled prototype FPS; no shooter-kit, parity, or unproven renderer language.

## Execution ledger

**Status:** Machine-complete; blocked only on independent exact-artifact review  
**Last verified:** 2026-08-23 05:42 PDT  
**Implementation scope:** `examples/neon-corridor-strike/`, Corridor unit/browser/evidence surfaces, and both Corridor PRDs  
**Authoritative evidence:** completed constraint ledger; current source/assets; unit/browser/build/deploy output; exact scenario artifacts and independent verdict  
**Remaining blockers:** independent exact-artifact review keeps binding law NCSC-11, parent roll-up NCS-01, and combined release requirement NCS-12 open; no machine implementation or verification blocker remains

### Requirement checklist

- [ ] NCS-01 Every item in the binding Corridor constraint ledger is complete.
- [x] NCS-02 Airlock, service spine, generator bay, alarm corridor, and final lock form the promised spatial/combat arc.
- [x] NCS-03 Added density/instances/debris/lamps preserve navigation lane, cover, enemy, pickup, and exit readability.
- [x] NCS-04 Palette, weapon framing, enemy contrast, damage response, sector signage, HUD, and alarm state follow the visual grammar.
- [x] NCS-05 Shot presentation follows trigger, muzzle, barrel-to-end beam, hit/miss response, audio, and recoil from actual query state.
- [x] NCS-06 Enemy perception/reaction is deterministic, filtered, and visibly understandable.
- [x] NCS-07 Typed pickups fire once, mutate ammo/health truth, and visibly leave/disable the scene.
- [x] NCS-08 Dynamic debris and spring lamps add only lane-safe physical flavor and cannot alter hit truth.
- [x] NCS-09 Typed registered ambient/weapon/enemy/UI audio and renderer-owned effects are state-driven.
- [x] NCS-10 Keyboard/mouse and promised touch prove movement, look, fire, reload, pickup, pause, win/fail, and reset.
- [x] NCS-11 First load, enemy, shot, pickup, alarm, breach, outcome, mobile, and reduced-mode artifacts pass visual/runtime assertions.
- [ ] NCS-12 Route-health, assets, performance, accessibility, deployment, prototype claims, and independent review pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | NCS baseline | Current example, manifest, unit/browser families, and binding law sources inventoried | In progress |
| 2026-08-23 | NCS-07 | New once-per-entry pickup units prove state mutation, clamping, body/model removal, sensor filtering, and deduplication; fresh playable browser proof reaches a real pickup | Passed |
| 2026-08-23 | NCS-08 | `corridor-props.test.ts` passes 4/4 for protected-lane/pickup/exit clearance, deterministic Rapier settle, impact-driven lamp sway, and bounded return; debris uses an isolated wall/debris layer and remains presentation-only | Passed |
| 2026-08-23 | NCS-09 | Fresh playable browser proof exercises gesture unlock, ambient drone, fire/hit/kill, pickup, alarm/hurt, win/lose, dry-fire, and reload cues from typed CLI assets; pause now suspends ambient and active cue elements and prevents new cue progression until resume | Passed |
| 2026-08-23 | NCS-05 | Query-authority units pass 2/2 and the fresh shot browser proof records trigger-ammo truth, four renderer-owned shot nodes, barrel origin, forward beam endpoint, visible directional muzzle/impact delta, hit/miss state hooks, typed fire/hit audio, and bounded recoil return | Passed |
| 2026-08-23 | NCS-06 | LOS units pass 3/3 against production Rapier with the pinned wall layer/filter/radius; fresh alarm/damage and playable artifacts plus typed alarm/hurt cues expose reaction state while browser evidence retains deterministic enemy bodies and state transitions | Passed |
| 2026-08-23 | NCS-10 | Fresh keyboard/mouse and coarse-pointer browser lifecycles prove real movement, two-axis look, fire, live reload, once-only pickup, pause/resume, natural win, natural fail, and reset; touch controls are route-local, in bounds, and >=44px | Passed |
| 2026-08-23 | NCS-11 | Runtime assertions and the exact first-load, shot, pickup, alarm, breach/win, fail, desktop, mobile, touch, and reduced-mode files are green and regenerated; independent visual review remains required and is not self-approved | Pending independent review |
| 2026-08-23 | NCS-12 | Route typecheck/build, strict licensed non-placeholder asset validation, exact rebuilt deploy (`ok:true`), WebGL2 pixel diversity, 120-frame pacing (33.1ms median, 34.5ms p95, zero long tasks), semantic/focusable HUD checks, and prototype claim audit pass; independent review remains open | Machine gates passed; independent review pending |
| 2026-08-23 | FPS session/recording gate | The dedicated endurance browser gate passes 65.125 seconds of real pointer/keyboard play (not autoplay), including combat, reload, pause, natural failure, reset, and ongoing progression; exact WebM and SHA-bound JSON live under `tests/reports/neon-corridor-strike-endurance/` | Passed |
