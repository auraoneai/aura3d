# Aura Links 3D (G10) acceptance checklist, GU47 WP-20

Every acceptance line of PRD lines 792-810 with its phase-1 status. `unit` = proved by a unit test in `tests/unit/aura-links-3d/`; `phase 2` = needs the remote steady-state capture, a measured budget or the judge; `WP-36` = needs a generated asset.

| Row | Acceptance | Status |
|---|---|---|
| LINKS-01 | sun vectors differ >= 25 deg pairwise (unit test) | done, unit (`course-look.test.ts`) |
| LINKS-01 | pcss with >= 3 cascades | done, unit (High: pcss 3; Low: pcf 1, PRD §6.4) |
| LINKS-01 | no ambient-flattens | done, unit (no ambient or hemisphere light on any course; art-direction audit clean) |
| LINKS-01 | St Auroras vs Cinder top row >= 12 | phase 2 |
| LINKS-02 | 6 distinct environment keys | done, unit |
| LINKS-02 | day top rows differ >= 12; Mare top >= 4; Neon top >= 10 | phase 2 |
| LINKS-02 | <= 12 MB | done (six 1k files, 8,435,469 B); 2k copies are an E-A handoff |
| LINKS-03 | St Auroras top-bottom +15 with fog on | phase 2 (height haar authored) |
| LINKS-03 | Cinder god-ray stage ran | phase 2 (volumetricFog godRayDensity node on High, unit) |
| LINKS-03 | Cloud mean 145-175, clip <= 0.02 | done phase 3: mean 160.1, clip 0 (luma-after.json, run g10p3-r8b-2, software WebGL2) |
| LINKS-03 | no Mare fog node | done, unit |
| LINKS-04 | Maple and St Auroras stages differ (grain on Maple) | done, unit (grain node on Maple High only); stage trace phase 2 |
| LINKS-04 | Cloud cell stddev 1.3x | phase 2 |
| LINKS-04 | hue differs >= 15 deg St Auroras vs Maple | phase 2 (cold -0.12 vs warm +0.18 temperature authored) |
| LINKS-05 | validate --release; texel p50 256-1024 px/m; turf stddev >= 2x; <= 48 MB per course | see lane report |
| LINKS-06 | hash same; golfer pixels >= 250 <= 1%; Neon golfer >= 1.5x turf | WP-36 (matte retexture) + phase 2 |
| LINKS-07 | no `conifer-boughs`; no flora key shared between courses; no primitive-subject | see lane report |
| LINKS-08 | rg for borrowed prefixes returns nothing; validate --release; 0 borrowed findings | WP-36 (landmarks, ball, SFX) |
| LINKS-09 | <= 4 extra draws; phone <= 50% instances; rough crop moves >= 2 luma over 1 s | see lane report |
| LINKS-10 | <= 24 static per hole; >= 3 runtime decals per hole; <= 32 total | partial: a runtime pitch-mark decal on each landing (divot preset); counts phase 2 |
| LINKS-11 | no `effects.runtime = "off"` | done, unit (`vfx.test.ts`) |
| LINKS-11 | liveCount > 0 within 100 ms of landing and 0 by 2 s | phase 2 (every particle life <= 1.8 s, unit) |
| LINKS-11 | spec colours >= 20 deg apart | done, unit |
| LINKS-12 | no play() under reduced motion; flyover 4-6 s, skip within 1 frame; DOF only in those shots; no inside-geometry frames | see lane report |
| LINKS-13 | golfer key only on the player; >= 3 spectator keys; <= 10 actors; flag test 0 on Mare | partial: flag flutter from wind, 0 on Mare (unit); spectators WP-36 |
| LINKS-14 | hole map matches path; accents >= 30 deg apart; contrast >= 4.5:1; no Barlow/Inter/Roboto | partial: accents unit-tested; see lane report |
| LINKS-15 | <= 220 desktop, <= 150 phone on all 6; fps +-10%; NEW `evidence/aura-links-3d/budget.json` | partial: budget.json committed with expected deltas; measurements phase 2 |
| LINKS-16 | Neon darkFrac <= 0.25 (0.43), mean 35-70, p95 >= 170; Mare darkFrac <= 0.35; Cinder 0.5-3% pixels >= 230 | phase 3 partial: Neon darkFrac 0.02, mean 55.5 in band, p95 98 open (lit skyline/masts WP-36); Mare darkFrac 0.386 open (Earth disc WP-36); Cinder not measured (open) |
| LINKS-17 | <= 2 mirrors at 256 px; pond/lava moves >= 2 over 0.5 s; lava mean >= 180 | see lane report |
| LINKS-18 | emitter listed; <= 2,000 high, 0 low; reduced motion halves | done, unit (ambient emitters per course, sun flares on St Auroras and Cinder) |
| LINKS-19 | courses' middle-row hues >= 10 deg apart or means >= 12; same_game false on >= 75% of 48 trials vs each; every category >= 7; 0 warnings | phase 2 (QA crops published, see lane report) |

## Phase 3 (4.7.1)

- Rubric (model judge, software WebGL2): min 3 -> 3.5, every category listed in the lane report; >= 7 not met (open 4.7.2; modeling_assets, material_quality, environment_world, ibl_reflections blocked on WP-36).
- Distinctness: hoops 0.817, top-tennis 0.86, fc 0.871 pass; diamond 0.79 fail (open 4.7.2).
- Game checks: 0 errors; 24 warnings (20 borrowed-asset WP-36, 4 luma-band against the PRD bands as written).
- LINKS-17 ponds: High reflects the IBL (planar on Ultra) with a 2 cm ripple set: the High planar capture and the engine calm swell drew speckles and pale bands (runs g10p3-r3-1, r5-2); fixed in the final screens (g10p3-r8-1 swing-5).
- Final screens: 1280x720, titles, card 1x/2x retaken on the final build; 390x844 play and 04-results open (4.7.2).
