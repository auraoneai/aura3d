# Bunker Zero: final screenshots

Route: `/apps/showcase-bunker-zero/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA `capture_browser_scenario`, production build served from http://127.0.0.1:8790 (2026-11-18).

| Viewport | File | State | Meaning |
|---|---|---|---|
| 1280x720 | 1280-01-title.jpg | title | intro card (controls, Deploy) over the floor 1 opening |
| 1280x720 | 1280-02-early.jpg | early | ?autoplay=1: floor 1 Stone Gatehouse banner, first pistol shot down the corridor |
| 1280x720 | 1280-03-firing.jpg | firing | autopilot firing at a patrol guard (muzzle flash, no shell beside the pistol), 2/7 kills |
| 1280x720 | 1280-04-action.jpg | action | two soldiers aiming back at 4 s, hit direction ring |
| 1280x720 | 1280-05-killhouse.jpg | killhouse | Kill House mode from the top bar: patrol drone with spinning rotors over the lane |
| 1280x720 | 1280-06-floor6.jpg | floor6 | floor 6 Bunker Zero in autoplay: a guard down the silo corridor under the moon key, pistol firing (2026-11-19) |
| 1280x720 | 1280-07-results.jpg | results | campaign results card: six floors, medals, Restart Descent (2026-11-19) |
| 390x844 | 390-01-title.jpg | title | intro card, portrait |
| 390x844 | 390-02-early.jpg | early | ?autoplay=1 floor 1 start, banner |
| 390x844 | 390-03-action.jpg | action | guard aiming at close range, 3/7 kills |
| 390x844 | 390-04-killhouse.jpg | killhouse | Kill House: drone with rotors in its ducts, guard advancing |
| 390x844 | 390-05-floor6.jpg | floor6 | floor 6 autoplay, guard in the corridor, portrait |
| 390x844 | 390-06-results.jpg | results | results card, portrait |
| 1440x900 | card-2x.jpg | card | autoplay firing on floor 1: guard falling in the foreground, soldiers and crates down the hall |
| 720x450 | card-1x.jpg | card | card-2x.jpg downscaled (LANCZOS, q88) |

## Checked in the frames

- Patrol drone rotors sit in the ducts and change angle between frames (they were hidden after every floor start before this pass; fixed)
- No upright shell or tracer spike beside the pistol in 12 firing frames 100 ms apart (player bullet tracer held until 2-3 m out; enemy tracer kept 1.8 m clear of the camera)
- Soldiers animate (walk, aim, crouch, fall differ frame to frame); standing soldiers between bursts now play the alert stance instead of running in place
- ?autoplay=1 played floors 1-6 to results and looped back to floor 1 hands-free

Floor 6 and results frames (2026-11-19) were taken in headed Chrome on the same GPU through raw CDP (the QA hook needs page
evaluation: `?floor=6` then `unfreeze()` + `autopilot(true)`, and `campaignComplete()` for the results card).

## F6 perf pass (2026-11-19)

- Floor 6 after the 5 -> 6 elevator: 7-10 fps with a 5-10 s freeze before; 27-53 fps after (frame CPU 9-18 ms, draw calls
  35-134). Causes: the shadowed directional moon (a shadow pass and ~130 new programs on F6 only), floor surfaces added at
  runtime (every node write then rebuilt the scene list), the wet-floor program variants compiled mid-play, and model
  textures built on first draw. The moon is now the key spot over the hatch (`?godrays=1` restores the directional).
- Player-vs-enemy blocking (live enemies are solid); the autopilot backs off and strafes when pinned against a prop;
  a click or scroll under `?autoplay=1` no longer turns the pilot off. 5/5 headed autoplay boots left spawn and fought.

## Known issues

- Entering a new floor shows a black "DESCENDING · FLOOR N" card for ~2-8 s while that floor's textures are built
  (engine: mip chains are generated on the CPU through a 2D canvas; the time depends on machine load).
