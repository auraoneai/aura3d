# Aura FC 3D: final screenshots (2026-11-18)

Route: `/apps/showcase-aura-fc-3d/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build (http://127.0.0.1:8790).

| Viewport | State | Meaning |
|---|---|---|
| 1280 | `1280-01-title.jpg` | kickoff ident: Aurora FC vs Munich Iron |
| 1280 | `1280-02-early.jpg` | ?autoplay=1 build-up, dribble with the ball at the feet |
| 1280 | `1280-03-action.jpg` | shot on goal, keeper diving |
| 1280 | `1280-04-goal.jpg` | GOAL! with replay tag |
| 1280 | `1280-05-save.jpg` | keeper denies a shot at the near post |
| 1280 | `1280-06-kyoto.jpg` | second venue: Kyoto night |
| 1280 | `1280-07-fulltime.jpg` | results: FULL TIME banner + scoreline (`?autoplay=1&qaHalf=20` shortens halves to 20 s, QA only) |
| 390x844 | `390-01-title.jpg` | kickoff ident wrapped to the phone width |
| 390x844 | `390-02-early.jpg` | build-up on a phone |
| 390x844 | `390-03-action.jpg` | attack into the box |
| 390x844 | `390-04-mid.jpg` | after the opening goal |
| 390x844 | `390-05-favela.jpg` | Favela cage court |
| 390x844 | `390-06-fulltime.jpg` | full-time banner on a phone (`?autoplay=1&qaHalf=20`) |
| 1440x900 | `card-2x.jpg` | Munich: dribble and passing lane, both teams, full stadium (`card-1x.jpg` = 720x450 LANCZOS downscale) |

## Checked in the frames

- ball ~1.9x real (drawn r 0.21 m) for readability, not 10x the player; players run with legs moving (33 ms bursts smooth)
- pass-through: posts/crossbar solid at drawn size (dipping balls bounce off the bar), players never overlap (0.6 m), never walk through posts, nets or cage walls; hoardings moved behind the goal nets
- lens flares: no ghost discs; small lamp-head glow only, none on portrait screens (the 390x844 frames had big white discs before)
- all six venues run hands-free with ?autoplay=1

## Known issues

- fixed 2026-11-19: kickoff goals. The defending side now presses with one man + a cover, holds its back line goal-side, never camps on a keeper with the ball, and the keeper narrows the angle; 20 autoplay matches: 0 goals within 5 s of a kickoff (was 15 of 69 inside 6 s), 51 goals in 65 sim minutes (tests/unit/aura-fc-3d/kickoff-defense.test.ts). GPU: kickoff and second-half kickoff frames show press + cover, no early goal.
- pre-existing balance: CPU v CPU the away side scores about twice as often as the home side (40 seeded matches: 33-70 now, 46-95 before this pass)
