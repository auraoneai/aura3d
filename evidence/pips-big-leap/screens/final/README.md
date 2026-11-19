# Pip's Big Leap: final screenshots

Route: `/apps/showcase-pips-big-leap/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA `capture_browser_scenario`, production build served from http://127.0.0.1:8790 (2026-11-18).

| Viewport | File | State | Meaning |
|---|---|---|---|
| 1280x720 | 1280-01-title.jpg | title | world intro card (Starfall Garden, ?world=w6&autoplay=1) |
| 1280x720 | 1280-02-early.jpg | early | ?autoplay=1, 1.2 s: Pip sets off through Whispering Forest beside a beetle |
| 1280x720 | 1280-03-action.jpg | action | autoplay hops the forest ledges past the stone pillar (2/6 sun-seeds) |
| 1280x720 | 1280-04-boss.jpg | boss | Hollow Palace (?world=w5&autoplay=1): Brambleback boss fight banner |
| 1280x720 | 1280-05-starfall.jpg | starfall | Starfall Garden night world: star dome, aurora, Pip mid-jump |
| 1280x720 | 1280-06-results.jpg | results | Sun-Gate opened results card (Cloudspan Wharf, ?world=w3&autoplay=1) |
| 390x844 | 390-01-title.jpg | title | world intro card, portrait |
| 390x844 | 390-02-early.jpg | early | autoplay setting off in Whispering Forest |
| 390x844 | 390-03-action.jpg | action | forest ledge beside the stone pillar |
| 390x844 | 390-04-boss.jpg | boss | Brambleback staggers (Hollow Palace) |
| 390x844 | 390-05-starfall.jpg | starfall | Starfall Garden with stars and aurora |
| 390x844 | 390-06-results.jpg | results | Sun-Gate opened results card |
| 1440x900 | card-2x.jpg | card | Starfall Garden autoplay: Pip mid-jump under the aurora and star dome, seeds and crystal slabs ahead |
| 720x450 | card-1x.jpg | card | card-2x.jpg downscaled (LANCZOS, q88) |

## Checked in the frames

- Full ?autoplay=1 run W1 -> W6 -> W1 -> W5 on the real GPU (140 frames): every world plays hands-free, results 3 s then next world
- Starfall world-swap fix: swapping into W6 used to kill the renderer (RENDERER_MOUNT_FAILED, blank for the rest of the session); now W5 -> W6 -> W1 swaps draw (183/159/265 draws, no errors)
- Hawk wings flap (wingR -0.45..0.68 rad, smooth sinusoid) and hawks circle smoothly (0.02-0.05 m per 88 ms sample)
- Pip stops against the start-plaza tree collider (x -1.579 = collider edge + Pip half-width)
- Pip plays idle/run clips and the jump overlay; grounded on every platform in the frames

## Known issues

- Autopilot takes hits and respawns several times in W1 and the W5 boss (loses all hearts once in W5) but always finishes
- Hawks circle high (y 2.6-5.3) and were not in the default camera's frame in these captures
