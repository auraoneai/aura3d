# Aura Clash Arena — Graphic Rooftop Duel Redesign

**Route:** `apps/aura-clash-showcase/` and `/showcase/aura-clash/playable/`  
**Claim boundary:** `production-runtime` development showcase; never call it flagship or a reusable fighting kit

## Player promise

Win a readable, tense rooftop duel by controlling distance, guarding deliberately, and punishing openings. Every pose and hit should read like a graphic fight poster in motion. The redesign removes visual noise and makes timing, silhouettes, and consequence—not raw effect count—the spectacle.

## Preserve

- Combat frame data remains law and presentation timing remains a separate layer.
- Existing HP, guard, meter, round timer, KO lock, rematch, AI, accessibility, and evidence contracts remain compatible.
- Typed animated fighters and stage provenance stay explicit.
- Existing advanced/production/runtime imports are confined to this app and do not become root claims.

## Creative redesign

### Stage and silhouette

- Frame both fighters full-body with a stable ground line and safe combat margins at every camera zoom.
- Darken and simplify the rooftop midground. Jade identifies the player; magenta identifies the rival; amber is reserved for shared danger/ceremony.
- Use one strong skyline silhouette, two restrained spring signs, and a low instanced crowd rim. No background element may cross fighter heads or active limbs.
- The HUD becomes a broadcast frame: large health silhouettes, compact meter, central timer, clear round score, and no developer copy on the play route.

### Combat grammar

- Startup: pose anticipation and weapon/limb silhouette, not a flash.
- Contact: short hit-stop, directional spark, one camera impulse, impact audio, and crowd response scaled by move strength.
- Block: cooler, flatter spark and guarded pose; never visually confused with a hit.
- Whiff: readable recovery and air movement, no fake impact.
- KO: freeze a clean contact silhouette, dim secondary stage motion, reveal in-world `K O`, then resolve to result/rematch.

Animation events may dispatch `sfx`, `vfx`, `camera.impulse`, or captions when backed by real clip metadata. They never own hitbox windows; combat frame data stays authoritative.

### Match arc

1. Three-second round ceremony and neutral spacing.
2. Rival demonstrates its aggression role through movement before committing.
3. First clean hit teaches hit versus block language.
4. Low-health state simplifies the mix and increases tension without strobing.
5. KO produces the signature poster frame and a fast rematch choice.

## Aura3D implementation map

| Need | Surface/path | Boundary |
| --- | --- | --- |
| fighter rendering/animation | existing production/advanced runtime app path | package/app proof only |
| combat truth | existing route-local frame data and combat state | no physics-driven rewrite |
| presentation events | animation event bridge | metadata-driven and presentation-only |
| AI roles | seeded `createCombatAi` presets where already integrated | route-local fight decisions |
| crowd | one instanced pool | visual only; never enters lane |
| ceremony | supported mesh text | DOM mirrors all important text accessibly |
| stage reaction | deterministic spring props | set dressing; static under reduced motion |
| replay | last-exchange state/input buffer | debug/training only; exits cleanly to live play |

## Delivery slices

1. Pin five combat states and rebuild stage values, HUD, camera margins, and fighter lighting around them.
2. Audit clip/frame metadata; retime presentation events without changing move data.
3. Rework hit/block/whiff/KO effects and mix at light, heavy, special, and guard-break strengths.
4. Add crowd, ceremony, sign reaction, AI role readability, and training replay only after combat remains clean.
5. Run exact-artifact desktop/mobile/accessibility/performance review across all routes.

## Acceptance scenarios

- Neutral stance, light hit, guarded heavy, special connect, and KO freeze.
- Both fighters remain fully legible at minimum and maximum camera distance.
- Player/rival identity is distinguishable without hue alone.
- Reduced-motion/flash states retain timing and hit/block distinction.
- Training replay produces the same pinned HP timeline and never appears on normal play.

## Definition of done

- [x] Move frame-data file is unchanged or any authorized change has dedicated balance approval.
- [x] Browser proof covers movement, guard, each attack class, KO, pause, rematch, and AI role differences.
- [x] Hit, block, whiff, and KO are visually distinct in pinned subject-region captures.
- [x] Clip events are metadata-backed and cannot alter combat authority.
- [x] Crowd is instanced, signs remain outside the lane, and reduced motion freezes secondary motion.
- [ ] Exact desktop/mobile captures pass readability, clipping, contrast, HUD, and performance review.
- [ ] Claims remain `production-runtime` development showcase; independent human approval is recorded before promotion.

## Execution ledger

**Status:** Machine-complete; blocked only on independent exact-artifact review  
**Last verified:** 2026-08-23 23:29 PDT  
**Implementation scope:** `apps/aura-clash-showcase/src/playable/`, `apps/aura-clash-showcase/tests/`, `apps/aura-clash-showcase/scripts/`, app launch evidence and machine reports, focused Clash unit tests, and this PRD  
**Authoritative evidence:** 95 focused unit assertions; 43 mounted browser tests; shipping typecheck/build; typed asset and route checks; eight-command development-showcase machine gate; deployed-compatible launch proof; exact hashed combat-state captures including real whiff recovery and guard break  
**Remaining blockers:** ACA-12 independent review of the exact desktop/mobile/reduced-state artifacts and the independent-approval portion of ACA-13 remain open; promotion remains false and no machine implementation or verification blocker remains

### Requirement checklist

- [x] ACA-01 Combat frame data, HP/guard/meter/timer, KO lock, rematch, AI, accessibility, and additive evidence contracts remain authoritative.
- [x] ACA-02 Typed animated fighter/stage provenance is current and advanced/production imports remain confined to the app claim boundary.
- [x] ACA-03 Neutral camera frames both full fighters, stable ground line, and combat margins at minimum/maximum zoom.
- [x] ACA-04 Stage/HUD redesign proves clean rooftop values, jade-player/magenta-rival identity, non-color support, and no fighter occlusion.
- [x] ACA-05 Startup, hit, block, whiff, guard break, special, and KO each have distinct state-driven pose/effect/audio/camera language.
- [x] ACA-06 Clip-event metadata drives presentation only and cannot change combat hitbox authority.
- [x] ACA-07 Seeded AI aggression roles are behaviorally distinct and deterministic.
- [x] ACA-08 Instanced crowd, ceremony mesh text, and spring signs remain visual-only, lane-safe, and reduced-motion safe.
- [x] ACA-09 Training exchange replay reproduces the pinned HP timeline, exits cleanly to live play, and remains hidden from normal play.
- [x] ACA-10 Complete match arc proves ceremony, neutral pressure, hit/block teaching, low-health tension, KO, result, and rematch.
- [x] ACA-11 Browser evidence proves movement, guard, all attacks, AI, pause, KO, result, rematch, and accessibility modes.
- [ ] ACA-12 Neutral, light hit, guarded heavy, special, KO, mobile, reduced-motion, and reduced-flash artifacts pass exact review.
- [ ] ACA-13 Performance, typed assets/audio, route metadata, deployment, bounded claims, and independent approval pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | ACA-01, ACA-06, ACA-07, ACA-08, ACA-09 | `pnpm exec vitest run tests/unit/apps/aura-clash-*.test.ts tests/unit/apps/clash-*.test.ts` | Pass — 23 files, 95/95 assertions; frame authority, clip-event isolation, seeded AI roles, replay, crowd, ceremony, and spring-sign contracts covered |
| 2026-08-23 | ACA-01, ACA-05, ACA-10, ACA-11 | Focused nine-spec Playwright command covering playable smoke, screenshots, visual regression, combat/camera feel, replay, accessibility, audio, and performance | Pass — 43/43 mounted browser tests, including static low-health tension, real whiff recovery without fake contact, and engine-resolved guard-break presentation |
| 2026-08-23 | ACA-01, ACA-02 | `pnpm --dir apps/aura-clash-showcase typecheck`; `build`; `assets:check`; `routes:check` | Pass — shipping TypeScript clean, 939 modules built, two distinct typed/provenance-tracked animated fighter GLBs, six route metadata contracts |
| 2026-08-23 | ACA-02, ACA-11, ACA-13 machine portion | `pnpm --dir apps/aura-clash-showcase flagship:gates` | Pass — eight commands; `tests/reports/flagship-gates.json` and `flagship-readiness.json` report `development-showcase-machine-passed`, `promotion.approved=false`, and `humanApprovalRequired=true` |
| 2026-08-23 | ACA-13 machine portion | `launch:evidence`; `launch:screenshot`; `launch-evidence/aura-clash-106-readiness.json` | Pass — 25 targets, deployed-compatible proof, readiness SHA-256 `e19797d9fcfeb173f6a6d8d793572da83d5959dd4636c87e9508ec782f55006b`; independent approval remains open |
| 2026-08-23 | ACA-05 | `tests/combat-feel.spec.ts`; `tests/visual-regression.spec.ts`; whiff `f4d92a721c546597c59b24cdea74691f9433ceb58160f79ac435c7588b664271`; guard break `513eac5e185094fef1bdf7f62166f168de23af2cc31f0ec025884d8c14d6bad1` | Pass — whiff freezes the authored late-recovery pose with no contact VFX/hit cue/camera response; guard break publishes distinct hurt pose, magenta eight-ray impact, typed cue, callout, and camera beat |
| 2026-08-23 | ACA-03, ACA-04, ACA-12 review package | Exact artifacts: first `1858179e13b70678b53d196ee4b2fda669111260b91429bf294179c68265af1c`; hit `bee1980c7226bc16d2d8e6325342e4e6e3a3ea66b818b0adb5f03174b6492551`; guard `1d9cb258301842d3a147a920461a77db29ad4cf94491ace4f8d8008243cb3502`; special `9ceaf1684a777622e922010167ca7d6e656cf4ad0eec2ee00f9d54d4786647b1`; KO/reset `d8f0709227b64fafbcdbd485286a3095daa68c312089f05dfff08f1d3f681973`; mobile `3a3641ce0c6438301ef89b29cfa3516bba4fd37d1b4203f42e4524f465e516f4` | Awaiting independent exact review; no automated approval inferred |
| 2026-08-23 | ACA-03, ACA-04 final machine proof | Live camera evidence now derives full-body envelopes from both typed fighter manifests, expands at maximum separation/jump height, and proves nonnegative clearance through the tightest hit zoom; browser composition proves the HUD ends before the renderer on 1280×800 and 390×844, identity has names/round marks beyond hue, and all declared rooftop items are observed render submissions | Passed |
| 2026-08-23 | Final flagship rerun | Complete `flagship:gates` rerun passes readiness, 6/6 flagship browser cases, asset quality, 2/2 audio, 2/2 performance/long-session, exact visual regression, deterministic replay, and deployed-compatible play; guard-break capture fixture was made deterministic without bypassing the normal combat resolver | Machine-complete; `promotion.approved=false`, `humanApprovalRequired=true` |
