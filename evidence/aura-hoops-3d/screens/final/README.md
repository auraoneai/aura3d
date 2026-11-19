# Aura Hoops 3D: final screenshots (2026-11-18; all frames retaken 2026-11-19 with the cleaned jerseys)

Route: `/apps/showcase-aura-hoops-3d/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build (http://127.0.0.1:8790).

| Viewport | State | Meaning |
|---|---|---|
| 1280 | `1280-01-title.jpg` | modes menu (`?menu=1`): squads, difficulty, courts (retaken 2026-11-19) |
| 1280 | `1280-02-early.jpg` | ?autoplay=1 Rucker Park, early play, cleaned jersey textures (retaken 2026-11-19) |
| 1280 | `1280-03-action.jpg` | CPU check-ball and drive, both teams on the floor, cleaned jerseys (retaken 2026-11-19) |
| 1280 | `1280-04-venice.jpg` | Venice Beach sunset, jump shot released over a defender, cleaned jerseys (retaken 2026-11-19) |
| 1280 | `1280-05-orbit.jpg` | Orbit Court neon arcade, jump shot, ball leaving the hands, cleaned jerseys (retaken 2026-11-19) |
| 1280 | `1280-06-shanghai.jpg` | Shanghai Riverside night (wet court), jump shot over the defence, cleaned jerseys (retaken 2026-11-19) |
| 1280 | `1280-07-results.jpg` | results card (`?autoplay=1&target=3`): RUN LOST 0-3, box score, Menu / Rematch (retaken 2026-11-19) |
| 390x844 | `390-01-title.jpg` | Rucker attract view before play (retaken 2026-11-19) |
| 390x844 | `390-02-early.jpg` | ?autoplay=1 portrait chase camera, Rucker Park (retaken) |
| 390x844 | `390-03-action.jpg` | jump shot over a defender, Rucker Park (retaken) |
| 390x844 | `390-04-orbit.jpg` | ?court=orbit, drive into the paint (retaken) |
| 390x844 | `390-05-athens.jpg` | ?court=athens, ball handler at the arc (retaken) |
| 390x844 | `390-06-results.jpg` | results card on a phone (`?autoplay=1&target=3`, RUN LOST 1-3, retaken) |
| 1440x900 | `card-2x.jpg` | Rucker Park jump shot at the rim over the defence, cleaned jerseys (retaken 2026-11-19; `card-1x.jpg` = 720x450 LANCZOS downscale) |

## Checked in the frames

- dribbling and shooting with hands on the ball (no arms-wide); ball ~1.2x real size
- 33 ms screencast bursts: smooth locomotion, no jitter; camera cuts only on play changes
- pass-through: drawn rim = physics rim (0.27 m / 0.022 m tube), stanchion/arm/table/ball cart solid for players and the ball, passes through a defender are knocked loose
- jam aura is now a floor glow (was a 1.9 m translucent orange column)
- all six courts run hands-free with ?autoplay=1

## Known issues

- Shanghai: the lightning no longer strikes at load (it struck at game time 0 on every boot/restart; now one full 40 s interval into live play, peak 9 -> 1.5) and the ball ribbon draws only on shot arcs. Still open: brief (<= 0.25 s) soft white veils at some pass/poke camera swings in the first seconds (frame mean +25 over the median); not the lightning, rain, bloom settings, trophy or AO (each ruled out on the GPU)
- Venice 390x844: low sun glare washes the portrait frame at some camera angles
- jersey textures were cleaned on 2026-11-19 (blotches and back streaks inpainted, re-admitted under the same keys); a few faint dark streaks remain near the hems
- autoplay stall watchdog fired once on Manila ('PLAY STALLED, RE-CHECK') and recovered

## Known issue (2026-11-19)

- Rucker Park: on some pass swings the eye passes the east-south floodlight corner and one or two frames get a warm veil over the left half (frame mean +10 to +25). It needs the key light (it goes away with the key off) but not its shadow, fog, bloom nodes, contact shadows, SSR, beams or practicals. Open; the engine is the likely owner.
- Jersey textures cleaned 2026-11-19 (two passes, no regeneration); every frame in this folder shows them.
