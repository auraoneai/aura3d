# Aura Slam 3D: final screenshots (2026-11-19)

Route: `/apps/showcase-top-tennis/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build (http://127.0.0.1:8790).

| Viewport | State | Meaning |
|---|---|---|
| 1280 | `1280-01-title.jpg` | Modes menu (Choose your tennis match) over the live court (`?menu=1`) |
| 1280 | `1280-02-early.jpg` | `?autoplay=1` first points on NY Hard, OUT call |
| 1280 | `1280-03-action.jpg` | rival striking, ball in play |
| 1280 | `1280-04-rally.jpg` | rally, ball over the net |
| 1280 | `1280-05-grass.jpg` | London Grass: full stadium, rear wall with the AURA SLAM WORLD TOUR banner, the two corner A-frame panels |
| 1280 | `1280-06-clay.jpg` | Paris Clay rally |
| 1280 | `1280-07-results.jpg` | results card, VICTORY 3-0 with match stats (`?qaFinish=1`) |
| 390x844 | `390-01-title.jpg` | Modes menu on a phone |
| 390x844 | `390-02-early.jpg` | portrait court: rear wall, banner and corner panels at the far end, touch controls |
| 390x844 | `390-03-action.jpg` | serve |
| 390x844 | `390-04-mid.jpg` | rally |
| 390x844 | `390-05-clay.jpg` | Paris Clay on a phone |
| 390x844 | `390-06-results.jpg` | results card on a phone |
| 1440x900 | `card-2x.jpg` | London Grass rally, full stadium (`card-1x.jpg` = 720x450 LANCZOS downscale) |

## Checked in the frames

- the sim's three ball deflectors are drawn where they deflect: the padded rear wall spans the collider (|x| <= 7.2 m, face z -10.8, 0.765 m; sponsor boards flush with it) and the two angled corner A-frame panels (x +-5.2, z -9.3, 1.5 x 0.96 m, turned 0.16 rad) stand in the far corners; the board lettering moved onto the wall's centre pad so the panels do not hide it, the venue/score line stays readable
- umpire chair, benches, coolers, towel racks, stands and crowd: the live (in-play) ball never reaches them in the golden replays; a dead ball that the sim lets roll on is drawn stopping at the first solid it meets and dropping onto what is under it (tests/unit/aura-slam/court-solids.test.ts)
- Idol athletes move with real motion (serve toss, split-step, lunges); ball scale ~2.3x real for broadcast readability
- six venues run hands-free with `?autoplay=1`, no stalls; no page errors

## Known issues

- none found in these frames
