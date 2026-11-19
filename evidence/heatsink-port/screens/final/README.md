# Ion Circuit: final screenshots

Route: `/apps/ion-circuit/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA `capture_browser_scenario`, production build served from http://127.0.0.1:8790 (2026-11-18).

| Viewport | File | State | Meaning |
|---|---|---|---|
| 1280x720 | 1280-01-title.jpg | title | start menu with strike objective and controls (P autopilot) |
| 1280x720 | 1280-02-early.jpg | early | ?autoplay=1: first seconds of the race under the gantry, 240 km/h |
| 1280x720 | 1280-03-action.jpg | action | 288 km/h, locking a red barrel target |
| 1280x720 | 1280-04-mid.jpg | mid | split section at 285 km/h: the median between the raised and lowered lanes is now a canyon-rock ridge, gunship target ahead |
| 1280x720 | 1280-05-original.jpg | original-look | ?look=original mode, autoplay, target barrel ahead |
| 1280x720 | 1280-06-ram.jpg | ram | the craft flies into a live sentry: it shatters on contact (flash + debris; kills 1/48). CDP helper, headed Chrome, same GPU, ?manual=1 reference replay step 362 |
| 390x844 | 390-01-title.jpg | title | start menu, portrait |
| 390x844 | 390-02-early.jpg | early | autoplay, first seconds of the race |
| 390x844 | 390-03-action.jpg | action | barrel target locked at 57 m |
| 390x844 | 390-04-mid.jpg | mid | split section: canyon-rock median ridge, gunship target ahead |
| 390x844 | 390-05-original.jpg | original-look | ?look=original, sentry target ahead |
| 390x844 | 390-06-ram.jpg | ram | same ram moment, portrait |
| 1440x900 | card-2x.jpg | card | autoplay at 288 km/h firing on a barrel target, gantry and ringed planet behind |
| 720x450 | card-1x.jpg | card | card-2x.jpg downscaled (LANCZOS, q88) |

## Checked in the frames

- ?autoplay=1 with no input: countdown, race, the craft holds the racing line at 278-295 km/h, shoots barrels and sentries (kills 5/48 by 36 s)
- First seconds: loading card with progress, then the countdown orbit; no frozen or blank frame
- Craft readable at the default camera; targets labelled; gate pylons stand outside the rails
- Audit 2026-11-19: craft rotors step 0.45-0.50 rad per frame (alias-free forward spin, measured); sentry/gunship duct fans spin (~30 rad/s, measured on the node)
- Split medians: the flat teal lid slab is now drawn in the canyon rock material (1280-04-mid / 390-04-mid retaken)
- Craft-vs-target collider (2026-11-19): a craft that touches a live target shatters it (operation.ts craftTouchesTarget; kill at half value, chain broken, movement untouched); 1280-06-ram / 390-06-ram
- Countdown (2026-11-19): boot warms the sweep poses and flash-light variants; on the real GPU 0 programs compile after boot (was 8 at the countdown + ~46 on the first hit/kill), no countdown stall

## Known issues

- 390x844: when the objective line wraps to 4 lines ("NO TARGETS AHEAD ..."), the district banner (absolute top 172px from an older style block in apps/showcase-heatsink-port/index.html) overlaps it (390-06-ram)
- Craft and target fans too small at the chase camera to judge spin by eye; spin verified from node transforms
- ?look=original craft has no separate rotor nodes (baked Idol ducts are static)
